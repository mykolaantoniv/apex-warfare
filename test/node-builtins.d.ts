// Minimal ambient typings for the two Node built-ins used by the F2 unit test.
// We deliberately avoid adding `@types/node` as a devDependency (this test suite is meant to
// stay dependency-free) — these declarations cover just what test/unit/*.test.ts actually calls.
declare module "node:test" {
  export type TestFn = () => void | Promise<void>;
  export function test(name: string, fn: TestFn): void;
}

declare module "node:assert/strict" {
  interface StrictAssert {
    strictEqual(actual: unknown, expected: unknown, message?: string): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string): void;
  }
  const assertStrict: StrictAssert;
  export default assertStrict;
}
