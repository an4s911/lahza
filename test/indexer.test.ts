import assert from "node:assert/strict";
import { test } from "node:test";
import { type FolderNode, GENERATED_NOTICE, renderIndex, sortNotes } from "../src/indexer.ts";

const note = (folder: string, basename: string, description?: string, sortKey?: string) => ({
	linkPath: folder ? `${folder}/${basename}` : basename,
	basename,
	folder,
	description,
	sortKey: sortKey ?? basename.slice(0, 10),
	date: /^\d{4}-\d{2}-\d{2}/.test(basename) ? basename.slice(0, 10) : undefined,
});

const work: FolderNode = {
	path: "work",
	name: "work",
	folders: [{ path: "work/client", name: "client", folders: [], notes: [note("work/client", "2026-10-01 Kickoff")] }],
	notes: [
		note("work", "2026-10-02 Planning", "Quarter planning."),
		note("work", "2026-10-20 Pricing call", "Pricing options for the pilot."),
		note("work", "Running notes", undefined, "2026-10-10"),
	],
};

const opts = { indexName: "index", recentCount: 2, rootTitle: "Vault" };

test("sorts notes newest first", () => {
	assert.deepEqual(
		sortNotes(work.notes).map((n) => n.basename),
		["2026-10-20 Pricing call", "Running notes", "2026-10-02 Planning"],
	);
});

test("renders a folder index", () => {
	const text = renderIndex(work, opts);
	assert.equal(
		text,
		[
			"# work",
			"",
			GENERATED_NOTICE,
			"",
			"## Folders",
			"",
			"- [[work/client/index|client]] · 1 note",
			"",
			"## Notes",
			"",
			"- 2026-10-20 · [[work/2026-10-20 Pricing call|Pricing call]] — Pricing options for the pilot.",
			"- [[work/Running notes|Running notes]]",
			"- 2026-10-02 · [[work/2026-10-02 Planning|Planning]] — Quarter planning.",
			"",
		].join("\n"),
	);
});

test("root index shows recent notes across folders", () => {
	const root: FolderNode = { path: "", name: "Vault", folders: [work], notes: [note("", "2026-09-01")] };
	const text = renderIndex(root, opts);
	assert.match(text, /^# Vault\n/);
	assert.match(text, /## Recent\n\n- 2026-10-20 · \[\[work\/2026-10-20 Pricing call\|Pricing call\]\] — Pricing options for the pilot\. \*\(work\)\*\n- \[\[work\/Running notes\|Running notes\]\] \*\(work\)\*\n/);
	assert.match(text, /- \[\[work\/index\|work\]\] · 4 notes/);
	assert.match(text, /## Notes\n\n- \[\[2026-09-01\|2026-09-01\]\]\n/);
});

test("empty folders say so", () => {
	assert.match(renderIndex({ path: "study", name: "study", folders: [], notes: [] }, opts), /\*No notes yet\.\*/);
});
