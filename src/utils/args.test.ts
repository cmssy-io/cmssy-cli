import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("splits positionals and flags", () => {
    const r = parseArgs(["init", "my-app", "--pm", "pnpm", "--skip-install"]);
    expect(r.positionals).toEqual(["init", "my-app"]);
    expect(r.flags).toEqual({ pm: "pnpm", "skip-install": true });
  });

  it("supports --key=value and short flags", () => {
    const r = parseArgs(["--slug=demo", "-v"]);
    expect(r.flags).toEqual({ slug: "demo", v: true });
  });

  it("treats a trailing flag as boolean", () => {
    expect(parseArgs(["link", "--no-link"]).flags).toEqual({ "no-link": true });
  });
});
