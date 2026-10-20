// File naming rules. Notes are named "YYYY-MM-DD" (or "YYYY-MM-DD HHmm" for
// quick captures) until they get a title: "YYYY-MM-DD <title>".

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?=\s|$)/;
const UNTITLED = /^\d{4}-\d{2}-\d{2}(?: \d{4})?(?: \d+)?$/;
const TIME_PART = /^\d{4}$/;
const ILLEGAL = /[\\/:*?"<>|#^[\]]/g;
const MAX_TITLE_LENGTH = 60;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatTime(d: Date): string {
	return `${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function datePrefix(basename: string): string | null {
	return DATE_PREFIX.exec(basename)?.[1] ?? null;
}

export function isUntitled(basename: string): boolean {
	return UNTITLED.test(basename);
}

/** Turns a model-suggested title into something safe for a filename and a wikilink. */
export function cleanTitle(raw: string): string {
	let title = raw
		.replace(ILLEGAL, " ")
		.replace(/[\u0000-\u001f]/g, "")
		.replace(/^[\s'"`.\-]+|[\s'"`.,;!\-]+$/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (title.length > MAX_TITLE_LENGTH) {
		const cut = title.slice(0, MAX_TITLE_LENGTH);
		const lastSpace = cut.lastIndexOf(" ");
		title = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
	}
	return title;
}

export function titledBasename(date: string, title: string): string {
	const clean = cleanTitle(title);
	return clean ? `${date} ${clean}` : date;
}

/** Returns base, or "base 2", "base 3"... whichever is free. */
export function uniqueBasename(base: string, isTaken: (name: string) => boolean): string {
	if (!isTaken(base)) return base;
	for (let i = 2; ; i++) {
		const candidate = `${base} ${i}`;
		if (!isTaken(candidate)) return candidate;
	}
}

/** The human part of a note name, without the date (and capture time). */
export function displayTitle(basename: string): string {
	const date = datePrefix(basename);
	if (!date) return basename;
	const rest = basename.slice(date.length).trim();
	const [first, ...others] = rest.split(" ");
	const withoutTime = first && TIME_PART.test(first) ? others.join(" ") : rest;
	return withoutTime || date;
}
