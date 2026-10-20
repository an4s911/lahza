// Finds the math in a note, top to bottom: variables, results to keep up to
// date, "=" waiting for an answer, errors and hints. Offsets are into the
// whole note text.

import {
	CalcError,
	CONSTANTS,
	evaluate,
	formatNumber,
	NAME,
	type Node,
	parseExpression,
	percentHints,
	RESERVED,
	type Span,
	variables,
} from "./calc.ts";

export interface VarMark extends Span {
	name: string;
	/** Value at this point in the note, if it has one. */
	value?: number;
}

export interface Message extends Span {
	message: string;
}

export interface Query {
	/** Where the answer goes (end of the line). */
	at: number;
	/** Text to insert, with a leading space when the line ends right at "=". */
	insert: string;
	value: string;
}

export interface Edit {
	from: number;
	to: number;
	insert: string;
}

export interface NoteCalc {
	vars: VarMark[];
	results: Span[];
	queries: Query[];
	errors: Message[];
	hints: Message[];
	/** Results that are out of date. */
	edits: Edit[];
}

// List markers, quotes and task boxes before the math.
const PREFIX = /^[\t ]*(?:>[\t ]*)*(?:(?:[-*+]|\d+[.)])[\t ]+(?:\[.\][\t ]+)?)?/;
const FENCE = /^[\t ]*(?:```|~~~)/;
// A result: a number, optionally followed by a label such as "USD".
const RESULT = /^(\s*)(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)((?:\s+[^\s\d+\-*/^()%=,.×÷][^=]*)?)\s*$/;
const MATHY = /[\d+\-*/^%()×÷]/;
const INVISIBLE = /[\u200e\u200f]/g;

interface Segment {
	text: string;
	/** Offset of the segment in the note. */
	from: number;
}

export function analyzeNote(text: string): NoteCalc {
	const out: NoteCalc = { vars: [], results: [], queries: [], errors: [], hints: [], edits: [] };
	const lines = mathLines(text);
	const declaredAt = new Map<string, number>();
	lines.forEach((segments, i) => {
		const name = segments[0].text.trim();
		if (NAME.test(name) && segments[1].text.trim() !== "" && !declaredAt.has(name)) declaredAt.set(name, i);
	});

	const ctx: Context = { env: new Map(), broken: new Set(), declaredAt, lineNo: 0, out };
	lines.forEach((segments, lineNo) => {
		ctx.lineNo = lineNo;
		analyzeLine(segments, ctx);
	});
	return out;
}

interface Context {
	env: Map<string, number>;
	/** Variables whose own line has an error. */
	broken: Set<string>;
	/** First line (among math lines) that sets each name. */
	declaredAt: Map<string, number>;
	lineNo: number;
	out: NoteCalc;
}

function lookupIn(ctx: Context): (name: string, span: Span) => number {
	return (name, span) => {
		const value = ctx.env.get(name);
		if (value !== undefined) return value;
		if (ctx.broken.has(name)) throw new CalcError(`${name} has an error on its own line`, span);
		const later = ctx.declaredAt.get(name);
		throw new CalcError(later !== undefined && later > ctx.lineNo ? `${name} is set further down` : `${name} isn't set`, span);
	};
}

/** Each line with an "=" (outside frontmatter and code), split at "=". */
function mathLines(text: string): Segment[][] {
	const result: Segment[][] = [];
	let offset = 0;
	let inFence = false;
	let inFrontmatter = false;
	text.split("\n").forEach((raw, i) => {
		const lineStart = offset;
		offset += raw.length + 1;
		const line = raw.replace(/\r$/, "").replace(INVISIBLE, " ");
		if (i === 0 && line.trim() === "---") {
			inFrontmatter = true;
			return;
		}
		if (inFrontmatter) {
			if (line.trim() === "---") inFrontmatter = false;
			return;
		}
		if (FENCE.test(line)) {
			inFence = !inFence;
			return;
		}
		if (inFence || !line.includes("=") || /==|[<>!]=/.test(line)) return;

		const prefix = PREFIX.exec(line)?.[0].length ?? 0;
		const segments: Segment[] = [];
		let start = prefix;
		for (let j = prefix; j <= line.length; j++) {
			if (j === line.length || line[j] === "=") {
				segments.push({ text: line.slice(start, j), from: lineStart + start });
				start = j + 1;
			}
		}
		if (segments.length <= 3) result.push(segments);
	});
	return result;
}

function analyzeLine(segments: Segment[], ctx: Context): void {
	const { env, broken, out } = ctx;
	const first = segments[0].text.trim();
	const isName = NAME.test(first) && !RESERVED.has(first);
	const last = segments[segments.length - 1];
	const wantsAnswer = last.text.trim() === "";
	const result = wantsAnswer ? null : RESULT.exec(last.text);
	const lookup = lookupIn(ctx);

	if (segments.length === 3) {
		// name = expr =   /   name = expr = result
		if (!NAME.test(first) || !(wantsAnswer || result)) return;
		const value = declare(first, segments[0], segments[1], ctx);
		if (value !== null) answer(value, last, result, out);
		return;
	}

	if (isName && (wantsAnswer || (result && (env.has(first) || broken.has(first))))) {
		// "name =", or "name = 1,300" once name is set: shows the variable's value.
		const span = nameSpan(segments[0]);
		if (!env.has(first) && !broken.has(first) && !ctx.declaredAt.has(first)) return; // just a word
		try {
			const value = lookup(first, span);
			out.vars.push({ ...span, name: first, value });
			answer(value, last, result, out);
		} catch (e) {
			if (!(e instanceof CalcError)) throw e;
			out.vars.push({ ...span, name: first });
			out.errors.push({ ...span, message: e.message });
		}
		return;
	}

	if (NAME.test(first)) {
		// name = expr
		declare(first, segments[0], segments[1], ctx);
		return;
	}

	// expr =   /   expr = result
	if (!wantsAnswer && !result) return;
	const parsed = tryParse(segments[0], env);
	if (!parsed) return;
	const value = run(parsed, segments[0], lookup, out);
	if (value !== null) answer(value, last, result, out);
}

/** Sets a variable from an expression. Returns its value, or null if the line isn't math or has an error. */
function declare(name: string, nameSeg: Segment, exprSeg: Segment, ctx: Context): number | null {
	const { env, broken, out } = ctx;
	const parsed = tryParse(exprSeg, env);
	if (!parsed) return null;
	const span = nameSpan(nameSeg);
	if (RESERVED.has(name)) {
		out.errors.push({
			...span,
			message: name === "x" ? '"x" means multiply; pick another name' : `"${name}" is built in; pick another name`,
		});
		return null;
	}
	const value = run(parsed, exprSeg, lookupIn(ctx), out);
	if (value === null) {
		env.delete(name);
		broken.add(name);
		out.vars.push({ ...span, name });
		return null;
	}
	env.set(name, value);
	broken.delete(name);
	out.vars.push({ ...span, name, value });
	return value;
}

function nameSpan(segment: Segment): Span {
	const lead = segment.text.length - segment.text.trimStart().length;
	const from = segment.from + lead;
	return { from, to: from + segment.text.trim().length };
}

/** Parses a segment, or returns null when it doesn't look like math at all. Errors are kept for mathy text. */
function tryParse(segment: Segment, env: Map<string, number>): { node: Node } | { error: CalcError } | null {
	try {
		const node = parseExpression(segment.text);
		const looksMathy =
			MATHY.test(segment.text) ||
			variables(node).some((v) => env.has(v.name)) ||
			(node.kind === "var" && node.name in CONSTANTS);
		return looksMathy ? { node } : null;
	} catch (e) {
		if (!(e instanceof CalcError)) throw e;
		// Stuck on a word, as in "Lunch with Ali 12 + 4": a sentence, not math.
		const stuckOnWord = /^[A-Za-z_]/.test(segment.text.slice(e.span.from, e.span.to));
		return MATHY.test(segment.text) && !stuckOnWord ? { error: e } : null;
	}
}

/** Evaluates, recording variables, hints and errors. Null on error. */
function run(
	parsed: { node: Node } | { error: CalcError },
	segment: Segment,
	lookup: (name: string, span: Span) => number,
	out: NoteCalc,
): number | null {
	const abs = (span: Span): Span => ({ from: segment.from + span.from, to: segment.from + span.to });
	if ("error" in parsed) {
		out.errors.push({ ...abs(parsed.error.span), message: parsed.error.message });
		return null;
	}
	const { node } = parsed;
	for (const v of variables(node)) {
		let value: number | undefined;
		try {
			value = lookup(v.name, v);
		} catch {
			value = undefined;
		}
		out.vars.push({ ...abs(v), name: v.name, value });
	}
	for (const hint of percentHints(node, segment.text)) out.hints.push({ ...abs(hint), message: hint.message });
	try {
		return evaluate(node, lookup);
	} catch (e) {
		if (!(e instanceof CalcError)) throw e;
		const span = e.span.from === e.span.to ? { from: node.from, to: node.to } : e.span;
		out.errors.push({ ...abs(span), message: e.message });
		return null;
	}
}

/** Records the answer for the last segment: a suggestion after "=", or an existing result to keep current. */
function answer(value: number, last: Segment, result: RegExpExecArray | null, out: NoteCalc): void {
	const text = formatNumber(value);
	if (!result) {
		const endsWithSpace = /\s$/.test(last.text);
		out.queries.push({ at: last.from + last.text.length, insert: endsWithSpace ? text : ` ${text}`, value: text });
		return;
	}
	const from = last.from + result[1].length;
	const to = from + result[2].length;
	out.results.push({ from, to });
	if (result[2] !== text) out.edits.push({ from, to, insert: text });
}
