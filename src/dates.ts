// Created and modified dates, kept as note properties because file times
// don't survive git (a clone or pull sets them to "now").

import { datePrefix, formatDateTime } from "./naming.ts";

export const CREATED = "created";
export const MODIFIED = "modified";

const DATE_VALUE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/;

/** Reads a date property as "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"; null if it isn't one. */
export function parseDateValue(value: unknown): string | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : formatDateTime(value);
	if (typeof value !== "string") return null;
	const match = DATE_VALUE.exec(value.trim());
	if (!match) return null;
	return match[2] ? `${match[1]}T${match[2]}` : match[1];
}

export interface DateSource {
	created: unknown;
	modified: unknown;
	basename: string;
	/** File modification time in ms. */
	mtime: number;
}

/**
 * Sortable created/modified values for a note. Falls back to a date in the
 * file name, then to the file's modification time.
 */
export function noteDates(source: DateSource): { created: string; modified: string } {
	const fileTime = formatDateTime(new Date(source.mtime));
	const created = parseDateValue(source.created) ?? datePrefix(source.basename) ?? fileTime;
	const modified = parseDateValue(source.modified) ?? (created > fileTime ? created : fileTime);
	return { created, modified };
}

/** Properties for a note created at the given time. */
export function newNoteContent(now: Date): string {
	const stamp = formatDateTime(now);
	return `---\n${CREATED}: ${stamp}\n${MODIFIED}: ${stamp}\n---\n`;
}
