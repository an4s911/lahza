// Renders the generated index.md files. Pure: the plugin builds the tree.

import { displayTitle } from "./naming.ts";

export interface NoteEntry {
	/** Vault path without the .md extension, used as the link target. */
	linkPath: string;
	basename: string;
	/** Folder path of the note ("" for the vault root). */
	folder: string;
	description?: string;
	/** "YYYY-MM-DD": the date prefix, or the last modified day for undated notes. */
	sortKey: string;
	/** Date shown in the list; only for notes with a date prefix. */
	date?: string;
}

export interface FolderNode {
	/** "" for the vault root. */
	path: string;
	name: string;
	folders: FolderNode[];
	notes: NoteEntry[];
}

export interface RenderOptions {
	indexName: string;
	recentCount: number;
	rootTitle: string;
}

export const GENERATED_NOTICE = "> Generated automatically. Edits here will be overwritten.";

export function sortNotes(notes: NoteEntry[]): NoteEntry[] {
	return [...notes].sort(
		(a, b) => b.sortKey.localeCompare(a.sortKey) || b.basename.localeCompare(a.basename),
	);
}

export function countNotes(node: FolderNode): number {
	return node.notes.length + node.folders.reduce((sum, f) => sum + countNotes(f), 0);
}

export function allNotes(node: FolderNode): NoteEntry[] {
	return [...node.notes, ...node.folders.flatMap(allNotes)];
}

function escapeLabel(text: string): string {
	return text.replace(/[|[\]]/g, " ").trim();
}

function noteLine(note: NoteEntry, showFolder: boolean): string {
	const label = escapeLabel(displayTitle(note.basename));
	const parts = [note.date && note.date !== label ? `${note.date} · ` : ""];
	parts.push(`[[${note.linkPath}|${label}]]`);
	if (note.description) parts.push(` — ${note.description.replace(/\s+/g, " ").trim()}`);
	if (showFolder && note.folder) parts.push(` *(${note.folder})*`);
	return `- ${parts.join("")}`;
}

function folderLine(folder: FolderNode, indexName: string): string {
	const count = countNotes(folder);
	return `- [[${folder.path}/${indexName}|${escapeLabel(folder.name)}]] · ${count} ${count === 1 ? "note" : "notes"}`;
}

export function renderIndex(node: FolderNode, options: RenderOptions): string {
	const isRoot = node.path === "";
	const lines = [`# ${isRoot ? options.rootTitle : node.name}`, "", GENERATED_NOTICE, ""];

	if (isRoot) {
		const recent = sortNotes(allNotes(node)).slice(0, options.recentCount);
		if (recent.length) {
			lines.push("## Recent", "", ...recent.map((n) => noteLine(n, true)), "");
		}
	}

	const folders = [...node.folders].sort((a, b) => a.name.localeCompare(b.name));
	if (folders.length) {
		lines.push("## Folders", "", ...folders.map((f) => folderLine(f, options.indexName)), "");
	}

	const notes = sortNotes(node.notes);
	if (notes.length) {
		lines.push("## Notes", "", ...notes.map((n) => noteLine(n, false)), "");
	}

	if (!folders.length && !notes.length) lines.push("*No notes yet.*", "");

	return lines.join("\n");
}
