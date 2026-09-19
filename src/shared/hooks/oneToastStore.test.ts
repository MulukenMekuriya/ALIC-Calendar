/**
 * Every toast must be dispatched into the one store <Toaster /> renders.
 *
 * This exists because it did not hold. `src/hooks/use-toast.ts` held a
 * byte-identical copy of the hook, and the store is module scope — so the copy
 * was a SECOND store. <Toaster /> subscribed to the copy while 38 screens
 * dispatched into `src/shared/hooks/use-toast.ts`, and every toast raised
 * anywhere in the app was rendered by nobody.
 *
 * Nothing failed loudly. Member registration, for one, would refuse a write,
 * catch the error, raise a toast explaining it, and leave the form sitting
 * there looking like a dead button — which is exactly how it was reported.
 *
 * The rule is: one implementation, re-exported. Not one per directory.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
/** The one file allowed to own the store. */
const CANONICAL = join(SRC, "shared", "hooks", "use-toast.ts");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("one toast store", () => {
  const files = walk(SRC).filter((f) => !f.endsWith(".test.ts"));

  it("has exactly one module holding the listener array", () => {
    // The store is whatever declares the listeners it notifies. A second
    // declaration anywhere is a second store, however identical its code.
    const owners = files.filter((f) =>
      /listeners\s*:\s*Array<|listeners\s*:\s*\(/.test(readFileSync(f, "utf8")),
    );
    expect(owners).toEqual([CANONICAL]);
  });

  it("routes every toast import to that module", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const spec of source.matchAll(/from\s+"([^"]*use-toast)"/g)) {
        // A re-export shim resolving to the canonical module is fine; a
        // second path that resolves to a second FILE is not.
        expect(
          spec[1] === "@/shared/hooks/use-toast" || spec[1] === "./use-toast",
          `${file} imports the toast hook from "${spec[1]}" — it must come from @/shared/hooks/use-toast, or toasts raised there are never rendered`,
        ).toBe(true);
      }
    }
  });
});
