// File naming rules. New notes are "Untitled" ("Untitled 2", ...) until they
// get a title, which becomes the whole file name. Dates live in properties.

export const UNTITLED_NAME = "Untitled";

const UNTITLED = /^untitled(?: \d+)?$/i;
const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?=\s|$)/;
const ILLEGAL = /[\\/:*?"<>|#^[\]]/g;
const MAX_TITLE_LENGTH = 60;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time as "YYYY-MM-DDTHH:mm", the format of Obsidian's date & time properties. */
export function formatDateTime(d: Date): string {
	return `${formatDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A leading "YYYY-MM-DD" in a file name, e.g. from notes made before dates moved to properties. */
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

/**
 * Tells whether a note name is taken by one of fileNames (names with extension).
 * Ignores case, since some file systems (iOS, macOS) do.
 */
export function nameTaken(fileNames: string[]): (basename: string) => boolean {
	const taken = new Set(fileNames.map((n) => n.toLowerCase()));
	return (basename) => taken.has(`${basename}.md`.toLowerCase());
}

/** Returns base, or "base 2", "base 3"... whichever is free. */
export function uniqueBasename(base: string, isTaken: (name: string) => boolean): string {
	if (!isTaken(base)) return base;
	for (let i = 2; ; i++) {
		const candidate = `${base} ${i}`;
		if (!isTaken(candidate)) return candidate;
	}
}
