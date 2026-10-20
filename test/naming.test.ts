import assert from "node:assert/strict";
import { test } from "node:test";
import {
	cleanTitle,
	datePrefix,
	displayTitle,
	formatDate,
	formatTime,
	isUntitled,
	titledBasename,
	uniqueBasename,
} from "../src/naming.ts";

test("formats dates and times with zero padding", () => {
	const d = new Date(2026, 0, 5, 9, 7);
	assert.equal(formatDate(d), "2026-01-05");
	assert.equal(formatTime(d), "0907");
});

test("detects date-only names as untitled", () => {
	for (const name of ["2026-10-20", "2026-10-20 2", "2026-10-20 1430", "2026-10-20 1430 3"]) {
		assert.equal(isUntitled(name), true, name);
	}
	for (const name of ["2026-10-20 Pricing call", "tafsir notes", "2026-10-20x", "2026-10-20 14:30"]) {
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
	const long = cleanTitle("word ".repeat(30));
	assert.ok(long.length <= 60 && !long.endsWith(" "));
});

test("builds titled names and falls back to the date", () => {
	assert.equal(titledBasename("2026-10-20", "Kickoff call"), "2026-10-20 Kickoff call");
	assert.equal(titledBasename("2026-10-20", "???"), "2026-10-20");
});

test("picks the first free name", () => {
	const taken = new Set(["2026-10-20", "2026-10-20 2"]);
	assert.equal(uniqueBasename("2026-10-20", (n) => taken.has(n)), "2026-10-20 3");
	assert.equal(uniqueBasename("2026-10-21", (n) => taken.has(n)), "2026-10-21");
});

test("display title drops the date and capture time", () => {
	assert.equal(displayTitle("2026-10-20 Kickoff call"), "Kickoff call");
	assert.equal(displayTitle("2026-10-20 1430"), "2026-10-20");
	assert.equal(displayTitle("2026-10-20 1430 Idea"), "Idea");
	assert.equal(displayTitle("2026-10-20"), "2026-10-20");
	assert.equal(displayTitle("Running notes"), "Running notes");
});
