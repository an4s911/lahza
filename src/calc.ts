// Expressions for in-note math: numbers, variables, + - * / x ^ %, "of",
// parentheses and a few functions. Pure: offsets are relative to the input.

export interface Span {
	from: number;
	to: number;
}

export type Node =
	| ({ kind: "num"; value: number } & Span)
	| ({ kind: "var"; name: string } & Span)
	| ({ kind: "percent"; arg: Node } & Span)
	| ({ kind: "neg"; arg: Node } & Span)
	| ({ kind: "bin"; op: "+" | "-" | "*" | "/" | "^" | "of"; left: Node; right: Node } & Span)
	| ({ kind: "call"; name: string; args: Node[] } & Span);

export class CalcError extends Error {
	span: Span;
	constructor(message: string, span: Span) {
		super(message);
		this.span = span;
	}
}

export const FUNCTIONS: Record<string, { min: number; max: number; run: (...args: number[]) => number }> = {
	sqrt: { min: 1, max: 1, run: Math.sqrt },
	abs: { min: 1, max: 1, run: Math.abs },
	round: {
		min: 1,
		max: 2,
		run: (n, digits = 0) => {
			const f = 10 ** Math.trunc(digits);
			return Math.round(n * f) / f;
		},
	},
	min: { min: 1, max: Infinity, run: Math.min },
	max: { min: 1, max: Infinity, run: Math.max },
};

export const CONSTANTS: Record<string, number> = { pi: Math.PI };

/** Words that can't be variable names. */
export const RESERVED = new Set([...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), "x", "of"]);

export const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Grouping commas only as "1,234,567": a comma in min(1, 2) needs the space.
const NUMBER = /^(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?|^\.\d+/;
const WORD = /^[A-Za-z_][A-Za-z0-9_]*/;
// "230x26": a number directly followed by x and a digit means multiply.
const NUMBER_TIMES = /^x(?=[\d.(])/;

type Token =
	| ({ t: "num"; value: number } & Span)
	| ({ t: "word"; text: string } & Span)
	| ({ t: "op"; text: string } & Span)
	| ({ t: "end" } & Span);

const OPS: Record<string, string> = { "×": "*", "·": "*", "÷": "/", "−": "-", "–": "-" };

function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (/\s|\u200e|\u200f/.test(ch)) {
			i++;
			continue;
		}
		const rest = src.slice(i);
		const num = NUMBER.exec(rest);
		if (num) {
			tokens.push({ t: "num", value: Number(num[0].replace(/,/g, "")), from: i, to: i + num[0].length });
			i += num[0].length;
			if (NUMBER_TIMES.test(src.slice(i))) {
				tokens.push({ t: "op", text: "*", from: i, to: i + 1 });
				i++;
			}
			continue;
		}
		const word = WORD.exec(rest);
		if (word) {
			tokens.push({ t: "word", text: word[0], from: i, to: i + word[0].length });
			i += word[0].length;
			continue;
		}
		if ("+-*/^%(),".includes(ch) || ch in OPS) {
			tokens.push({ t: "op", text: OPS[ch] ?? ch, from: i, to: i + 1 });
			i++;
			continue;
		}
		throw new CalcError(`Can't read "${ch}"`, { from: i, to: i + 1 });
	}
	tokens.push({ t: "end", from: src.length, to: src.length });
	return tokens;
}

class Parser {
	private tokens: Token[];
	private pos = 0;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	parse(): Node {
		if (this.peek().t === "end") throw new CalcError("Nothing to calculate", this.peek());
		const node = this.additive();
		const next = this.peek();
		if (next.t !== "end") throw new CalcError("Can't read this math", { from: next.from, to: next.to });
		return node;
	}

	private peek(): Token {
		return this.tokens[this.pos];
	}

	private next(): Token {
		return this.tokens[this.pos++];
	}

	private isOp(text: string): boolean {
		const t = this.peek();
		return t.t === "op" && t.text === text;
	}

	/** "x" between two values means multiply. */
	private isTimesWord(): boolean {
		const t = this.peek();
		return t.t === "word" && t.text === "x";
	}

	private additive(): Node {
		let left = this.multiplicative();
		while (this.isOp("+") || this.isOp("-")) {
			const op = (this.next() as { text: "+" | "-" }).text;
			const right = this.multiplicative();
			left = { kind: "bin", op, left, right, from: left.from, to: right.to };
		}
		return left;
	}

	private multiplicative(): Node {
		let left = this.unary();
		while (this.isOp("*") || this.isOp("/") || this.isTimesWord()) {
			const token = this.next();
			const op = token.t === "word" ? "*" : ((token as { text: "*" | "/" }).text);
			const right = this.unary();
			left = { kind: "bin", op, left, right, from: left.from, to: right.to };
		}
		return left;
	}

	private unary(): Node {
		if (this.isOp("-") || this.isOp("+")) {
			const token = this.next();
			const arg = this.unary();
			if ((token as { text: string }).text === "+") return arg;
			return { kind: "neg", arg, from: token.from, to: arg.to };
		}
		return this.power();
	}

	private power(): Node {
		const base = this.postfix();
		if (this.isOp("^")) {
			this.next();
			const exponent = this.unary();
			return { kind: "bin", op: "^", left: base, right: exponent, from: base.from, to: exponent.to };
		}
		return base;
	}

	private postfix(): Node {
		let node = this.primary();
		while (this.isOp("%")) {
			const token = this.next();
			node = { kind: "percent", arg: node, from: node.from, to: token.to };
		}
		const t = this.peek();
		if (t.t === "word" && t.text === "of") {
			if (node.kind !== "percent") throw new CalcError('"of" goes after a percent, like 15% of 200', t);
			this.next();
			const right = this.unary();
			node = { kind: "bin", op: "of", left: node, right, from: node.from, to: right.to };
		}
		return node;
	}

	private primary(): Node {
		const token = this.next();
		if (token.t === "num") return { kind: "num", value: token.value, from: token.from, to: token.to };
		if (token.t === "word") {
			if (token.text in FUNCTIONS && this.isOp("(")) return this.call(token);
			if (token.text === "x" || token.text === "of") throw new CalcError(`"${token.text}" needs a value before it`, token);
			return { kind: "var", name: token.text, from: token.from, to: token.to };
		}
		if (token.t === "op" && token.text === "(") {
			const inner = this.additive();
			const close = this.next();
			if (close.t !== "op" || close.text !== ")") throw new CalcError("Missing )", { from: token.from, to: close.from });
			return { ...inner, from: token.from, to: close.to } as Node;
		}
		if (token.t === "end") throw new CalcError("Unfinished math", token);
		throw new CalcError("Can't read this math", token);
	}

	private call(name: Token & { t: "word" }): Node {
		this.next(); // (
		const args: Node[] = [];
		if (!this.isOp(")")) {
			args.push(this.additive());
			while (this.isOp(",")) {
				this.next();
				args.push(this.additive());
			}
		}
		const close = this.next();
		if (close.t !== "op" || close.text !== ")") throw new CalcError("Missing )", { from: name.from, to: close.from });
		const fn = FUNCTIONS[name.text];
		const span = { from: name.from, to: close.to };
		if (args.length < fn.min || args.length > fn.max) {
			throw new CalcError(`${name.text} takes ${fn.min === fn.max ? fn.min : `${fn.min} or more`} value${fn.max === 1 ? "" : "s"}`, span);
		}
		return { kind: "call", name: name.text, args, ...span };
	}
}

export function parseExpression(src: string): Node {
	return new Parser(tokenize(src)).parse();
}

export type Lookup = (name: string, span: Span) => number;

export function evaluate(node: Node, lookup: Lookup): number {
	const value = evalNode(node, lookup);
	if (!Number.isFinite(value)) throw new CalcError(Number.isNaN(value) ? "No real result" : "Too big", node);
	return value;
}

function evalNode(node: Node, lookup: Lookup): number {
	switch (node.kind) {
		case "num":
			return node.value;
		case "var":
			return node.name in CONSTANTS ? CONSTANTS[node.name] : lookup(node.name, node);
		case "percent":
			return evalNode(node.arg, lookup) / 100;
		case "neg":
			return -evalNode(node.arg, lookup);
		case "call":
			return FUNCTIONS[node.name].run(...node.args.map((a) => evalNode(a, lookup)));
		case "bin": {
			const a = evalNode(node.left, lookup);
			const b = evalNode(node.right, lookup);
			switch (node.op) {
				case "+":
					return a + b;
				case "-":
					return a - b;
				case "*":
				case "of":
					return a * b;
				case "/":
					if (b === 0) throw new CalcError("Can't divide by zero", node.right);
					return a / b;
				case "^":
					return a ** b;
			}
		}
	}
}

/** Variable references in the expression, in order. */
export function variables(node: Node): (Node & { kind: "var" })[] {
	switch (node.kind) {
		case "var":
			return node.name in CONSTANTS ? [] : [node];
		case "num":
			return [];
		case "percent":
		case "neg":
			return variables(node.arg);
		case "call":
			return node.args.flatMap(variables);
		case "bin":
			return [...variables(node.left), ...variables(node.right)];
	}
}

/** "a + b%" and "a - b%": strict math gives a + b/100, which may not be what was meant. */
export function percentHints(node: Node, src: string): (Span & { message: string })[] {
	const hints: (Span & { message: string })[] = [];
	const walk = (n: Node) => {
		if (n.kind === "bin") {
			if ((n.op === "+" || n.op === "-") && n.right.kind === "percent" && n.left.kind !== "percent") {
				const pct = src.slice(n.right.from, n.right.to).trim();
				const base = src.slice(n.left.from, n.left.to).trim();
				const value =
					n.right.arg.kind === "num" ? String(Number((n.right.arg.value / 100).toPrecision(12))) : `${pct.replace(/%$/, "")} ÷ 100`;
				hints.push({
					from: n.right.from,
					to: n.right.to,
					message: `${pct} here means ${value}. Did you mean ${pct} of ${needsParens(n.left) ? `(${base})` : base}?`,
				});
			}
			walk(n.left);
			walk(n.right);
		} else if (n.kind === "percent" || n.kind === "neg") walk(n.arg);
		else if (n.kind === "call") n.args.forEach(walk);
	};
	walk(node);
	return hints;
}

function needsParens(node: Node): boolean {
	return node.kind === "bin" && node.op !== "^" && node.op !== "of";
}

/** Rounds to 2 decimals with grouping commas: 1,300 · 808.08 · -0.5. Tiny values keep 2 significant digits. */
export function formatNumber(value: number): string {
	if (Object.is(value, -0)) value = 0;
	let text: string;
	if (value !== 0 && Math.abs(value) < 0.005) {
		text = Number(value.toPrecision(2)).toString();
		if (/e/.test(text)) return text;
	} else {
		text = (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
	}
	const negative = text.startsWith("-");
	const [int, frac] = text.replace("-", "").split(".");
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const result = `${negative ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
	return result === "-0" ? "0" : result;
}
