import assert from "node:assert/strict";
import { test } from "node:test";
import {
	cleanFolderPath,
	describeMessages,
	extractJson,
	fileMessages,
	parseDescribe,
	parseFile,
	truncate,
} from "../src/prompts.ts";

test("extracts JSON from fenced or chatty replies", () => {
	assert.deepEqual(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
	assert.deepEqual(extractJson('Sure! {"a": {"b": 2}} hope that helps'), { a: { b: 2 } });
	assert.equal(extractJson("no json here"), null);
	assert.equal(extractJson("{broken"), null);
});

test("parses describe replies and cleans the title", () => {
	assert.deepEqual(parseDescribe('{"title": "Pricing: next steps.", "description": " Options  for the pilot. "}'), {
		title: "Pricing next steps",
		description: "Options for the pilot.",
	});
	assert.equal(parseDescribe('{"title": 3}'), null);
	assert.equal(parseDescribe("nope"), null);
});

test("cleans proposed folder paths", () => {
	assert.equal(cleanFolderPath("/work/new-client/"), "work/new-client");
	assert.equal(cleanFolderPath("work/../a:b"), "work/ab");
	assert.equal(cleanFolderPath("  "), "");
});

test("keeps only existing, non-inbox folder suggestions", () => {
	const existing = new Set(["work", "work/client", "personal/ideas", "inbox/old"]);
	const reply = JSON.stringify({
		suggestions: [
			{ folder: "work/client", reason: "Mentions the client" },
			{ folder: "work/made-up", reason: "x" },
			{ folder: "inbox/old", reason: "x" },
			{ folder: "/work/client/", reason: "duplicate" },
			{ folder: "personal/ideas", reason: "An idea" },
		],
		newFolder: "work/new-client",
	});
	assert.deepEqual(parseFile(reply, existing, "inbox"), {
		suggestions: [
			{ folder: "work/client", reason: "Mentions the client" },
			{ folder: "personal/ideas", reason: "An idea" },
		],
		newFolder: "work/new-client",
	});
});

test("treats an existing 'new' folder as a suggestion and ignores inbox proposals", () => {
	const existing = new Set(["work"]);
	assert.deepEqual(parseFile('{"suggestions": [], "newFolder": "work"}', existing, "inbox"), {
		suggestions: [{ folder: "work", reason: "" }],
		newFolder: null,
	});
	assert.deepEqual(parseFile('{"newFolder": "inbox/x"}', existing, "inbox"), { suggestions: [], newFolder: null });
	assert.deepEqual(parseFile("garbage", existing, "inbox"), { suggestions: [], newFolder: null });
});

test("prompts include the note and folders, truncated", () => {
	assert.equal(truncate("abcdef", 3), "abc\n[…truncated]");
	const [, user] = describeMessages("x".repeat(10), 5);
	assert.equal(user.content, "xxxxx\n[…truncated]");
	const [, fileUser] = fileMessages("note body", [{ path: "work", examples: ["Kickoff — first call"] }, { path: "study", examples: [] }], 100);
	assert.match(fileUser.content, /work\n  - Kickoff — first call\nstudy\n  \(empty\)/);
	assert.match(fileUser.content, /Note to file:\nnote body/);
});
