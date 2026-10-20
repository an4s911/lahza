// In-note math in the editor: colors variables and results, shows the answer
// after a trailing "=" (Enter or Tab inserts it), keeps results current as
// variables change, and shows values and errors in tooltips.

import { Annotation, EditorState, type Extension, Prec, type Range, StateField } from "@codemirror/state";
import {
	Decoration,
	EditorView,
	hoverTooltip,
	keymap,
	showTooltip,
	type Tooltip,
	type TooltipView,
	WidgetType,
} from "@codemirror/view";
import { formatNumber, type Span } from "./calc.ts";
import { analyzeNote, type NoteCalc } from "./calcNote.ts";

export interface CalcOptions {
	/** Insert answers as soon as "=" is typed, instead of suggesting them. */
	insert: () => boolean;
	/** Show tooltips for the item under the cursor (no hover on touch screens). */
	cursorTooltips: boolean;
}

const ownEdit = Annotation.define<boolean>();

const calcField = StateField.define<NoteCalc>({
	create: (state) => analyzeNote(state.doc.toString()),
	update: (value, tr) => (tr.docChanged ? analyzeNote(tr.newDoc.toString()) : value),
});

class GhostWidget extends WidgetType {
	private text: string;

	constructor(text: string) {
		super();
		this.text = text;
	}

	eq(other: GhostWidget): boolean {
		return other.text === this.text;
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = "ns-calc-ghost";
		el.textContent = this.text;
		el.setAttribute("aria-label", "Enter or Tab to insert");
		return el;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

const mark = (cls: string) => Decoration.mark({ class: cls });
const VAR = mark("ns-calc-var");
const RESULT = mark("ns-calc-result");
const ERROR = mark("ns-calc-error");

function decorations(insert: () => boolean) {
	return EditorView.decorations.compute([calcField, "selection"], (state) => {
		const calc = state.field(calcField);
		const ranges: Range<Decoration>[] = [];
		const add = (spans: Span[], deco: Decoration) => {
			for (const s of spans) if (s.from < s.to) ranges.push(deco.range(s.from, s.to));
		};
		add(calc.vars, VAR);
		add(calc.results, RESULT);
		add(calc.errors, ERROR);
		if (!insert()) {
			const line = state.doc.lineAt(state.selection.main.head);
			for (const q of calc.queries) {
				if (q.at >= line.from && q.at <= line.to) {
					ranges.push(Decoration.widget({ widget: new GhostWidget(q.insert), side: 1 }).range(q.at));
				}
			}
		}
		return Decoration.set(ranges, true);
	});
}

/** Inserts the suggested answer when the cursor is right after the "=". */
function accept(view: EditorView): boolean {
	const sel = view.state.selection.main;
	if (!sel.empty) return false;
	const query = view.state.field(calcField).queries.find((q) => q.at === sel.head);
	if (!query) return false;
	view.dispatch({
		changes: { from: query.at, insert: query.insert },
		selection: { anchor: query.at + query.insert.length },
		userEvent: "input.complete",
	});
	return true;
}

/** Results that are out of date, except one the cursor is in (you may be typing it). */
function staleResults(calc: NoteCalc, head: number) {
	return calc.edits.filter((e) => head < e.from || head > e.to);
}

/**
 * Keeps results current: an edit that changes a variable also rewrites the
 * results that use it, in the same transaction (one undo step).
 */
function keepResultsCurrent(insert: () => boolean) {
	return EditorState.transactionFilter.of((tr) => {
		if (!tr.docChanged || tr.annotation(ownEdit) || tr.isUserEvent("undo") || tr.isUserEvent("redo")) return tr;
		const text = tr.newDoc.toString();
		if (!text.includes("=")) return tr;
		const calc = analyzeNote(text);
		const head = tr.newSelection.main.head;
		const changes = staleResults(calc, head);
		if (insert() && tr.isUserEvent("input.type")) {
			const query = calc.queries.find((q) => q.at === head);
			if (query) changes.push({ from: query.at, to: query.at, insert: query.insert });
		}
		if (!changes.length) return tr;
		return [tr, { changes, sequential: true, annotations: ownEdit.of(true) }];
	});
}

/** When the cursor leaves a result it skipped, bring that result up to date. */
const updateOnLeave = EditorView.updateListener.of((update) => {
	if (!update.selectionSet || update.docChanged) return;
	const changes = staleResults(update.state.field(calcField), update.state.selection.main.head);
	if (!changes.length) return;
	const view = update.view;
	window.setTimeout(() => {
		// Re-check: the document may have changed since.
		const current = staleResults(view.state.field(calcField), view.state.selection.main.head);
		if (current.length) view.dispatch({ changes: current, annotations: ownEdit.of(true) });
	}, 0);
});

function describeAt(calc: NoteCalc, pos: number, inclusive: boolean): { span: Span; lines: string[] } | null {
	const hit = (s: Span) => (inclusive ? s.from <= pos && pos <= s.to : s.from < pos && pos <= s.to);
	const lines: string[] = [];
	let span: Span | null = null;
	const take = (s: Span, text: string) => {
		lines.push(text);
		span = span ? { from: Math.min(span.from, s.from), to: Math.max(span.to, s.to) } : s;
	};
	for (const e of calc.errors) if (hit(e)) take(e, e.message);
	for (const v of calc.vars) {
		if (hit(v) && !lines.length) take(v, v.value === undefined ? `${v.name}: no value` : `${v.name} = ${formatNumber(v.value)}`);
	}
	return span ? { span, lines } : null;
}

function tooltipView(lines: string[]): TooltipView {
	const dom = document.createElement("div");
	dom.className = "ns-calc-tooltip";
	for (const line of lines) dom.createDiv({ text: line });
	// CodeMirror's tooltip box defaults to a light background; mark it so styles.css can theme it.
	return { dom, mount: () => dom.closest(".cm-tooltip")?.classList.add("ns-calc-tooltip-box") };
}

const hover = hoverTooltip((view, pos) => {
	const found = describeAt(view.state.field(calcField), pos, true);
	if (!found) return null;
	return { pos: found.span.from, end: found.span.to, above: true, create: () => tooltipView(found.lines) };
});

const cursorTooltip = showTooltip.compute([calcField, "selection"], (state): Tooltip | null => {
	const sel = state.selection.main;
	if (!sel.empty) return null;
	const found = describeAt(state.field(calcField), sel.head, false);
	if (!found) return null;
	return { pos: found.span.from, above: true, create: () => tooltipView(found.lines) };
});

export function calcExtension(options: CalcOptions): Extension {
	return [
		calcField,
		decorations(options.insert),
		keepResultsCurrent(options.insert),
		updateOnLeave,
		Prec.highest(
			keymap.of([
				{ key: "Enter", run: accept },
				{ key: "Tab", run: accept },
			]),
		),
		options.cursorTooltips ? cursorTooltip : hover,
	];
}
