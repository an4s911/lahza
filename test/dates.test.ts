import assert from "node:assert/strict";
import { test } from "node:test";
import { newNoteContent, noteDates, parseDateValue } from "../src/dates.ts";

test("reads date and date-time property values", () => {
	assert.equal(parseDateValue("2026-10-20T14:30"), "2026-10-20T14:30");
	assert.equal(parseDateValue("2026-10-20T14:30:59"), "2026-10-20T14:30");
	assert.equal(parseDateValue("2026-10-20 14:30"), "2026-10-20T14:30");
	assert.equal(parseDateValue("2026-10-20"), "2026-10-20");
	assert.equal(parseDateValue(new Date(2026, 9, 20, 8, 5)), "2026-10-20T08:05");
	for (const value of ["yesterday", "", 20261020, null, undefined, ["2026-10-20"]]) {
		assert.equal(parseDateValue(value), null, String(value));
	}
});

const mtime = new Date(2026, 9, 25, 9, 0).getTime();

test("uses the properties when present", () => {
	assert.deepEqual(
		noteDates({ created: "2026-10-01T10:00", modified: "2026-10-02T11:00", basename: "Plan", mtime }),
		{ created: "2026-10-01T10:00", modified: "2026-10-02T11:00" },
	);
});

test("falls back to a date in the name, then the file time", () => {
	assert.deepEqual(noteDates({ created: undefined, modified: undefined, basename: "2026-09-01 Old note", mtime }), {
		created: "2026-09-01",
		modified: "2026-10-25T09:00",
	});
	assert.deepEqual(noteDates({ created: "nonsense", modified: undefined, basename: "Loose", mtime }), {
		created: "2026-10-25T09:00",
		modified: "2026-10-25T09:00",
	});
});

test("modified is never before created", () => {
	const dates = noteDates({ created: "2026-11-01T08:00", modified: undefined, basename: "Plan", mtime });
	assert.equal(dates.modified, "2026-11-01T08:00");
});

test("new notes start with both properties", () => {
	assert.equal(
		newNoteContent(new Date(2026, 9, 20, 14, 30)),
		"---\ncreated: 2026-10-20T14:30\nmodified: 2026-10-20T14:30\n---\n",
	);
});
