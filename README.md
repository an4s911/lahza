<img src="assets/icon.svg" width="64" height="64" alt="">

# Lahza

A small Obsidian plugin for a simple notes workflow: plain markdown notes in folders, with created/modified dates as properties and a cheap AI model doing the boring parts.

## What it does

- **New notes.** "New note (choose folder)" asks where the note goes (Enter picks the inbox; type a path to make a new folder) and creates `Untitled.md` there (`Untitled 2.md` if that's taken). Also on the new tab page and in a folder's right-click menu.
- **Quick capture.** "Quick capture to inbox" creates an Untitled note in `inbox/` for a thought you'll sort later. Also on the ribbon, so it works on mobile.
- **Created and modified dates.** New notes get `created` and `modified` date & time properties (local time, `YYYY-MM-DDTHH:mm`). When you leave a note whose text changed, `modified` is set to now. They're properties rather than file times because git resets file times on every clone and pull.
- **Automatic title and description.** When you leave a note, the plugin asks the model for a short title and a one-line description. The description goes into the note's `description` property and an Untitled note is renamed to the title. Names you chose yourself are never changed and your text is never edited. It only calls the model again when the note changed a lot.
- **File inbox.** "File inbox notes" goes through the inbox one note at a time. The model sees the note, your folder list and a few recent notes per folder, and suggests up to three folders (or a new one). Nothing moves until you pick.
- **Folder indexes.** Every folder gets a generated `index.md`: subfolders first, then notes by created date, newest first, with their descriptions. The root index also lists the most recently edited notes from everywhere. No AI involved; they update as you work.
- **Math in notes.** Like Apple's Math Notes, typed. See [Math](#math).
- **Vim escape.** Maps `jk` / `kj` (configurable) to `<Esc>` in Obsidian's vim mode.

## Math

Lines that are just math are worked out as you type. Everything else is left alone.

```
rent = 1200
food = 450
monthly = rent + food = 1,650
monthly * 12 = 19,800
monthly =  1,650
```

- **Variables.** `name = value` or `name = expression` sets a variable for the rest of the note, read top to bottom. Names are one word of Latin letters, digits and `_`, and are case-sensitive (`phoneRecharge` and `phonerecharge` are different). List markers and indentation in front are fine.
- **Answers.** End a line with `=` and the answer appears in grey; Enter or Tab inserts it. That works after an expression (`rent * 12 =`), after a variable (`monthly =`) and after a declaration (`monthly = rent + food =`). Settings can switch to inserting answers right away, or turn math off.
- **Live results.** Change a variable and every result that uses it is rewritten, in the same undo step. Results are plain text in the note, so they show in reading view, search and git. Text after a result, like `= 452.14 USD`, is kept.
- **Shown values.** Once a variable is set, `name = 1,300` on a later line shows its current value rather than setting it again. To change a variable further down, use an expression such as `saving = saving + 100`.
- **Operators.** `+ - * /` (also `× ÷` and `x` between values, as in `230 x 26`), `^`, parentheses, `1,200` grouping, `sqrt abs round min max` (`round(x, 2)`; put a space after commas in functions) and `pi`.
- **Percent is strict.** `15%` is `0.15`: `15% of 200` is `30`, `200 + 15% of 200` is `230`, and `200 + 15%` is `200.15`.
- **Colors and tooltips.** Variables and results are colored; errors get a red wavy underline. Hover (or put the cursor on it, on mobile) to see a variable's value or what's wrong.
- **Rounding.** Answers show up to 2 decimals.

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

Then enable **Lahza** under Settings → Community plugins.

Syncing a vault to an iPhone with git is covered in [docs/iphone-setup.md](docs/iphone-setup.md).
