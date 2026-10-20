// Renders the generated index.md files. Pure: the plugin builds the tree.

export interface NoteEntry {
	/** Vault path without the .md extension, used as the link target. */
	linkPath: string;
	basename: string;
	/** Folder path of the note ("" for the vault root). */
	folder: string;
	description?: string;
	/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"; sortable as text. */
	created: string;
	modified: string;
}

export type DateKey = "created" | "modified";

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

/** Newest first by the given date. */
export function sortNotes(notes: NoteEntry[], key: DateKey = "created"): NoteEntry[] {
	return [...notes].sort((a, b) => b[key].localeCompare(a[key]) || a.basename.localeCompare(b.basename));
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

function noteLine(note: NoteEntry, key: DateKey, showFolder: boolean): string {
	const parts = [`${note[key].slice(0, 10)} · [[${note.linkPath}|${escapeLabel(note.basename)}]]`];
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
		const recent = sortNotes(allNotes(node), "modified").slice(0, options.recentCount);
		if (recent.length) {
			lines.push("## Recently edited", "", ...recent.map((n) => noteLine(n, "modified", true)), "");
		}
	}

	const folders = [...node.folders].sort((a, b) => a.name.localeCompare(b.name));
	if (folders.length) {
		lines.push("## Folders", "", ...folders.map((f) => folderLine(f, options.indexName)), "");
	}

	const notes = sortNotes(node.notes);
	if (notes.length) {
		lines.push("## Notes", "", ...notes.map((n) => noteLine(n, "created", false)), "");
	}

	if (!folders.length && !notes.length) lines.push("*No notes yet.*", "");

	return lines.join("\n");
}
