# iPhone setup (git sync)

This connects Obsidian on an iPhone to a vault stored in a private GitLab repo, using the community **Git** plugin (Obsidian Git). It syncs when you open the app and while it's open; iOS doesn't allow background sync.

Replace `<your-username>` and `<your-vault-repo>` with your own values.

## 1. Create an access token

Mobile git can't use SSH, so it needs a token over HTTPS. Use a **fine-grained** token limited to the vault repo, so a lost phone can't reach your other projects.

1. On gitlab.com select your **avatar** (upper-right) → **Edit profile**.
2. In the left sidebar select **Access** → **Personal access tokens**.
3. From the **Generate token** dropdown select **Fine-grained token**.
4. **Name**: e.g. `obsidian-iphone`. **Description**: optional.
5. **Expiration date**: up to 365 days (blank means 365). Set a reminder to renew it; sync stops when it expires.
6. **Group and project access**: limit it to specific projects and select `<your-vault-repo>`.
7. **Add resource permissions**, **Group and project** tab: select the **Code** resource, then tick **Download** (clone/pull) and **Push**. Nothing else is needed.
8. Add all permissions before generating; plan on making a new token rather than editing this one.
9. Select **Generate token** and copy it right away. It's shown only once.

If fine-grained tokens aren't available to you, choose **Legacy token** instead with only the `read_repository` and `write_repository` scopes and a short expiry. Note that a legacy token works for every repo your account can access.

## 2. Install and clone

1. Install **Obsidian** from the App Store.
2. Create a new, empty vault (any name, e.g. the repo name). Don't use iCloud for it.
3. **Settings → Community plugins → Turn on community plugins → Browse**, install **Git** (by Vinzent) and enable it.
4. In the Git plugin settings, under **Authentication/commit author**, set:
   - Username: `<your-username>` (GitLab doesn't check it over HTTPS, but use your real one)
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
