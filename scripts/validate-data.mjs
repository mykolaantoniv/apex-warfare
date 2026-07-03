// Lightweight content validator. M2: structural checks + unique IDs.
// A full JSON-Schema/zod pass (referential integrity across vehicles/weapons/maps/
// missions/trees) is added by content-agent at M4. Run: `npm run validate-data`.
import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/data/content", import.meta.url));

const REQUIRED = {
  vehicles: ["id", "name", "class", "movement", "stats"],
  missions: ["id", "mapId", "name", "type", "killTarget", "enemyRoster", "unlock"],
};

let errors = 0;
const ids = new Set();

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // no content dir yet
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await walk(full);
    } else if (extname(e.name) === ".json") {
      await check(full, dir);
    }
  }
}

async function check(file, dir) {
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    console.error(`✗ ${file}: invalid JSON — ${err.message}`);
    errors++;
    return;
  }
  const kind = dir.split(/[\\/]/).pop();
  const required = REQUIRED[kind] ?? ["id"];
  for (const key of required) {
    if (!(key in data)) {
      console.error(`✗ ${file}: missing required field "${key}"`);
      errors++;
    }
  }
  if (kind === "missions" && (!Array.isArray(data.enemyRoster) || data.enemyRoster.length === 0)) {
    console.error(`✗ ${file}: enemyRoster must be a non-empty array`);
    errors++;
  }
  if (typeof data.id === "string") {
    if (ids.has(data.id)) {
      console.error(`✗ ${file}: duplicate id "${data.id}"`);
      errors++;
    }
    ids.add(data.id);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.id)) {
      console.error(`✗ ${file}: id "${data.id}" is not kebab-case`);
      errors++;
    }
  }
}

await walk(ROOT);

if (errors > 0) {
  console.error(`\n${errors} content error(s).`);
  process.exit(1);
}
console.log(`✓ content valid (${ids.size} item(s)).`);
