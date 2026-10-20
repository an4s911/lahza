import { type App, PluginSettingTab, Setting } from "obsidian";
import type NotesSystemPlugin from "./main.ts";

export interface NotesSettings {
	apiKey: string;
	model: string;
	inboxFolder: string;
	indexName: string;
	autoDescribe: boolean;
	minLength: number;
	vimEscape: string;
	mathResults: MathResults;
}

export type MathResults = "suggest" | "insert" | "off";

export const DEFAULT_SETTINGS: NotesSettings = {
	apiKey: "",
	model: "mistralai/mistral-small-3.2-24b-instruct",
	inboxFolder: "inbox",
	indexName: "index",
	autoDescribe: true,
	minLength: 80,
	vimEscape: "jk, kj",
	mathResults: "suggest",
};

export class NotesSettingTab extends PluginSettingTab {
	plugin: NotesSystemPlugin;

	constructor(app: App, plugin: NotesSystemPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl).setName("AI").setHeading();

		new Setting(containerEl)
			.setName("OpenRouter API key")
			.setDesc("Stored in this plugin's data.json on this device only. Keep data.json out of git.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("sk-or-...")
					.setValue(settings.apiKey)
					.onChange(async (value) => {
						settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("OpenRouter model ID. Requests only use providers that don't train on or retain prompts.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.model)
					.setValue(settings.model)
					.onChange(async (value) => {
						settings.model = value.trim() || DEFAULT_SETTINGS.model;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto title and description")
			.setDesc("When you leave a note, add a description and rename an Untitled note to its title.")
			.addToggle((toggle) =>
				toggle.setValue(settings.autoDescribe).onChange(async (value) => {
					settings.autoDescribe = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Minimum note length")
			.setDesc("Notes shorter than this many characters are left alone.")
			.addText((text) =>
				text.setValue(String(settings.minLength)).onChange(async (value) => {
					const n = Number.parseInt(value, 10);
					settings.minLength = Number.isFinite(n) && n >= 0 ? n : DEFAULT_SETTINGS.minLength;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Folders").setHeading();

		new Setting(containerEl)
			.setName("Inbox folder")
			.setDesc("Quick captures go here.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.inboxFolder)
					.setValue(settings.inboxFolder)
					.onChange(async (value) => {
						settings.inboxFolder = value.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_SETTINGS.inboxFolder;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Index file name")
			.setDesc("Name of the generated index note in every folder (without .md).")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.indexName)
					.setValue(settings.indexName)
					.onChange(async (value) => {
						settings.indexName = value.trim() || DEFAULT_SETTINGS.indexName;
						await this.plugin.saveSettings();
						this.plugin.scheduleIndexRebuild();
					}),
			);

		new Setting(containerEl).setName("Editor").setHeading();

		new Setting(containerEl)
			.setName("Vim escape sequences")
			.setDesc("Comma-separated keys that leave insert mode in vim mode, e.g. \"jk, kj\". Empty to disable.")
			.addText((text) =>
				text.setValue(settings.vimEscape).onChange(async (value) => {
					settings.vimEscape = value;
					await this.plugin.saveSettings();
					this.plugin.applyVimEscape();
				}),
			);

		new Setting(containerEl).setName("Math").setHeading();

		new Setting(containerEl)
			.setName("Math results")
			.setDesc(
				"Lines like \"rent = 1200\" set variables; ending a line with \"=\" gives the answer. Suggest shows it in grey (Enter or Tab inserts it); Insert adds it right away. Results update when variables change.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ suggest: "Suggest", insert: "Insert", off: "Off" })
					.setValue(settings.mathResults)
					.onChange(async (value) => {
						settings.mathResults = value as MathResults;
						await this.plugin.saveSettings();
						this.plugin.applyMathResults();
					}),
			);
	}
}
