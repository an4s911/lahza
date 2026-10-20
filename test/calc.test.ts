import assert from "node:assert/strict";
import { test } from "node:test";
import { CalcError, evaluate, formatNumber, parseExpression } from "../src/calc.ts";

const calc = (src: string, vars: Record<string, number> = {}) =>
	evaluate(parseExpression(src), (name, span) => {
		if (name in vars) return vars[name];
		throw new CalcError(`${name} isn't set`, span);
	});

test("arithmetic follows the usual order", () => {
	assert.equal(calc("1 + 2 * 3"), 7);
	assert.equal(calc("(1 + 2) * 3"), 9);
	assert.equal(calc("10 - 4 - 3"), 3);
	assert.equal(calc("2 ^ 3 ^ 2"), 512);
	assert.equal(calc("-2 ^ 2"), -4);
	assert.equal(calc("2 ^ -1"), 0.5);
	assert.equal(calc("7 ÷ 2 × 4 − 1"), 13);
});

test("x multiplies between values", () => {
	assert.equal(calc("(230 x 26)"), 5980);
	assert.equal(calc("230x26"), 5980);
	assert.equal(calc("a x b", { a: 3, b: 4 }), 12);
});

test("numbers can have grouping commas", () => {
	assert.equal(calc("1,300 + 1"), 1301);
	assert.equal(calc("1,234,567.5"), 1234567.5);
	assert.equal(calc("max(1, 300)"), 300);
	assert.equal(calc(".5 + 1"), 1.5);
});

test("percent is strict: 15% is 0.15", () => {
	assert.equal(calc("15%"), 0.15);
	assert.equal(calc("200 + 15%"), 200.15);
	assert.equal(calc("15% of 200"), 30);
	assert.equal(calc("200 + 15% of 200"), 230);
	assert.equal(formatNumber(calc("200 * 115%")), "230");
	assert.equal(calc("15% of 200 + 10"), 40);
});

test("functions and constants", () => {
	assert.equal(calc("sqrt(16) + abs(-2)"), 6);
	assert.equal(calc("round(2.567, 1)"), 2.6);
	assert.equal(calc("round(2.5)"), 3);
	assert.equal(calc("min(3, 1, 2) + max(4, 5)"), 6);
	assert.ok(Math.abs(calc("pi") - Math.PI) < 1e-12);
});

test("variables are case-sensitive", () => {
	assert.equal(calc("phoneRecharge + water_bill", { phoneRecharge: 650, water_bill: 300 }), 950);
	assert.throws(() => calc("phonerecharge", { phoneRecharge: 650 }), /phonerecharge isn't set/);
});

test("errors point at the problem", () => {
	const err = (src: string) => {
		try {
			calc(src);
		} catch (e) {
			assert.ok(e instanceof CalcError);
			return { message: e.message, text: src.slice(e.span.from, e.span.to) };
		}
		assert.fail(`no error for ${src}`);
	};
	assert.deepEqual(err("1 / (2 - 2)"), { message: "Can't divide by zero", text: "(2 - 2)" });
	assert.equal(err("(1 + 2").message, "Missing )");
	assert.equal(err("1 +").message, "Unfinished math");
	assert.equal(err("2 of 3").message, '"of" goes after a percent, like 15% of 200');
	assert.equal(err("sqrt(1, 2)").message, "sqrt takes 1 value");
	assert.equal(err("sqrt(-1)").message, "No real result");
	assert.equal(err("1 & 2").message, 'Can\'t read "&"');
});

test("formats with 2 decimals and grouping", () => {
	assert.equal(formatNumber(1300), "1,300");
	assert.equal(formatNumber(808.0833333), "808.08");
	assert.equal(formatNumber(1234567.5), "1,234,567.5");
	assert.equal(formatNumber(-2237), "-2,237");
	assert.equal(formatNumber(0.1 + 0.2), "0.3");
	assert.equal(formatNumber(0.0042), "0.0042");
	assert.equal(formatNumber(-0.001), "-0.001");
	assert.equal(formatNumber(-0.004 + 0.004), "0");
	assert.equal(formatNumber(999.999), "1,000");
});
