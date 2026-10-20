import assert from "node:assert/strict";
import { test } from "node:test";
import { describeDecision, stripFrontmatter } from "../src/content.ts";

test("strips frontmatter only at the top", () => {
	assert.equal(stripFrontmatter("---\ndescription: x\n---\nBody\n"), "Body\n");
	assert.equal(stripFrontmatter("---\r\na: 1\r\n---\r\nBody"), "Body");
	assert.equal(stripFrontmatter("Body\n---\na\n---\n"), "Body\n---\na\n---\n");
	assert.equal(stripFrontmatter("---\na: 1\n---"), "");
});

const base = { bodyLength: 500, hasDescription: true, untitled: false, minLength: 80, changeRatio: 0.3 };

test("skips short notes", () => {
	assert.equal(describeDecision({ ...base, bodyLength: 20, hasDescription: false }), "skip");
});

test("describes notes without a description or title", () => {
	assert.equal(describeDecision({ ...base, hasDescription: false }), "describe");
	assert.equal(describeDecision({ ...base, untitled: true, lastLength: 500 }), "describe");
});

test("records a baseline for notes described on another device", () => {
	assert.equal(describeDecision({ ...base }), "baseline");
});

test("re-describes only after a large change", () => {
	assert.equal(describeDecision({ ...base, lastLength: 450 }), "skip");
	assert.equal(describeDecision({ ...base, lastLength: 300 }), "describe");
	assert.equal(describeDecision({ ...base, bodyLength: 300, lastLength: 500 }), "describe");
});
