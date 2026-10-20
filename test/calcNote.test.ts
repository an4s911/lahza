import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeNote, type Edit } from "../src/calcNote.ts";

function apply(text: string, edits: Edit[]): string {
	return [...edits].sort((a, b) => b.from - a.from).reduce((t, e) => t.slice(0, e.from) + e.insert + t.slice(e.to), text);
}

const at = (text: string, span: { from: number; to: number }) => text.slice(span.from, span.to);

// A budget note in the format Apple Notes exports (U+200E before " = result").
const budget = `Monthly budget
- transport = 500
- phone = 400
- dues = 150
- water = 250
- soap = 0
- haircut = 100
- bills
    - waterBill = 200
    - electricityBill = 300
    - internetBill = 400
- subscriptions
    - music = 60
- other = 100


bills = waterBill + electricityBill + internetBill
bills \u200e = 900

otherBills = dues + phone + music
otherBills \u200e = 610

allBills = bills + otherBills
allBills \u200e = 1,510

otherPayments = water + haircut + soap
otherPayments \u200e = 350

keepAside = allBills + otherPayments + other + transport
keepAside \u200e = 2,460

dailyFood = (20 x 30)
dailyFood \u200e = 600
saving = 0

totalNeeded = keepAside + dailyFood + saving \u200e = 3,060

rate = 7

totalInUsd = (totalNeeded / rate) + 15 \u200e = 452.1429 USD

totalInUsd - 15 \u200e = 437.1429
`;

test("the budget note works as written", () => {
	const calc = analyzeNote(budget);
	assert.deepEqual(calc.errors, []);
	assert.deepEqual(calc.queries, []);
	// Only the 4-decimal results change, to 2 decimals; the "USD" label stays.
	const updated = apply(budget, calc.edits);
	assert.match(updated, /= 452\.14 USD\n/);
	assert.match(updated, /= 437\.14\n/);
	assert.equal(calc.edits.length, 2);
	assert.equal(calc.vars.find((v) => v.name === "totalNeeded")?.value, 3060);
	// "- bills" is just text.
	assert.ok(!calc.vars.some((v) => at(budget, v) === "bills" && v.from < budget.indexOf("- subscriptions")));
});

test("changing a variable updates every result that uses it", () => {
	const before = analyzeNote(budget);
	const changed = apply(budget, before.edits).replace("- waterBill = 200", "- waterBill = 300");
	const updated = apply(changed, analyzeNote(changed).edits);
	assert.match(updated, /bills \u200e = 1,000\n/);
	assert.match(updated, /allBills \u200e = 1,610\n/);
	assert.match(updated, /saving \u200e = 3,160\n/);
	assert.deepEqual(analyzeNote(updated).edits, []);
});

test("a trailing = asks for the answer", () => {
	const text = "a = 2\nb = a * 3 =\na + b=\nb =\n- c = 15% of 200 = \n";
	const { queries, errors } = analyzeNote(text);
	assert.deepEqual(errors, []);
	assert.deepEqual(
		queries.map((q) => [q.insert, text.slice(0, q.at).split("\n").length]),
		[
			[" 6", 2],
			[" 8", 3],
			[" 6", 4],
			["30", 5],
		],
	);
});

test("results on the same line as the formula stay current", () => {
	const text = "rent = 1200\nfood = 450\nmonthly = rent + food = 1,000\nmonthly * 12 = 1\n";
	const updated = apply(text, analyzeNote(text).edits);
	assert.equal(updated, "rent = 1200\nfood = 450\nmonthly = rent + food = 1,650\nmonthly * 12 = 19,800\n");
});

test("variables are marked with their values", () => {
	const text = "rent = 1200\ntotal = rent * 2\n";
	const vars = analyzeNote(text).vars.map((v) => [at(text, v), v.value]);
	assert.deepEqual(vars, [
		["rent", 1200],
		["rent", 1200],
		["total", 2400],
	]);
});

test("errors for unknown or later variables", () => {
	const text = "a = b + 1\nb = 2\nc = d * 2 =\nd =\n";
	const errors = analyzeNote(text).errors.map((e) => [at(text, e), e.message]);
	assert.deepEqual(errors, [
		["b", "b is set further down"],
		["d", "d isn't set"],
	]);
	const text2 = "a = 1\nb = a + zz =\nb + 1 =\n";
	assert.deepEqual(
		analyzeNote(text2).errors.map((e) => [at(text2, e), e.message]),
		[
			["zz", "zz isn't set"],
			["b", "b has an error on its own line"],
		],
	);
});

test("prose, code and properties are left alone", () => {
	const text = [
		"---",
		"created: 2026-10-20T14:30",
		"total = 5 + 5 =",
		"---",
		"mood = good",
		"Lunch with Ali 12 + 4 =",
		"Summary =",
		"```",
		"x = 1 + 1 =",
		"```",
		"if a == b",
		"",
	].join("\n");
	const calc = analyzeNote(text);
	assert.deepEqual(calc, { vars: [], results: [], queries: [], errors: [], edits: [] });
});

test("reserved names, and strict percent", () => {
	const text = "x = 5\nprice = 200 + 15%\n";
	const calc = analyzeNote(text);
	assert.deepEqual(calc.errors.map((e) => [at(text, e), e.message]), [["x", '"x" means multiply; pick another name']]);
	assert.equal(calc.vars.find((v) => v.name === "price")?.value, 200.15);
});

test("a variable can be built up from itself", () => {
	const text = "saving = 100\nsaving = saving + 50\nsaving =\n";
	assert.equal(analyzeNote(text).queries[0].insert, " 150");
});
