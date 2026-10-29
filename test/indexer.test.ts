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
			"- 20th Oct, 2026 - Tue · [[work/Pricing call|Pricing call]] — Pricing options for the pilot.",
			"- 10th Oct, 2026 - Sat · [[work/Running notes|Running notes]]",
			"- 2nd Oct, 2026 - Fri · [[work/Planning|Planning]] — Quarter planning.",
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
		/## Recently edited\n\n- 22nd Oct, 2026 - Thu · \[\[work\/client\/Kickoff\|Kickoff\]\] \*\(work\/client\)\*\n- 21st Oct, 2026 - Wed · \[\[work\/Running notes\|Running notes\]\] \*\(work\)\*\n\n/,
	);
	assert.match(text, /- \[\[work\/index\|work\]\] · 4 notes/);
	assert.match(text, /## Notes\n\n- 1st Sep, 2026 - Tue · \[\[Loose\|Loose\]\]\n/);
});

test("empty folders say so", () => {
	assert.match(renderIndex({ path: "study", name: "study", folders: [], notes: [] }, opts), /\*No notes yet\.\*/);
});

test("index dates use English ordinals and calendar weekdays for dates and timestamps", () => {
	const cases = [
		["2026-10-01", "1st Oct, 2026 - Thu"],
		["2026-10-02", "2nd Oct, 2026 - Fri"],
		["2026-10-03", "3rd Oct, 2026 - Sat"],
		["2026-10-04", "4th Oct, 2026 - Sun"],
		["2026-10-11", "11th Oct, 2026 - Sun"],
		["2026-10-12", "12th Oct, 2026 - Mon"],
		["2026-10-13", "13th Oct, 2026 - Tue"],
		["2026-10-21", "21st Oct, 2026 - Wed"],
		["2026-10-22", "22nd Oct, 2026 - Thu"],
		["2026-10-23", "23rd Oct, 2026 - Fri"],
		["2026-10-31", "31st Oct, 2026 - Sat"],
		["2021-11-02", "2nd Nov, 2021 - Tue"],
		["2024-02-29", "29th Feb, 2024 - Thu"],
	];
	for (const [date, expected] of cases) {
		for (const value of [date, `${date}T00:01`, `${date}T23:59`]) {
			const root: FolderNode = {
				path: "",
				name: "Vault",
				folders: [],
				notes: [note("", "Planning", value, value, "Quarter planning.")],
			};
			const text = renderIndex(root, opts);
			const line = `- ${expected} · [[Planning|Planning]] — Quarter planning.`;
			assert.ok(text.includes(`## Recently edited\n\n${line}\n`), value);
			assert.ok(text.includes(`## Notes\n\n${line}\n`), value);
		}
	}
});
