import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs-extra";
import {
  checkBlockDependencies,
  printMissingDeps,
} from "../src/utils/dependency-check.js";

vi.mock("fs-extra");

describe("checkBlockDependencies", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty when no blocks have dependencies", () => {
    const result = checkBlockDependencies(
      [{ name: "hero", config: {} }],
      "/project",
    );
    expect(result).toEqual([]);
  });

  it("returns empty when config is null", () => {
    const result = checkBlockDependencies(
      [{ name: "hero", config: null }],
      "/project",
    );
    expect(result).toEqual([]);
  });

  it("detects missing packages", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = checkBlockDependencies(
      [
        {
          name: "hero",
          config: { dependencies: { "framer-motion": "^11.0.0" } },
        },
      ],
      "/project",
    );
    expect(result).toHaveLength(1);
    expect(result[0].packageName).toBe("framer-motion");
    expect(result[0].versionRange).toBe("^11.0.0");
    expect(result[0].blockName).toBe("hero");
  });

  it("skips installed packages", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = checkBlockDependencies(
      [
        {
          name: "hero",
          config: { dependencies: { "framer-motion": "^11.0.0" } },
        },
      ],
      "/project",
    );
    expect(result).toEqual([]);
  });

  it("handles scoped packages", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = checkBlockDependencies(
      [
        {
          name: "hero",
          config: { dependencies: { "@org/pkg": "^1.0.0" } },
        },
      ],
      "/project",
    );
    expect(result).toHaveLength(1);
    expect(result[0].packageName).toBe("@org/pkg");
  });

  it("groups missing deps across blocks", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = checkBlockDependencies(
      [
        {
          name: "hero",
          config: { dependencies: { "lucide-react": "^0.400.0" } },
        },
        {
          name: "header",
          config: { dependencies: { "lucide-react": "^0.400.0" } },
        },
      ],
      "/project",
    );
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.packageName === "lucide-react")).toBe(true);
  });
});

describe("printMissingDeps", () => {
  it("does not print for empty array", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printMissingDeps([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("prints grouped output with install command", () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    printMissingDeps([
      {
        blockName: "hero",
        packageName: "framer-motion",
        versionRange: "^11.0.0",
      },
      {
        blockName: "header",
        packageName: "framer-motion",
        versionRange: "^11.0.0",
      },
      {
        blockName: "hero",
        packageName: "lucide-react",
        versionRange: "^0.400.0",
      },
    ]);

    const output = logs.join("\n");
    expect(output).toContain("framer-motion");
    expect(output).toContain("lucide-react");
    expect(output).toContain("npm install");

    spy.mockRestore();
  });
});
