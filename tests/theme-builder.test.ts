import { describe, it, expect } from "vitest";
import { buildThemeCSS } from "../src/utils/theme-builder.js";
import type { DefineThemeConfig } from "@cmssy/types";

// =============================================================================
// buildThemeCSS
// =============================================================================

describe("buildThemeCSS", () => {
  it("should generate header comment with theme name", () => {
    const theme: DefineThemeConfig = { name: "Test Theme" };
    const css = buildThemeCSS(theme);
    expect(css).toContain("/* Cmssy Theme: Test Theme */");
  });

  it("should generate font variables", () => {
    const theme: DefineThemeConfig = {
      name: "Fonts",
      fonts: {
        heading: { family: "Domine", source: "google" },
        body: { family: "Raleway", source: "google" },
      },
    };
    const css = buildThemeCSS(theme);
    expect(css).toContain('--font-heading: "Domine", serif');
    expect(css).toContain('--font-body: "Raleway", sans-serif');
  });

  it("should generate color variables", () => {
    const theme: DefineThemeConfig = {
      name: "Colors",
      colors: {
        primary: "#D4AF37",
        background: "#ffffff",
        foreground: "#334155",
      },
    };
    const css = buildThemeCSS(theme);
    expect(css).toContain("--primary: #D4AF37");
    expect(css).toContain("--background: #ffffff");
    expect(css).toContain("--foreground: #334155");
  });

  it("should generate typography variables and tag styles", () => {
    const theme: DefineThemeConfig = {
      name: "Typography",
      typography: {
        h1: "3rem",
        h2: "2.25rem",
        body: "1rem",
      },
    };
    const css = buildThemeCSS(theme);
    expect(css).toContain("--font-size-h1: 3rem");
    expect(css).toContain("--font-size-h2: 2.25rem");
    expect(css).toContain("--font-size-body: 1rem");
    expect(css).toContain("h1 { font-size: var(--font-size-h1, 3rem); }");
    expect(css).toContain("body { font-size: var(--font-size-body, 1rem); }");
  });

  it("should generate spacing and border radius", () => {
    const theme: DefineThemeConfig = {
      name: "Layout",
      spacing: 1.25,
      borderRadius: "lg",
    };
    const css = buildThemeCSS(theme);
    expect(css).toContain("--theme-spacing: 1.25");
    expect(css).toContain("--radius: 0.625rem");
  });

  it("should handle all border radius presets", () => {
    const presets = {
      none: "0",
      sm: "0.25rem",
      md: "0.5rem",
      lg: "0.625rem",
      full: "9999px",
    };
    for (const [preset, value] of Object.entries(presets)) {
      const css = buildThemeCSS({ name: "t", borderRadius: preset as any });
      expect(css).toContain(`--radius: ${value}`);
    }
  });

  it("should generate dark mode overrides", () => {
    const theme: DefineThemeConfig = {
      name: "Dark",
      darkColors: {
        primary: "#60a5fa",
        background: "#0f172a",
      },
    };
    const css = buildThemeCSS(theme);
    expect(css).toContain(".dark {");
    expect(css).toContain("--primary: #60a5fa");
    expect(css).toContain("--background: #0f172a");
  });

  it("should inject custom variables into :root", () => {
    const theme: DefineThemeConfig = {
      name: "Custom",
      customVariables: {
        "--hero-overlay": "rgba(15,23,42,0.9)",
        "--section-gap": "4rem",
      },
    };
    const css = buildThemeCSS(theme);
    expect(css).toContain("--hero-overlay: rgba(15,23,42,0.9)");
    expect(css).toContain("--section-gap: 4rem");
  });

  it("should append customCSS", () => {
    const theme: DefineThemeConfig = {
      name: "Custom CSS",
      customCSS: ".hero { backdrop-filter: blur(8px); }",
    };
    const css = buildThemeCSS(theme);
    expect(css).toContain(".hero { backdrop-filter: blur(8px); }");
  });
});
