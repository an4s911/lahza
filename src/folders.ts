// Options for the "New note" folder picker. Pure.

import { cleanFolderPath } from "./prompts.ts";

export interface FolderOption {
	folder: string;
	/** True when the folder doesn't exist yet and will be created. */
	create: boolean;
}

/**
 * Inbox first (the default on Enter), then the current folder, then the rest.
 * A query that isn't an existing folder can be created as a new one.
 */
export function folderOptions(
	folders: string[],
	inbox: string,
	current: string | null,
	query: string,
): FolderOption[] {
	const q = query.trim().toLowerCase();
	const ordered = [inbox, ...(current && current !== inbox ? [current] : [])];
	for (const folder of [...folders].sort((a, b) => a.localeCompare(b))) {
		if (!ordered.includes(folder)) ordered.push(folder);
	}

	const options: FolderOption[] = ordered
		.filter((folder) => !q || folder.toLowerCase().includes(q))
		.map((folder) => ({ folder, create: !folders.includes(folder) }));

	const typed = cleanFolderPath(query);
	if (typed && !ordered.some((folder) => folder.toLowerCase() === typed.toLowerCase())) {
		options.push({ folder: typed, create: true });
	}
	return options;
}
