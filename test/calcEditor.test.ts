import assert from "node:assert/strict";
import { test } from "node:test";
import { history, undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { calcExtension } from "../src/calcEditor.ts";

const make = (doc: string, insert = false) =>
	EditorState.create({ doc, extensions: calcExtension({ insert: () => insert, cursorTooltips: false }) });

/** Replaces the first `find` with `replace`, cursor after it, like typing. */
function type(state: EditorState, find: string, replace: string, userEvent = "input.type") {
	const from = state.doc.toString().indexOf(find);
	const to = from + find.length;
	return state.update({
		changes: { from, to, insert: replace },
		selection: EditorSelection.cursor(from + replace.length),
		userEvent,
	}).state;
}

const doc = "rent = 1200\nfood = 450\nmonthly = rent + food = 1,650\nmonthly * 12 = 19,800\n";

test("editing a variable updates results in the same step", () => {
	const state = type(make(doc), "1200", "1300");
	assert.equal(state.doc.toString(), "rent = 1300\nfood = 450\nmonthly = rent + food = 1,750\nmonthly * 12 = 21,000\n");
});

test("undo puts the variable and its results back together", () => {
	let state = EditorState.create({
		doc,
		extensions: [history(), calcExtension({ insert: () => false, cursorTooltips: false })],
	});
	state = type(state, "1200", "1300");
	undo({ state, dispatch: (tr) => (state = tr.state) });
	assert.equal(state.doc.toString(), doc);
});

test("a result you're typing in is left alone", () => {
	const state = type(make("a = 5\nb = a + 1 = 6\n"), "= 6", "= 60");
	assert.equal(state.doc.toString(), "a = 5\nb = a + 1 = 60\n");
});

test("insert mode adds the answer when = is typed", () => {
	let state = make("a = 5\na * 2 \n", true);
	state = type(state, "a * 2 ", "a * 2 =");
	assert.equal(state.doc.toString(), "a = 5\na * 2 = 10\n");
});

test("suggest mode doesn't insert by itself", () => {
	const state = type(make("a = 5\na * 2 \n"), "a * 2 ", "a * 2 =");
	assert.equal(state.doc.toString(), "a = 5\na * 2 =\n");
});
