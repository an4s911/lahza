// Prompts sent to the model and parsing of its JSON replies. Pure.

import { cleanTitle } from "./naming.ts";

export interface ChatMessage {
	role: "system" | "user";
	content: string;
}

export interface DescribeResult {
	title: string;
	description: string;
}

export interface FolderContext {
	path: string;
	/** "title — description" lines of a few recent notes in the folder. */
	examples: string[];
}

export interface FolderSuggestion {
	folder: string;
	reason: string;
}

export interface FileResult {
	suggestions: FolderSuggestion[];
	newFolder: string | null;
}

const MAX_DESCRIPTION_LENGTH = 200;

export function truncate(text: string, maxChars: number): string {
	return text.length > maxChars ? `${text.slice(0, maxChars)}\n[…truncated]` : text;
}

export function describeMessages(body: string, maxChars: number): ChatMessage[] {
	return [
		{
			role: "system",
			content: [
				"You name and summarize short personal notes (meeting notes, ideas, study notes, lists).",
				'Reply with JSON only: {"title": string, "description": string}.',
				"title: 2-6 words, specific (mention people, projects or topics in the note), no date, no quotes, no trailing punctuation.",
				"description: one plain sentence, at most 20 words, saying what the note is about.",
				"Write in the note's main language. Keep non-English terms (e.g. Arabic words) as they appear in the note.",
				"Do not invent facts that are not in the note.",
			].join("\n"),
		},
		{ role: "user", content: truncate(body, maxChars) },
	];
}

export function fileMessages(
	body: string,
	folders: FolderContext[],
	maxChars: number,
): ChatMessage[] {
	const folderList = folders
		.map((f) =>
			f.examples.length
				? `${f.path}\n${f.examples.map((e) => `  - ${e}`).join("\n")}`
				: `${f.path}\n  (empty)`,
		)
		.join("\n");
	return [
		{
			role: "system",
			content: [
				"You help file a note from the inbox into the right folder of a personal notes vault.",
				"You get the vault's folders, each with a few recent notes in it, and the note to file.",
				'Reply with JSON only: {"suggestions": [{"folder": string, "reason": string}], "newFolder": string | null}.',
				"suggestions: up to 3 folders from the list, best first. Use folder paths exactly as written. reason: under 12 words.",
				'newFolder: if no listed folder fits well, propose a new folder path (lowercase, "-" between words) placed under the most fitting existing parent; otherwise null.',
			].join("\n"),
		},
		{
			role: "user",
			content: `Folders:\n${folderList || "(none yet)"}\n\nNote to file:\n${truncate(body, maxChars)}`,
		},
	];
}

/** Finds the first JSON object in a reply, tolerating code fences and chatter. */
export function extractJson(text: string): unknown {
	const unfenced = text.replace(/```(?:json)?/gi, "");
	const start = unfenced.indexOf("{");
	const end = unfenced.lastIndexOf("}");
	if (start === -1 || end <= start) return null;
	try {
		return JSON.parse(unfenced.slice(start, end + 1));
	} catch {
		return null;
	}
}

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function parseDescribe(text: string): DescribeResult | null {
	const data = extractJson(text) as Record<string, unknown> | null;
	if (!data || typeof data !== "object") return null;
	const title = cleanTitle(asString(data.title));
	const description = asString(data.description).replace(/\s+/g, " ").slice(0, MAX_DESCRIPTION_LENGTH);
	if (!title && !description) return null;
	return { title, description };
}

/** Normalizes a folder path the model proposed: no leading/trailing slashes, safe segments. */
export function cleanFolderPath(raw: string): string {
	return raw
		.split("/")
		.map((segment) => segment.replace(/[\\:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim())
		.filter((segment) => segment && segment !== "." && segment !== "..")
		.join("/");
}

export function parseFile(text: string, existing: Set<string>, inboxFolder: string): FileResult {
	const data = extractJson(text) as Record<string, unknown> | null;
	const result: FileResult = { suggestions: [], newFolder: null };
	if (!data || typeof data !== "object") return result;

	const isInbox = (path: string) => path === inboxFolder || path.startsWith(`${inboxFolder}/`);
	const seen = new Set<string>();
	const add = (folder: string, reason: string) => {
		if (!folder || isInbox(folder) || seen.has(folder) || result.suggestions.length >= 3) return;
		seen.add(folder);
		result.suggestions.push({ folder, reason });
	};

	if (Array.isArray(data.suggestions)) {
		for (const item of data.suggestions) {
			if (!item || typeof item !== "object") continue;
			const record = item as Record<string, unknown>;
			const folder = cleanFolderPath(asString(record.folder));
			if (existing.has(folder)) add(folder, asString(record.reason));
		}
	}

	const proposed = cleanFolderPath(asString(data.newFolder));
	if (proposed && !isInbox(proposed)) {
		// A "new" folder that already exists is just another suggestion.
		if (existing.has(proposed)) add(proposed, "");
		else result.newFolder = proposed;
	}
	return result;
}
