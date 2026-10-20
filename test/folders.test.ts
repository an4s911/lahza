import assert from "node:assert/strict";
import { test } from "node:test";
import { folderOptions } from "../src/folders.ts";

const folders = ["inbox", "personal", "work", "work/client"];
const names = (q: string, current: string | null = null) =>
	folderOptions(folders, "inbox", current, q).map((o) => (o.create ? `+${o.folder}` : o.folder));

test("inbox comes first, then the current folder, then the rest", () => {
	assert.deepEqual(names("", "work/client"), ["inbox", "work/client", "personal", "work"]);
	assert.deepEqual(names("", "inbox"), ["inbox", "personal", "work", "work/client"]);
});

test("filters by the query", () => {
	assert.deepEqual(names("work"), ["work", "work/client"]);
	assert.deepEqual(names("CLIENT"), ["work/client", "+CLIENT"]);
});

test("offers to create a folder that doesn't exist", () => {
	assert.deepEqual(names("work/new-client/"), ["+work/new-client"]);
	assert.deepEqual(names("work"), ["work", "work/client"]);
});

test("lists a missing inbox as one to create", () => {
	assert.deepEqual(
		folderOptions(["work"], "inbox", null, "").map((o) => [o.folder, o.create]),
		[["inbox", true], ["work", false]],
	);
});
