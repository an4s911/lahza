// Copies the built plugin into a vault: OBSIDIAN_VAULT=/path/to/vault npm run deploy
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const vault = process.env.OBSIDIAN_VAULT;
if (!vault) {
	console.error("Set OBSIDIAN_VAULT to the vault folder.");
	process.exit(1);
}
if (!existsSync(join(vault, ".obsidian"))) {
	console.error(`No .obsidian folder in ${vault}; is it a vault?`);
	process.exit(1);
}

const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const target = join(vault, ".obsidian", "plugins", id);
mkdirSync(target, { recursive: true });

for (const file of ["main.js", "manifest.json", "styles.css"]) {
	if (existsSync(file)) {
		copyFileSync(file, join(target, file));
		console.log(`copied ${file} -> ${target}`);
	}
}
