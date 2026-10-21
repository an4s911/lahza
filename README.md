# Lahza

An Obsidian plugin for a simple notes workflow: plain markdown notes in folders, created and modified dates kept as properties, math that works itself out as you type, and a cheap AI model that writes titles and descriptions and helps you sort an inbox.

It works on desktop and mobile. The AI features need an [OpenRouter](https://openrouter.ai) API key; everything else works without one.

## What it does

- **New notes.** "New note (choose folder)" asks where the note goes (Enter picks the inbox; type a path to make a new folder) and creates `Untitled.md` there (`Untitled 2.md` if that's taken). Also on the new tab page and in a folder's right-click menu.
- **Quick capture.** "Quick capture to inbox" creates an Untitled note in the inbox for a thought you'll sort later. Also on the ribbon, so it works on mobile.
- **Created and modified dates.** New notes get `created` and `modified` date & time properties (local time, `YYYY-MM-DDTHH:mm`). When you leave a note whose text changed, `modified` is set to now. They're properties rather than file times because git resets file times on every clone and pull.
- **Automatic title and description.** When you leave a note, the plugin asks the model for a short title and a one-line description. The description goes into the note's `description` property and an Untitled note is renamed to the title. Names you chose yourself are never changed, and the model never edits your text. It only asks again when the note changed a lot.
- **File inbox.** "File inbox notes" goes through the inbox one note at a time. The model sees the note, your folder list and a few recent notes per folder, and suggests up to three folders (or a new one). Nothing moves until you pick.
- **Folder indexes.** Every folder gets a generated `index.md`: subfolders first, then notes by created date, newest first, with their descriptions. The root index also lists the most recently edited notes from everywhere. No AI involved; they update as you work.
- **Math in notes.** Variables, live results and answers after `=`, in the spirit of Apple's Math Notes. See [Math](#math).
- **Vim escape.** Maps `jk` / `kj` (configurable) to `<Esc>` in Obsidian's vim mode.

## Install

Lahza isn't in Obsidian's community plugin list yet, so install it by hand:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/an4s911/lahza/releases/latest), or build them yourself (see [Development](#development)).
2. Copy them into `<your vault>/.obsidian/plugins/lahza/`.
3. Restart Obsidian, then enable **Lahza** under **Settings → Community plugins**.
4. For the AI features, paste an OpenRouter API key in the plugin's settings.

If your vault syncs with git, commit the plugin folder (but not `data.json`, see [Syncing with git](#syncing-with-git)) and it comes along to your other devices.

## Commands

| Command | What it does |
| --- | --- |
| New note (choose folder) | Pick a folder (Enter for the inbox) and create an Untitled note there. |
| Quick capture to inbox | Create an Untitled note in the inbox. Also a ribbon button. |
| File inbox notes | Go through the inbox with AI folder suggestions. Also a ribbon button. |
| Title and describe current note | Ask the model now, even if the note hasn't changed. |
| Rebuild folder indexes | Regenerate every `index.md`. |

The plugin doesn't set any hotkeys. Bind the ones you use under **Settings → Hotkeys**, for example "New note (choose folder)" to Ctrl/Cmd+N (unbind Obsidian's own "Create new note" first).

## Settings

| Setting | Default | |
| --- | --- | --- |
| OpenRouter API key | empty | Needed for titles, descriptions and inbox filing. |
| Model | `mistralai/mistral-small-3.2-24b-instruct` | Any OpenRouter model ID. |
| Auto title and description | on | Ask the model when you leave a note. |
| Minimum note length | 80 | Shorter notes are left alone. |
| Inbox folder | `inbox` | Where quick captures and the default new note go. |
| Index file name | `index` | Name of the generated index in every folder. |
| Vim escape sequences | `jk, kj` | Empty to turn off. |
| Math results | Suggest | Suggest, Insert (add answers right away) or Off. |

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
- **Answers.** End a line with `=` and the answer appears in grey; Enter or Tab inserts it. That works after an expression (`rent * 12 =`), after a variable (`monthly =`) and after a declaration (`monthly = rent + food =`). The **Math results** setting can switch to inserting answers right away, or turn math off.
- **Live results.** Change a variable and every result that uses it is rewritten, in the same undo step. Results are plain text in the note, so they show in reading view, search and git. Text after a result, like `= 452.14 USD`, is kept.
- **Shown values.** Once a variable is set, `name = 1,300` on a later line shows its current value rather than setting it again. To change a variable further down, use an expression such as `saving = saving + 100`.
- **Operators.** `+ - * /` (also `× ÷` and `x` between values, as in `230 x 26`), `^`, parentheses, `1,200` grouping, `sqrt abs round min max` (`round(x, 2)`; put a space after commas in functions) and `pi`.
- **Percent is strict.** `15%` is `0.15`: `15% of 200` is `30`, `200 + 15% of 200` is `230`, and `200 + 15%` is `200.15`.
- **Colors and tooltips.** Variables and results are colored; errors get a red wavy underline. Hover (or put the cursor on it, on mobile) to see a variable's value or what's wrong.
- **Rounding.** Answers show up to 2 decimals.
- **Not math.** Properties, code blocks, comparisons like `==` and sentences that happen to contain numbers are skipped.

## Privacy and cost

Only the AI features send anything, and only to [OpenRouter](https://openrouter.ai). Requests set `provider.data_collection = "deny"` and `provider.zdr = true`, so they're only routed to providers that don't train on or retain prompts. Notes are cut at 6,000 characters before sending. With the default model and short notes, a call costs a small fraction of a cent.

The API key lives in the plugin's `data.json` on each device. Don't commit it: keep `.obsidian/plugins/*/data.json` out of git (see below). Because that file doesn't sync, enter the key on each device.

## Syncing with git

Lahza is built for a vault kept in a git repo and synced with the community **Git** plugin (Obsidian Git). A suggested vault `.gitignore`:

```gitignore
index.md
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/*/data.json
.obsidian/app.json
.trash/
```

- **`index.md`**: indexes are rebuilt on each device, so keeping them out of git avoids sync conflicts. If you change the index file name, change this line too.
- **`workspace*.json`**: open tabs and panes, different on each device.
- **`plugins/*/data.json`**: plugin settings, which can hold API keys and tokens.
- **`app.json`**: editor settings stay per device, e.g. vim mode on desktop but not on a phone.

To set up sync on an iPhone, see [docs/iphone-setup.md](docs/iphone-setup.md).

## Development

```sh
npm install
npm test          # unit tests (Node's built-in runner)
npm run build     # type-check and bundle main.js
npm run dev       # rebuild on change
OBSIDIAN_VAULT=/path/to/vault npm run deploy   # copy the build into a vault
```

After deploying, reload the plugin (turn it off and on under Community plugins) to pick up the new build.

The code lives in `src/`. Modules that don't import `obsidian` (`calc`, `calcNote`, `dates`, `naming`, `indexer`, `folders`, `content`, `prompts`) are pure and have tests in `test/`.

## License

[MIT](LICENSE)

## Disclaimer

This plugin is vibe coded: it was written mostly by an AI coding assistant, with a human deciding what to build and testing it in daily use. It works, and it has tests, but read the code before you rely on it, and keep backups of your notes.
