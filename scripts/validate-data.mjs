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

// Keep in sync with `PropKey` (src/engine/Props.ts) — this script runs under plain node ESM so it
// can't import the .ts source; the prop kit changes rarely enough that a literal list is fine.
const VALID_PROP_KEYS = new Set([
  "pineSnow",
  "tree",
  "treeAutumn",
  "treeDead",
  "rock",
  "rockLarge",
  "mountain",
  "cabin",
  "container",
  "barrel",
  "pipe",
  "crate",
  "barrier",
  "barrierLow",
]);

let errors = 0;
const ids = new Set();

/** Validates a map's optional hand-authored `props` array (BACKLOG §C0). Returns error count. */
function checkMapProps(file, data) {
  let errs = 0;
  if (!Array.isArray(data.props)) {
    console.error(`✗ ${file}: "props" must be an array`);
    return 1;
  }
  const half = typeof data.half === "number" ? data.half : undefined;
  data.props.forEach((p, i) => {
    const tag = `${file}: props[${i}]`;
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      console.error(`✗ ${tag} must be an object`);
      errs++;
      return;
    }
    if (typeof p.key !== "string" || !VALID_PROP_KEYS.has(p.key)) {
      console.error(`✗ ${tag}.key "${p.key}" is not a valid PropKey`);
      errs++;
    }
    for (const field of ["x", "z"]) {
      if (typeof p[field] !== "number" || !Number.isFinite(p[field])) {
        console.error(`✗ ${tag}.${field} must be a finite number`);
        errs++;
      } else if (half !== undefined && Math.abs(p[field]) > half) {
        console.error(`✗ ${tag}.${field}=${p[field]} is outside the map's half-extent (${half})`);
        errs++;
      }
    }
    if (p.yaw !== undefined && typeof p.yaw !== "number") {
      console.error(`✗ ${tag}.yaw must be a number (degrees)`);
      errs++;
    }
    if (p.s !== undefined && (typeof p.s !== "number" || p.s <= 0)) {
      console.error(`✗ ${tag}.s must be a positive number`);
      errs++;
    }
  });
  return errs;
}

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
  if (kind === "maps" && data.props !== undefined) {
    errors += checkMapProps(file, data);
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
