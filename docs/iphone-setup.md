# iPhone setup (git sync)

This connects Obsidian on an iPhone to a vault stored in a private GitLab repo, using the community **Git** plugin (Obsidian Git). It syncs when you open the app and while it's open; iOS doesn't allow background sync.

Replace `<your-username>` and `<your-vault-repo>` with your own values.

## 1. Create an access token

Mobile git can't use SSH, so it needs a token over HTTPS.

1. On gitlab.com open your user settings → **Personal access tokens** (<https://gitlab.com/-/user_settings/personal_access_tokens>) → **Add new token**.
2. Name it e.g. `obsidian-iphone` and set an expiry date (you'll renew it when it runs out).
3. Scopes: `read_repository` and `write_repository` only.
4. Create it and copy the token. You'll only see it once.

Note: a personal access token works for every repo your account can access, not only the vault. Keep the scopes minimal and the expiry short. If your GitLab plan offers project access tokens, a token on just the vault project is narrower.

## 2. Install and clone

1. Install **Obsidian** from the App Store.
2. Create a new, empty vault (any name, e.g. the repo name). Don't use iCloud for it.
3. **Settings → Community plugins → Turn on community plugins → Browse**, install **Git** (by Vinzent) and enable it.
4. In the Git plugin settings, under **Authentication/commit author**, set:
   - Username: `<your-username>`
   - Password/personal access token: the token from step 1
   - Author name and email for commits
5. Open the command palette (swipe down) → **Git: Clone an existing remote repo**.
   - URL: `https://gitlab.com/<your-username>/<your-vault-repo>.git`
   - Directory: leave empty to clone into the vault root.
   - When asked about the `.obsidian` config folder, choose to use the one from the repo.
   - Depth: leave empty for full history, or enter `1` for a faster first clone.
6. When it's done, close and reopen Obsidian. Your notes, settings and plugins appear.

## 3. Turn on syncing

In the Git plugin settings:

- **Pull on startup**: on.
- **Auto commit-and-sync interval**: e.g. `5` minutes.
- Run **Git: Commit-and-sync** from the command palette any time you want to sync right away, e.g. before closing the app.

## 4. Notes System plugin

The plugin files come with the vault, but its settings don't sync (they hold the API key):

1. **Settings → Community plugins** → make sure **Notes System** is enabled.
2. Open its settings and paste your OpenRouter API key.

## Tips

- Avoid editing the same note on the laptop and the phone at the same time; sync first.
- If a pull reports a conflict, open **Git: Open source control view** to see which file, fix it, then commit-and-sync.
- Editor settings such as vim mode live in `.obsidian/app.json`. Keep that file out of git (see the README's `.gitignore`) so the desktop can use vim mode while the phone doesn't.
