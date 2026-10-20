import type { Extension } from "@codemirror/state";
import { MarkdownView, Notice, Platform, Plugin, TAbstractFile, TFile, TFolder, setIcon } from "obsidian";
import { calcExtension } from "./calcEditor.ts";
import { describeDecision, stripFrontmatter } from "./content.ts";
import { CREATED, MODIFIED, newNoteContent, noteDates } from "./dates.ts";
import { type FolderNode, type NoteEntry, renderIndex, sortNotes } from "./indexer.ts";
import { askFileChoice, askNewNoteFolder, confirmNewFolder, type FileChoice, pickFolder } from "./modals.ts";
import { cleanTitle, formatDateTime, isUntitled, nameTaken, UNTITLED_NAME, uniqueBasename } from "./naming.ts";
import { AiError, chat } from "./openrouter.ts";
import {
	cleanFolderPath,
	describeMessages,
	type FileResult,
	type FolderContext,
	fileMessages,
	parseDescribe,
	parseFile,
} from "./prompts.ts";
import { DEFAULT_SETTINGS, type NotesSettings, NotesSettingTab } from "./settings.ts";

const LEAVE_DELAY_MS = 2000;
const INDEX_DELAY_MS = 1500;
const MAX_NOTE_CHARS = 6000;
const CHANGE_RATIO = 0.3;
const RECENT_COUNT = 10;
const EXAMPLES_PER_FOLDER = 5;
const EMPTY_TAB_ACTION = "notes-system-new-note";

interface PluginData {
	settings?: Partial<NotesSettings>;
	/** Body length per note path when it was last described on this device. */
	described?: Record<string, number>;
}

export default class NotesSystemPlugin extends Plugin {
	settings: NotesSettings = { ...DEFAULT_SETTINGS };
	private described: Record<string, number> = {};
	private currentPath: string | null = null;
	/** Note body when it was opened, to tell whether it changed by the time it's left. */
	private openedBodies = new Map<string, string>();
	private inFlight = new Set<string>();
	private indexTimer: number | undefined;
	private rebuilding = false;
	private rebuildAgain = false;
	private filing = false;
	private warnedNoKey = false;
	private vimMapped: string[] = [];
	/** Editor extensions for math; emptied when math is off. */
	private mathExtensions: Extension[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new NotesSettingTab(this.app, this));
		this.registerEditorExtension(this.mathExtensions);
		this.applyMathResults();

		this.addCommand({
			id: "new-note-here",
			name: "New note (choose folder)",
			callback: () => this.newNoteWithPicker(),
		});
		this.addCommand({
			id: "quick-capture",
			name: "Quick capture to inbox",
			callback: () => this.quickCapture(),
		});
		this.addCommand({
			id: "file-inbox",
			name: "File inbox notes",
			callback: () => this.fileInbox(),
		});
		this.addCommand({
			id: "describe-note",
			name: "Title and describe current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md" || this.isIndexFile(file)) return false;
				if (!checking) {
					this.describe(file, true, false).catch((e) => this.reportError(e));
				}
				return true;
			},
		});
		this.addCommand({
			id: "rebuild-indexes",
			name: "Rebuild folder indexes",
			callback: () => this.rebuildIndexes(),
		});

		this.addRibbonIcon("inbox", "Quick capture to inbox", () => this.quickCapture());
		this.addRibbonIcon("folder-input", "File inbox notes", () => this.fileInbox());

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) return;
				menu.addItem((item) =>
					item
						.setTitle("New note")
						.setIcon("file-plus")
						.onClick(() => this.newNoteIn(file)),
				);
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.applyVimEscape();
			const active = this.app.workspace.getActiveFile();
			this.currentPath = active?.path ?? null;
			if (active) void this.rememberBody(active);

			this.registerEvent(this.app.workspace.on("file-open", (file) => this.onFileOpen(file)));
			this.registerEvent(this.app.vault.on("create", (f) => this.onVaultChange(f)));
			this.registerEvent(
				this.app.vault.on("delete", (f) => {
					delete this.described[f.path];
					this.openedBodies.delete(f.path);
					this.onVaultChange(f);
				}),
			);
			this.registerEvent(
				this.app.vault.on("rename", (f, oldPath) => {
					if (oldPath in this.described) {
						this.described[f.path] = this.described[oldPath];
						delete this.described[oldPath];
						void this.saveSettings();
					}
					if (this.currentPath === oldPath) this.currentPath = f.path;
					const opened = this.openedBodies.get(oldPath);
					if (opened !== undefined) {
						this.openedBodies.delete(oldPath);
						this.openedBodies.set(f.path, opened);
					}
					this.onVaultChange(f);
				}),
			);
			this.registerEvent(this.app.metadataCache.on("changed", (f) => this.onVaultChange(f)));
			this.registerEvent(this.app.workspace.on("layout-change", () => this.decorateEmptyTabs()));
			// Desktop only waits for these; on mobile the app can be closed without notice.
			this.registerEvent(
				this.app.workspace.on("quit", (tasks) => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					const file = view?.file;
					if (!view || !file) return;
					tasks.add(async () => {
						await view.save(); // so the latest typing is on disk before the properties change
						await this.stampModified(file);
					});
				}),
			);

			this.decorateEmptyTabs();
			this.scheduleIndexRebuild();
		});
	}

	onunload(): void {
		window.clearTimeout(this.indexTimer);
		this.unmapVimEscape();
		document.querySelectorAll(`.${EMPTY_TAB_ACTION}`).forEach((el) => el.remove());
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as PluginData;
		this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
		this.described = data.described ?? {};
	}

	async saveSettings(): Promise<void> {
		const data: PluginData = { settings: this.settings, described: this.described };
		await this.saveData(data);
	}

	// ---- Vim -------------------------------------------------------------

	applyVimEscape(): void {
		this.unmapVimEscape();
		const vim = (window as any).CodeMirrorAdapter?.Vim;
		if (!vim) return;
		this.vimMapped = this.settings.vimEscape
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		for (const keys of this.vimMapped) vim.map(keys, "<Esc>", "insert");
	}

	private unmapVimEscape(): void {
		const vim = (window as any).CodeMirrorAdapter?.Vim;
		for (const keys of this.vimMapped) {
			try {
				vim?.unmap(keys, "insert");
			} catch {
				// Already unmapped.
			}
		}
		this.vimMapped = [];
	}

	// ---- Math --------------------------------------------------------------

	applyMathResults(): void {
		this.mathExtensions.length = 0;
		if (this.settings.mathResults !== "off") {
			this.mathExtensions.push(
				calcExtension({
					insert: () => this.settings.mathResults === "insert",
					cursorTooltips: Platform.isMobile,
				}),
			);
		}
		this.app.workspace.updateOptions();
	}

	// ---- Creating notes --------------------------------------------------

	/** Adds "New note" to the top of the actions on every empty (new) tab. */
	private decorateEmptyTabs(): void {
		// The empty view fills its action list when it opens, so wait a tick.
		window.setTimeout(() => {
			for (const leaf of this.app.workspace.getLeavesOfType("empty")) {
				const list = (leaf.view as any).actionListEl as HTMLElement | undefined;
				if (!list || list.querySelector(`.${EMPTY_TAB_ACTION}`)) continue;

				// Same markup as Obsidian's own empty-tab actions.
				const button = createDiv({
					cls: ["text-icon-button", "tappable", "mod-pill", "empty-state-action", EMPTY_TAB_ACTION],
					attr: { tabIndex: 0, role: "button" },
				});
				setIcon(button.createSpan("text-button-icon"), "file-plus");
				button.createSpan({ cls: "text-button-label", text: "New note" });
				const hotkey = Platform.isDesktop
					? (this.app as any).hotkeyManager?.printHotkeyForCommand?.(`${this.manifest.id}:new-note-here`)
					: "";
				if (hotkey) button.createSpan({ cls: "empty-state-hotkey", text: ` ${hotkey}` });

				button.addEventListener("click", () => this.newNoteWithPicker());
				button.addEventListener("keydown", (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						void this.newNoteWithPicker();
					}
				});
				list.prepend(button);
			}
		}, 0);
	}

	private async newNoteWithPicker(): Promise<void> {
		const parent = this.app.workspace.getActiveFile()?.parent;
		const current = parent && !parent.isRoot() ? parent.path : null;
		const folder = await askNewNoteFolder(
			this.app,
			this.allFolderPaths(),
			this.settings.inboxFolder,
			current,
		);
		if (folder === null) return;
		await this.ensureFolder(folder);
		await this.createAndOpen(folder);
	}

	private async newNoteIn(folder: TFolder): Promise<void> {
		await this.createAndOpen(this.folderPath(folder));
	}

	/** Every non-hidden folder except the vault root. */
	private allFolderPaths(): string[] {
		const paths: string[] = [];
		const walk = (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFolder && !child.name.startsWith(".")) {
					paths.push(child.path);
					walk(child);
				}
			}
		};
		walk(this.app.vault.getRoot());
		return paths;
	}

	private async quickCapture(): Promise<void> {
		const inbox = this.settings.inboxFolder;
		await this.ensureFolder(inbox);
		await this.createAndOpen(inbox);
	}

	/** Creates an Untitled note with created/modified properties and puts the cursor below them. */
	private async createAndOpen(folder: string): Promise<void> {
		const name = this.freeName(folder, UNTITLED_NAME);
		const file = await this.app.vault.create(this.notePath(folder, name), newNoteContent(new Date()));
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file, { active: true });
		if (leaf.view instanceof MarkdownView) {
			const editor = leaf.view.editor;
			editor.setCursor({ line: editor.lastLine(), ch: 0 });
			editor.focus();
		}
	}

	// ---- Modified dates -------------------------------------------------

	private async rememberBody(file: TFile): Promise<void> {
		if (!this.isNote(file) || this.openedBodies.has(file.path)) return;
		this.openedBodies.set(file.path, this.body(await this.app.vault.read(file)));
	}

	/**
	 * Sets `modified` to now if the body changed since the note was opened, and
	 * fills in a missing `created` (e.g. a note made with Obsidian's own button).
	 */
	private async stampModified(file: TFile): Promise<void> {
		const opened = this.openedBodies.get(file.path);
		this.openedBodies.delete(file.path);
		if (opened === undefined || !this.isNote(file)) return;
		if (this.body(await this.app.vault.read(file)) === opened) return;

		const now = formatDateTime(new Date());
		const created = formatDateTime(new Date(file.stat.ctime));
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!fm[CREATED]) fm[CREATED] = created < now ? created : now;
			fm[MODIFIED] = now;
		});
	}

	// ---- Titles and descriptions ----------------------------------------

	private onFileOpen(file: TFile | null): void {
		const previous = this.currentPath;
		this.currentPath = file?.path ?? null;
		if (file) void this.rememberBody(file);
		if (!previous || previous === this.currentPath) return;

		window.setTimeout(() => {
			if (this.currentPath === previous) return; // came back to it
			const left = this.app.vault.getAbstractFileByPath(previous);
			if (!(left instanceof TFile)) return;
			void (async () => {
				await this.stampModified(left);
				if (this.settings.autoDescribe) await this.describe(left, false, true);
			})().catch((e) => this.reportError(e));
		}, LEAVE_DELAY_MS);
	}

	/** Adds a description and, for Untitled notes, a title. Returns the (possibly renamed) file. */
	private async describe(file: TFile, force: boolean, quiet: boolean): Promise<TFile> {
		if (!this.isNote(file) || this.inFlight.has(file.path)) {
			return file;
		}

		const body = this.body(await this.app.vault.read(file));
		const description = this.app.metadataCache.getFileCache(file)?.frontmatter?.description;
		const untitled = isUntitled(file.basename);
		const decision = force
			? body
				? "describe"
				: "skip"
			: describeDecision({
					bodyLength: body.length,
					hasDescription: typeof description === "string" && description.trim() !== "",
					untitled,
					lastLength: this.described[file.path],
					minLength: this.settings.minLength,
					changeRatio: CHANGE_RATIO,
				});

		if (decision === "skip") {
			if (force) new Notice("This note is empty.");
			return file;
		}
		if (decision === "baseline") {
			this.described[file.path] = body.length;
			await this.saveSettings();
			return file;
		}
		if (!this.settings.apiKey) {
			if (!quiet || !this.warnedNoKey) {
				this.warnedNoKey = true;
				new Notice("Notes System: add your OpenRouter API key in settings to get titles.");
			}
			return file;
		}

		this.inFlight.add(file.path);
		try {
			const reply = await chat(
				this.settings.apiKey,
				this.settings.model,
				describeMessages(body, MAX_NOTE_CHARS),
				200,
			);
			const result = parseDescribe(reply);
			if (!result) throw new AiError("Couldn't read the model's reply.");

			if (result.description) {
				await this.app.fileManager.processFrontMatter(file, (fm) => {
					fm.description = result.description;
				});
			}
			this.described[file.path] = body.length;
			if (untitled && result.title) await this.renameWithTitle(file, result.title);
			await this.saveSettings();
			if (!quiet) new Notice(`Described "${file.basename}".`);
			return file;
		} finally {
			this.inFlight.delete(file.path);
		}
	}

	private async renameWithTitle(file: TFile, title: string): Promise<void> {
		const base = cleanTitle(title);
		if (!base || base === file.basename) return;
		const folder = this.folderPath(file.parent ?? this.app.vault.getRoot());
		const name = this.freeName(folder, base, file);
		await this.app.fileManager.renameFile(file, this.notePath(folder, name));
	}

	// ---- Filing the inbox -----------------------------------------------

	private async fileInbox(): Promise<void> {
		if (this.filing) return;
		this.filing = true;
		try {
			const inbox = this.app.vault.getAbstractFileByPath(this.settings.inboxFolder);
			const notes =
				inbox instanceof TFolder
					? inbox.children.filter((f): f is TFile => f instanceof TFile && this.isNote(f))
					: [];
			if (!notes.length) {
				new Notice("Inbox is empty.");
				return;
			}

			let moved = 0;
			for (const original of notes) {
				const note = this.settings.apiKey
					? await this.describe(original, false, true).catch(() => original)
					: original;
				const folders = this.folderContexts();
				const result = await this.suggestFolders(note, folders);

				const choices: FileChoice[] = [
					...result.suggestions.map((s) => ({ kind: "move" as const, ...s })),
					...(result.newFolder ? [{ kind: "new" as const, folder: result.newFolder }] : []),
					{ kind: "pick" },
					{ kind: "skip" },
					{ kind: "stop" },
				];
				const choice = await askFileChoice(this.app, note.basename, choices);
				if (choice.kind === "stop") break;
				if (choice.kind === "skip") continue;

				let target: string | null = null;
				if (choice.kind === "move") target = choice.folder;
				if (choice.kind === "new") target = await confirmNewFolder(this.app, choice.folder);
				if (choice.kind === "pick") target = await pickFolder(this.app, folders.map((f) => f.path));

				const folder = target ? cleanFolderPath(target) : "";
				if (!folder) continue;
				await this.moveNote(note, folder);
				moved++;
			}
			if (moved) new Notice(`Filed ${moved} ${moved === 1 ? "note" : "notes"}.`);
		} finally {
			this.filing = false;
		}
	}

	private async suggestFolders(note: TFile, folders: FolderContext[]): Promise<FileResult> {
		const empty: FileResult = { suggestions: [], newFolder: null };
		if (!this.settings.apiKey) return empty;

		const progress = new Notice(`Finding a folder for "${note.basename}"…`, 0);
		try {
			const body = this.body(await this.app.vault.read(note));
			const reply = await chat(
				this.settings.apiKey,
				this.settings.model,
				fileMessages(body, folders, MAX_NOTE_CHARS),
				300,
			);
			return parseFile(reply, new Set(folders.map((f) => f.path)), this.settings.inboxFolder);
		} catch (e) {
			this.reportError(e);
			return empty;
		} finally {
			progress.hide();
		}
	}

	/** Every folder outside the inbox, with a few recent notes as hints for the model. */
	private folderContexts(): FolderContext[] {
		const inbox = this.settings.inboxFolder;
		const contexts: FolderContext[] = [];
		const walk = (folder: TFolder) => {
			for (const child of folder.children) {
				if (!(child instanceof TFolder) || child.name.startsWith(".")) continue;
				if (child.path === inbox || child.path.startsWith(`${inbox}/`)) continue;
				const notes = child.children
					.filter((f): f is TFile => f instanceof TFile && this.isNote(f))
					.map((f) => this.noteEntry(f));
				const examples = sortNotes(notes)
					.slice(0, EXAMPLES_PER_FOLDER)
					.map((n) => (n.description ? `${n.basename} — ${n.description}` : n.basename));
				contexts.push({ path: child.path, examples });
				walk(child);
			}
		};
		walk(this.app.vault.getRoot());
		return contexts.sort((a, b) => a.path.localeCompare(b.path));
	}

	private async moveNote(note: TFile, folder: string): Promise<void> {
		await this.ensureFolder(folder);
		const name = this.freeName(folder, note.basename);
		await this.app.fileManager.renameFile(note, this.notePath(folder, name));
	}

	// ---- Indexes --------------------------------------------------------

	private onVaultChange(file: TAbstractFile): void {
		if (file instanceof TFile && this.isIndexFile(file)) return;
		this.scheduleIndexRebuild();
	}

	scheduleIndexRebuild(): void {
		window.clearTimeout(this.indexTimer);
		this.indexTimer = window.setTimeout(() => {
			this.rebuildIndexes().catch((e) => this.reportError(e));
		}, INDEX_DELAY_MS);
	}

	private async rebuildIndexes(): Promise<void> {
		if (this.rebuilding) {
			this.rebuildAgain = true;
			return;
		}
		this.rebuilding = true;
		try {
			await this.writeIndexes(this.folderNode(this.app.vault.getRoot()));
		} finally {
			this.rebuilding = false;
			if (this.rebuildAgain) {
				this.rebuildAgain = false;
				this.scheduleIndexRebuild();
			}
		}
	}

	private folderNode(folder: TFolder): FolderNode {
		const node: FolderNode = {
			path: this.folderPath(folder),
			name: folder.isRoot() ? this.app.vault.getName() : folder.name,
			folders: [],
			notes: [],
		};
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				if (!child.name.startsWith(".")) node.folders.push(this.folderNode(child));
			} else if (child instanceof TFile && this.isNote(child)) {
				node.notes.push(this.noteEntry(child));
			}
		}
		return node;
	}

	private noteEntry(file: TFile): NoteEntry {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const description = fm?.description;
		return {
			linkPath: file.path.replace(/\.md$/, ""),
			basename: file.basename,
			folder: this.folderPath(file.parent ?? this.app.vault.getRoot()),
			description: typeof description === "string" ? description : undefined,
			...noteDates({ created: fm?.[CREATED], modified: fm?.[MODIFIED], basename: file.basename, mtime: file.stat.mtime }),
		};
	}

	private async writeIndexes(node: FolderNode): Promise<void> {
		const path = this.notePath(node.path, this.settings.indexName);
		const content = renderIndex(node, {
			indexName: this.settings.indexName,
			recentCount: RECENT_COUNT,
			rootTitle: node.name,
		});
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			if ((await this.app.vault.cachedRead(existing)) !== content) {
				await this.app.vault.modify(existing, content);
			}
		} else if (!existing) {
			await this.app.vault.create(path, content);
		}
		for (const child of node.folders) await this.writeIndexes(child);
	}

	// ---- Helpers --------------------------------------------------------

	private isIndexFile(file: TFile): boolean {
		return file.basename === this.settings.indexName;
	}

	private isNote(file: TFile): boolean {
		return file.extension === "md" && !this.isIndexFile(file);
	}

	private body(content: string): string {
		return stripFrontmatter(content).trim();
	}

	/** A free note name in folder, ignoring case; `self` doesn't count as taken. */
	private freeName(folder: string, base: string, self?: TFile): string {
		const parent = folder ? this.app.vault.getAbstractFileByPath(folder) : this.app.vault.getRoot();
		const names = parent instanceof TFolder ? parent.children.filter((c) => c !== self).map((c) => c.name) : [];
		return uniqueBasename(base, nameTaken(names));
	}

	private folderPath(folder: TFolder): string {
		return folder.isRoot() ? "" : folder.path;
	}

	private notePath(folder: string, basename: string): string {
		return folder ? `${folder}/${basename}.md` : `${basename}.md`;
	}

	private exists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) !== null;
	}

	private async ensureFolder(path: string): Promise<void> {
		let current = "";
		for (const segment of path.split("/").filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.exists(current)) await this.app.vault.createFolder(current);
		}
	}

	private reportError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		console.error("Notes System:", error);
		new Notice(`Notes System: ${message}`);
	}
}
