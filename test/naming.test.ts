import assert from "node:assert/strict";
import { test } from "node:test";
import {
	cleanTitle,
	datePrefix,
	formatDate,
	formatDateTime,
	isUntitled,
	nameTaken,
	uniqueBasename,
} from "../src/naming.ts";

test("formats dates and times with zero padding", () => {
	const d = new Date(2026, 0, 5, 9, 7);
	assert.equal(formatDate(d), "2026-01-05");
	assert.equal(formatDateTime(d), "2026-01-05T09:07");
});

test("detects Untitled names", () => {
	for (const name of ["Untitled", "Untitled 2", "untitled", "Untitled 12"]) {
		assert.equal(isUntitled(name), true, name);
	}
	for (const name of ["Untitled draft", "Pricing call", "2026-10-20", "Untitled2"]) {
		assert.equal(isUntitled(name), false, name);
	}
});

test("reads the date prefix only when it is a whole word", () => {
	assert.equal(datePrefix("2026-10-20 Pricing call"), "2026-10-20");
	assert.equal(datePrefix("2026-10-20"), "2026-10-20");
	assert.equal(datePrefix("2026-10-201"), null);
	assert.equal(datePrefix("notes 2026-10-20"), null);
});

test("cleans titles for filenames and links", () => {
	assert.equal(cleanTitle('  "Pricing: plan / next steps?" '), "Pricing plan next steps");
	assert.equal(cleanTitle("Weekly sync [team] #3."), "Weekly sync team 3");
	assert.equal(cleanTitle("Notes on تفسير"), "Notes on تفسير");
	assert.equal(cleanTitle("???"), "");
	const long = cleanTitle("word ".repeat(30));
	assert.ok(long.length <= 60 && !long.endsWith(" "));
});

test("picks the first free name", () => {
	const taken = new Set(["Untitled", "Untitled 2"]);
	assert.equal(uniqueBasename("Untitled", (n) => taken.has(n)), "Untitled 3");
	assert.equal(uniqueBasename("Kickoff", (n) => taken.has(n)), "Kickoff");
});

test("taken names ignore case and need the .md extension", () => {
	const taken = nameTaken(["untitled.md", "Meeting.md", "Plans", "index.md"]);
	assert.equal(taken("Untitled"), true);
	assert.equal(taken("meeting"), true);
	assert.equal(taken("Index"), true);
	assert.equal(taken("Plans"), false);
	assert.equal(uniqueBasename("Untitled", taken), "Untitled 2");
});
