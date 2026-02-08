import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { generateDevApp, regeneratePreviewPages } from "../src/utils/dev-generator.js";
import type { ScannedResource } from "../src/utils/scanner.js";

let tmpDir: string;

function createResource(
  overrides: Partial<ScannedResource> = {},
): ScannedResource {
  return {
    type: "block",
    name: "hero",
    path: "",
    displayName: "Hero",
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmssy-dev-gen-"));

  // Create minimal project structure so the generator can find block source
  fs.mkdirSync(path.join(tmpDir, "blocks/hero/src"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "blocks/hero/src/index.tsx"),
    'export { default } from "./Hero";\nimport "./index.css";\n',
  );
  fs.writeFileSync(
    path.join(tmpDir, "blocks/hero/src/index.css"),
    ".hero { color: red; }",
  );
  fs.writeFileSync(
    path.join(tmpDir, "blocks/hero/preview.json"),
    JSON.stringify({ title: "Hello World" }),
  );
});

afterEach(() => {
  fs.removeSync(tmpDir);
});

// =============================================================================
// generateDevApp
// =============================================================================

describe("generateDevApp", () => {
  it("should create .cmssy/dev directory structure", () => {
    const resources = [createResource()];
    const devRoot = generateDevApp(tmpDir, resources);

    expect(devRoot).toBe(path.join(tmpDir, ".cmssy/dev"));
    expect(fs.existsSync(devRoot)).toBe(true);
  });

  it("should generate next.config.mjs", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const configPath = path.join(tmpDir, ".cmssy/dev/next.config.mjs");
    expect(fs.existsSync(configPath)).toBe(true);

    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("nextConfig");
    expect(content).toContain("turbopack");
    expect(content).toContain("remotePatterns");
  });

  it("should generate tsconfig.json with relative block paths", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const tsconfigPath = path.join(tmpDir, ".cmssy/dev/tsconfig.json");
    expect(fs.existsSync(tsconfigPath)).toBe(true);

    const tsconfig = fs.readJsonSync(tsconfigPath);
    expect(tsconfig.compilerOptions.jsx).toBe("preserve");
    expect(tsconfig.compilerOptions.plugins).toContainEqual({ name: "next" });

    // Paths must be relative (../../) not absolute
    const paths = tsconfig.compilerOptions.paths;
    expect(paths["@blocks/*"][0]).toBe("../../blocks/*");
    expect(paths["@templates/*"][0]).toBe("../../templates/*");
    expect(paths["@styles/*"][0]).toBe("../../styles/*");
    expect(paths["@lib/*"][0]).toBe("../../lib/*");
  });

  it("should generate root layout", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const layoutPath = path.join(tmpDir, ".cmssy/dev/app/layout.tsx");
    expect(fs.existsSync(layoutPath)).toBe(true);

    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("RootLayout");
    expect(content).toContain("Cmssy Dev Server");
  });

  it("should NOT import project CSS in layout (project handles its own CSS)", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const layoutPath = path.join(tmpDir, ".cmssy/dev/app/layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).not.toContain("@styles");
    expect(content).not.toContain("main.css");
  });

  it("should generate home page with dev UI", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const pagePath = path.join(tmpDir, ".cmssy/dev/app/page.tsx");
    expect(fs.existsSync(pagePath)).toBe(true);

    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).toContain('"use client"');
    expect(content).toContain("DevHome");
    expect(content).toContain("/api/blocks");
  });

  it("should generate API routes", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/api/blocks/route.ts"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".cmssy/dev/app/api/blocks/[name]/config/route.ts",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          ".cmssy/dev/app/api/preview/[blockName]/route.ts",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/api/workspaces/route.ts"),
      ),
    ).toBe(true);
  });

  it("should generate preview page for each block", () => {
    const resources = [
      createResource({ name: "hero", displayName: "Hero Section" }),
      createResource({ name: "features", displayName: "Features" }),
    ];

    // Create features block source
    fs.mkdirSync(path.join(tmpDir, "blocks/features/src"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "blocks/features/src/index.tsx"),
      'export { default } from "./Features";\n',
    );

    generateDevApp(tmpDir, resources);

    const heroPage = path.join(
      tmpDir,
      ".cmssy/dev/app/preview/hero/page.tsx",
    );
    const featuresPage = path.join(
      tmpDir,
      ".cmssy/dev/app/preview/features/page.tsx",
    );

    expect(fs.existsSync(heroPage)).toBe(true);
    expect(fs.existsSync(featuresPage)).toBe(true);

    // page.tsx directly imports block component (no client wrapper)
    const heroPageContent = fs.readFileSync(heroPage, "utf-8");
    expect(heroPageContent).toContain("@blocks/hero/src/index");
    expect(heroPageContent).toContain("HeroPreview");
    expect(heroPageContent).toContain("BlockComponent");

    // No client.tsx wrapper should exist
    const heroClient = path.join(tmpDir, ".cmssy/dev/app/preview/hero/client.tsx");
    expect(fs.existsSync(heroClient)).toBe(false);

    // page.tsx should NOT have "use client" — blocks must declare it themselves
    expect(heroPageContent).not.toContain('"use client"');
  });

  it("should use @templates alias for template resources", () => {
    const resources = [
      createResource({
        type: "template",
        name: "landing",
        displayName: "Landing Page",
      }),
    ];

    // Create template source
    fs.mkdirSync(path.join(tmpDir, "templates/landing/src"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "templates/landing/src/index.tsx"),
      'export { default } from "./Landing";\n',
    );

    generateDevApp(tmpDir, resources);

    const pagePath = path.join(
      tmpDir,
      ".cmssy/dev/app/preview/landing/page.tsx",
    );
    expect(fs.existsSync(pagePath)).toBe(true);

    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).toContain("@templates/landing/src/index");
  });

  it("should import CSS in page.tsx when index.css exists", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const pagePath = path.join(
      tmpDir,
      ".cmssy/dev/app/preview/hero/page.tsx",
    );
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).toContain("@blocks/hero/src/index.css");
  });

  it("should skip CSS import when no index.css", () => {
    fs.removeSync(path.join(tmpDir, "blocks/hero/src/index.css"));

    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const pagePath = path.join(
      tmpDir,
      ".cmssy/dev/app/preview/hero/page.tsx",
    );
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).not.toContain("index.css");
  });

  it("should skip blocks without index.tsx", () => {
    // Create a block without index.tsx
    fs.mkdirSync(path.join(tmpDir, "blocks/empty/src"), { recursive: true });

    const resources = [
      createResource(),
      createResource({ name: "empty", displayName: "Empty Block" }),
    ];
    generateDevApp(tmpDir, resources);

    // hero should exist, empty should not
    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/preview/hero/page.tsx"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/preview/empty/page.tsx"),
      ),
    ).toBe(false);
  });

  it("should clean previous dev app on regeneration", () => {
    const resources = [createResource()];

    // First generation
    generateDevApp(tmpDir, resources);
    const stalePath = path.join(
      tmpDir,
      ".cmssy/dev/app/preview/old-block/page.tsx",
    );
    fs.mkdirSync(path.dirname(stalePath), { recursive: true });
    fs.writeFileSync(stalePath, "stale content");

    // Second generation
    generateDevApp(tmpDir, resources);

    // Stale file should be gone
    expect(fs.existsSync(stalePath)).toBe(false);
  });
});

// =============================================================================
// regeneratePreviewPages
// =============================================================================

describe("regeneratePreviewPages", () => {
  it("should regenerate preview pages for new blocks", () => {
    const resources = [createResource()];

    // First: generate full app
    generateDevApp(tmpDir, resources);

    // Add a new block
    fs.mkdirSync(path.join(tmpDir, "blocks/cta/src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "blocks/cta/src/index.tsx"),
      'export { default } from "./Cta";\n',
    );

    const newResources = [
      ...resources,
      createResource({ name: "cta", displayName: "CTA" }),
    ];

    regeneratePreviewPages(tmpDir, newResources);

    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/preview/cta/page.tsx"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/preview/hero/page.tsx"),
      ),
    ).toBe(true);
  });

  it("should remove preview pages for deleted blocks", () => {
    const resources = [
      createResource(),
      createResource({ name: "features", displayName: "Features" }),
    ];

    // Create features source
    fs.mkdirSync(path.join(tmpDir, "blocks/features/src"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "blocks/features/src/index.tsx"),
      'export { default } from "./Features";\n',
    );

    generateDevApp(tmpDir, resources);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/preview/features/page.tsx"),
      ),
    ).toBe(true);

    // Regenerate with only hero
    regeneratePreviewPages(tmpDir, [createResource()]);

    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/preview/hero/page.tsx"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".cmssy/dev/app/preview/features/page.tsx"),
      ),
    ).toBe(false);
  });
});

// =============================================================================
// Generated content: next.config webpack aliases
// =============================================================================

describe("generated tsconfig paths", () => {
  it("should use relative paths from .cmssy/dev/ to project root", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const tsconfig = fs.readJsonSync(
      path.join(tmpDir, ".cmssy/dev/tsconfig.json"),
    );
    const paths = tsconfig.compilerOptions.paths;

    // All paths must be relative (../../) — absolute paths break Turbopack
    for (const [alias, targets] of Object.entries(paths) as [string, string[]][]) {
      for (const target of targets) {
        expect(target, `${alias} path must be relative`).toMatch(/^\.\.\//);
        expect(target, `${alias} path must NOT be absolute`).not.toMatch(/^\//);
      }
    }
  });

  it("should include source files from project root", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const tsconfig = fs.readJsonSync(
      path.join(tmpDir, ".cmssy/dev/tsconfig.json"),
    );

    // Include should also use relative paths
    const blockIncludes = tsconfig.include.filter((p: string) =>
      p.includes("blocks"),
    );
    expect(blockIncludes.length).toBeGreaterThan(0);
    for (const inc of blockIncludes) {
      expect(inc, "include path must be relative").toMatch(/^\.\.\//);
    }
  });

  it("should NOT use webpack or resolveAlias in next.config", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const content = fs.readFileSync(
      path.join(tmpDir, ".cmssy/dev/next.config.mjs"),
      "utf-8",
    );

    expect(content).not.toContain("webpack");
    expect(content).not.toContain("resolveAlias");
  });
});

// =============================================================================
// Generated content: no PostCSS config (project handles its own CSS)
// =============================================================================

describe("postcss config", () => {
  it("should NOT generate postcss.config (project's own config is used)", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    expect(
      fs.existsSync(path.join(tmpDir, ".cmssy/dev/postcss.config.mjs")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, ".cmssy/dev/postcss.config.js")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, ".cmssy/dev/postcss.config.cjs")),
    ).toBe(false);
  });
});

// =============================================================================
// Generated content: API routes
// =============================================================================

describe("generated API routes", () => {
  it("blocks route should scan both blocks/ and templates/ dirs", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const content = fs.readFileSync(
      path.join(tmpDir, ".cmssy/dev/app/api/blocks/route.ts"),
      "utf-8",
    );

    expect(content).toContain("CMSSY_PROJECT_ROOT");
    expect(content).toContain('"blocks"');
    expect(content).toContain('"templates"');
    expect(content).toContain("NextResponse.json");
  });

  it("preview route should support GET and POST", () => {
    const resources = [createResource()];
    generateDevApp(tmpDir, resources);

    const content = fs.readFileSync(
      path.join(
        tmpDir,
        ".cmssy/dev/app/api/preview/[blockName]/route.ts",
      ),
      "utf-8",
    );

    expect(content).toContain("export async function GET");
    expect(content).toContain("export async function POST");
    expect(content).toContain("preview.json");
  });
});
