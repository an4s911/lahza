import { type App, FuzzySuggestModal, Modal, Setting, SuggestModal } from "obsidian";
import { type FolderOption, folderOptions } from "./folders.ts";

class NewNoteFolderModal extends SuggestModal<FolderOption> {
	private chosen = false;
	private folders: string[];
	private inbox: string;
	private current: string | null;
	private resolve: (folder: string | null) => void;

	constructor(
		app: App,
		folders: string[],
		inbox: string,
		current: string | null,
		resolve: (folder: string | null) => void,
	) {
		super(app);
		this.folders = folders;
		this.inbox = inbox;
		this.current = current;
		this.resolve = resolve;
		this.setPlaceholder("New note in… (Enter for inbox, or type a new folder path)");
	}

	getSuggestions(query: string): FolderOption[] {
		return folderOptions(this.folders, this.inbox, this.current, query);
	}

	renderSuggestion(option: FolderOption, el: HTMLElement): void {
		el.createDiv({ text: option.create && option.folder !== this.inbox ? `Create folder: ${option.folder}` : option.folder });
		if (option.folder === this.inbox) el.createEl("small", { text: "default", cls: "mod-muted" });
		else if (option.folder === this.current) el.createEl("small", { text: "current folder", cls: "mod-muted" });
	}

	onChooseSuggestion(option: FolderOption): void {
		this.chosen = true;
		this.resolve(option.folder);
	}

	onClose(): void {
		window.setTimeout(() => {
			if (!this.chosen) this.resolve(null);
		}, 0);
	}
}

/** Asks where a new note goes. Resolves null when cancelled. */
export function askNewNoteFolder(
	app: App,
	folders: string[],
	inbox: string,
	current: string | null,
): Promise<string | null> {
	return new Promise((resolve) => new NewNoteFolderModal(app, folders, inbox, current, resolve).open());
}

export type FileChoice =
	| { kind: "move"; folder: string; reason: string }
	| { kind: "new"; folder: string }
	| { kind: "pick" }
	| { kind: "skip" }
	| { kind: "stop" };

function choiceLabel(choice: FileChoice): { title: string; detail: string } {
	switch (choice.kind) {
		case "move":
			return { title: choice.folder, detail: choice.reason };
		case "new":
			return { title: `New folder: ${choice.folder}`, detail: "Create it and move the note there" };
		case "pick":
			return { title: "Choose folder…", detail: "" };
		case "skip":
			return { title: "Skip", detail: "Leave this note in the inbox" };
		case "stop":
			return { title: "Stop filing", detail: "" };
	}
}

// SuggestModal closes before calling onChooseSuggestion, so resolution on close is deferred.
class FileChoiceModal extends SuggestModal<FileChoice> {
	private chosen = false;
	private choices: FileChoice[];
	private resolve: (choice: FileChoice) => void;

	constructor(app: App, noteName: string, choices: FileChoice[], resolve: (choice: FileChoice) => void) {
		super(app);
		this.choices = choices;
		this.resolve = resolve;
		this.setPlaceholder(`File "${noteName}" to…`);
	}

	getSuggestions(query: string): FileChoice[] {
		const q = query.toLowerCase();
		return this.choices.filter((c) => choiceLabel(c).title.toLowerCase().includes(q));
	}

	renderSuggestion(choice: FileChoice, el: HTMLElement): void {
		const { title, detail } = choiceLabel(choice);
		el.createDiv({ text: title });
		if (detail) el.createEl("small", { text: detail, cls: "mod-muted" });
	}

	onChooseSuggestion(choice: FileChoice): void {
		this.chosen = true;
		this.resolve(choice);
	}

	onClose(): void {
		window.setTimeout(() => {
			if (!this.chosen) this.resolve({ kind: "stop" });
		}, 0);
	}
}

export function askFileChoice(app: App, noteName: string, choices: FileChoice[]): Promise<FileChoice> {
	return new Promise((resolve) => new FileChoiceModal(app, noteName, choices, resolve).open());
}

class FolderPickModal extends FuzzySuggestModal<string> {
	private chosen = false;
	private folders: string[];
	private resolve: (folder: string | null) => void;

	constructor(app: App, folders: string[], resolve: (folder: string | null) => void) {
		super(app);
		this.folders = folders;
		this.resolve = resolve;
		this.setPlaceholder("Choose a folder");
	}

	getItems(): string[] {
		return this.folders;
	}

	getItemText(folder: string): string {
		return folder;
	}

	onChooseItem(folder: string): void {
		this.chosen = true;
		this.resolve(folder);
	}

	onClose(): void {
		window.setTimeout(() => {
			if (!this.chosen) this.resolve(null);
		}, 0);
	}
}

export function pickFolder(app: App, folders: string[]): Promise<string | null> {
	return new Promise((resolve) => new FolderPickModal(app, folders, resolve).open());
}

class ConfirmFolderModal extends Modal {
	private value: string;
	private done = false;
	private resolve: (folder: string | null) => void;

	constructor(app: App, initial: string, resolve: (folder: string | null) => void) {
		super(app);
		this.value = initial;
		this.resolve = resolve;
	}

	onOpen(): void {
		this.setTitle("New folder");
		new Setting(this.contentEl).setName("Path").addText((text) => {
			text.setValue(this.value).onChange((v) => (this.value = v));
			text.inputEl.style.width = "100%";
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") this.submit();
			});
			window.setTimeout(() => text.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Create and move").setCta().onClick(() => this.submit()));
	}

	private submit(): void {
		this.done = true;
		this.resolve(this.value.trim() || null);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.done) this.resolve(null);
	}
}

export function confirmNewFolder(app: App, initial: string): Promise<string | null> {
	return new Promise((resolve) => new ConfirmFolderModal(app, initial, resolve).open());
}
