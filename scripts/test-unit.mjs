// Compiles test/**/*.ts (CommonJS, via the already-installed `typescript` devDependency) to
// .test-out/ and runs the result with Node's built-in test runner (node:test). No test-framework
// dependency (jest/vitest/mocha) is added — see tsconfig.test.json for the compile config.
//
// The extra package.json below is needed because the repo root is "type": "module" (ESM), but
// tsc emits CommonJS for the test build (so plain extensionless `require()` of sibling .ts-turned
// .js files resolves the same way import resolution works for the app's TS source, which uses no
// file extensions). A nested package.json with "type": "commonjs" makes Node treat everything
// under .test-out/ as CommonJS regardless of the root config.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

execFileSync(npxCmd, ["tsc", "-p", "tsconfig.test.json"], { cwd: root, stdio: "inherit", shell: true });

// NOTE: these URLs are resolved against scripts/test-unit.mjs, so the outDir (`.test-out/` at the
// repo ROOT, per tsconfig.test.json) is one level UP — hence "../.test-out/". Writing to
// "./.test-out/" would land in scripts/ and leave the real outDir without the CJS marker.
mkdirSync(new URL("../.test-out/", import.meta.url), { recursive: true });
writeFileSync(new URL("../.test-out/package.json", import.meta.url), JSON.stringify({ type: "commonjs" }) + "\n");

execFileSync(process.execPath, ["--test", ".test-out/test/unit/difficulty.test.js"], {
  cwd: root,
  stdio: "inherit",
});
