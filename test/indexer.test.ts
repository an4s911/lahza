import assert from "node:assert/strict";
import { test } from "node:test";
import { type FolderNode, GENERATED_NOTICE, renderIndex, sortNotes } from "../src/indexer.ts";

const note = (folder: string, basename: string, created: string, modified: string, description?: string) => ({
	linkPath: folder ? `${folder}/${basename}` : basename,
	basename,
	folder,
	description,
	created,
	modified,
});

const work: FolderNode = {
	path: "work",
	name: "work",
	folders: [
		{
			path: "work/client",
			name: "client",
			folders: [],
			notes: [note("work/client", "Kickoff", "2026-10-01T09:00", "2026-10-22T10:00")],
		},
	],
	notes: [
		note("work", "Planning", "2026-10-02T12:00", "2026-10-02T12:30", "Quarter planning."),
		note("work", "Pricing call", "2026-10-20T15:00", "2026-10-20T16:00", "Pricing options for the pilot."),
		note("work", "Running notes", "2026-10-10", "2026-10-21T08:00"),
	],
};

const opts = { indexName: "index", recentCount: 2, rootTitle: "Vault" };

test("sorts notes newest first by created or modified", () => {
	assert.deepEqual(
		sortNotes(work.notes).map((n) => n.basename),
		["Pricing call", "Running notes", "Planning"],
	);
	assert.deepEqual(
		sortNotes(work.notes, "modified").map((n) => n.basename),
		["Running notes", "Pricing call", "Planning"],
	);
});

test("renders a folder index by created date", () => {
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
			"- 2026-10-20 · [[work/Pricing call|Pricing call]] — Pricing options for the pilot.",
			"- 2026-10-10 · [[work/Running notes|Running notes]]",
			"- 2026-10-02 · [[work/Planning|Planning]] — Quarter planning.",
			"",
		].join("\n"),
	);
});

test("root index shows recently edited notes across folders", () => {
	const root: FolderNode = {
		path: "",
		name: "Vault",
		folders: [work],
		notes: [note("", "Loose", "2026-09-01T10:00", "2026-09-01T10:00")],
	};
	const text = renderIndex(root, opts);
	assert.match(text, /^# Vault\n/);
	assert.match(
		text,
		/## Recently edited\n\n- 2026-10-22 · \[\[work\/client\/Kickoff\|Kickoff\]\] \*\(work\/client\)\*\n- 2026-10-21 · \[\[work\/Running notes\|Running notes\]\] \*\(work\)\*\n\n/,
	);
	assert.match(text, /- \[\[work\/index\|work\]\] · 4 notes/);
	assert.match(text, /## Notes\n\n- 2026-09-01 · \[\[Loose\|Loose\]\]\n/);
});

test("empty folders say so", () => {
	assert.match(renderIndex({ path: "study", name: "study", folders: [], notes: [] }, opts), /\*No notes yet\.\*/);
});
