<img src="assets/icon.svg" width="64" height="64" alt="">

# Notes System

A small Obsidian plugin for a simple notes workflow: plain markdown notes in folders, with created/modified dates as properties and a cheap AI model doing the boring parts.

## What it does

- **New notes.** "New note (choose folder)" asks where the note goes (Enter picks the inbox; type a path to make a new folder) and creates `Untitled.md` there (`Untitled 2.md` if that's taken). Also on the new tab page and in a folder's right-click menu.
- **Quick capture.** "Quick capture to inbox" creates an Untitled note in `inbox/` for a thought you'll sort later. Also on the ribbon, so it works on mobile.
- **Created and modified dates.** New notes get `created` and `modified` date & time properties (local time, `YYYY-MM-DDTHH:mm`). When you leave a note whose text changed, `modified` is set to now. They're properties rather than file times because git resets file times on every clone and pull.
- **Automatic title and description.** When you leave a note, the plugin asks the model for a short title and a one-line description. The description goes into the note's `description` property and an Untitled note is renamed to the title. Names you chose yourself are never changed and your text is never edited. It only calls the model again when the note changed a lot.
- **File inbox.** "File inbox notes" goes through the inbox one note at a time. The model sees the note, your folder list and a few recent notes per folder, and suggests up to three folders (or a new one). Nothing moves until you pick.
- **Folder indexes.** Every folder gets a generated `index.md`: subfolders first, then notes by created date, newest first, with their descriptions. The root index also lists the most recently edited notes from everywhere. No AI involved; they update as you work.
- **Vim escape.** Maps `jk` / `kj` (configurable) to `<Esc>` in Obsidian's vim mode.

## Privacy and cost

Requests go to [OpenRouter](https://openrouter.ai) with `provider.data_collection = "deny"` and `provider.zdr = true`, so they're only routed to providers that don't train on or retain prompts. The default model is `mistralai/mistral-small-3.2-24b-instruct`; with short notes a call costs a small fraction of a cent. Notes are cut at 6,000 characters before sending.

The API key lives in the plugin's `data.json` on each device. Don't commit it: add `.obsidian/plugins/*/data.json` to your vault's `.gitignore`.

## Suggested vault `.gitignore`

```gitignore
index.md
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/*/data.json
.obsidian/app.json
.trash/
```

Indexes are rebuilt on each device, so keeping them out of git avoids sync conflicts. Ignoring `app.json` keeps editor settings per device, e.g. vim mode on desktop but not on a phone.

## Development

```sh
npm install
npm test          # unit tests (Node's built-in runner)
npm run build     # type-check and bundle main.js
npm run dev       # rebuild on change
OBSIDIAN_VAULT=/path/to/vault npm run deploy   # copy the build into a vault
```

Then enable **Notes System** under Settings → Community plugins.

Syncing a vault to an iPhone with git is covered in [docs/iphone-setup.md](docs/iphone-setup.md).
