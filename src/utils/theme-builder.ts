/**
 * Theme CSS builder.
 * Compiles a DefineThemeConfig into CSS custom properties + tag styles.
 * Output mirrors the frontend's renderThemeStyles() for local dev preview.
 */
import type { DefineThemeConfig } from "@cmssy/types";

const BORDER_RADIUS_MAP: Record<string, string> = {
  none: "0",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.625rem",
  full: "9999px",
};

const COLOR_MAP: Record<string, string> = {
  primary: "primary",
  primaryForeground: "primary-foreground",
  secondary: "secondary",
  secondaryForeground: "secondary-foreground",
  accent: "accent",
  accentForeground: "accent-foreground",
  background: "background",
  foreground: "foreground",
  muted: "muted",
  mutedForeground: "muted-foreground",
  card: "card",
  cardForeground: "card-foreground",
  border: "border",
  input: "input",
  ring: "ring",
  destructive: "destructive",
};

const TYPO_MAP: Record<string, string> = {
  h1: "font-size-h1",
  h2: "font-size-h2",
  h3: "font-size-h3",
  h4: "font-size-h4",
  h5: "font-size-h5",
  h6: "font-size-h6",
  body: "font-size-body",
  small: "font-size-small",
};

/**
 * Build CSS from a DefineThemeConfig.
 * Returns a complete stylesheet string.
 */
export function buildThemeCSS(theme: DefineThemeConfig): string {
  const lines: string[] = [];
  lines.push(`/* Cmssy Theme: ${theme.name} */`);

  // Font variables
  const vars: string[] = [];

  if (theme.fonts?.heading) {
    vars.push(`--font-heading: "${theme.fonts.heading.family}", serif`);
  }
  if (theme.fonts?.body) {
    vars.push(`--font-body: "${theme.fonts.body.family}", sans-serif`);
  }

  // Color variables
  if (theme.colors) {
    for (const [key, cssVar] of Object.entries(COLOR_MAP)) {
      const value = theme.colors[key as keyof typeof theme.colors];
      if (value) vars.push(`--${cssVar}: ${value}`);
    }
  }

  // Typography variables
  if (theme.typography) {
    for (const [key, cssVar] of Object.entries(TYPO_MAP)) {
      const value = theme.typography[key as keyof typeof theme.typography];
      if (value) vars.push(`--${cssVar}: ${value}`);
    }
  }

  // Spacing + border radius
  if (theme.spacing != null) {
    vars.push(`--theme-spacing: ${theme.spacing}`);
  }
  if (theme.borderRadius) {
    vars.push(
      `--radius: ${BORDER_RADIUS_MAP[theme.borderRadius] ?? "0.625rem"}`,
    );
  }

  // Custom variables
  if (theme.customVariables) {
    for (const [key, value] of Object.entries(theme.customVariables)) {
      vars.push(`${key}: ${value}`);
    }
  }

  if (vars.length > 0) {
    lines.push(`:root {\n  ${vars.join(";\n  ")};\n}`);
  }

  // Typography tag styles
  if (theme.typography) {
    const tags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
    for (const tag of tags) {
      const val = theme.typography[tag];
      if (val) {
        lines.push(`${tag} { font-size: var(--font-size-${tag}, ${val}); }`);
      }
    }
    if (theme.typography.body) {
      lines.push(
        `body { font-size: var(--font-size-body, ${theme.typography.body}); }`,
      );
    }
    if (theme.typography.small) {
      lines.push(
        `small { font-size: var(--font-size-small, ${theme.typography.small}); }`,
      );
    }
  }

  // Dark mode overrides
  if (theme.darkColors) {
    const darkVars: string[] = [];
    for (const [key, cssVar] of Object.entries(COLOR_MAP)) {
      const value = theme.darkColors[key as keyof typeof theme.darkColors];
      if (value) darkVars.push(`--${cssVar}: ${value}`);
    }
    if (darkVars.length > 0) {
      lines.push(`.dark {\n  ${darkVars.join(";\n  ")};\n}`);
    }
  }

  // Custom CSS
  if (theme.customCSS) {
    lines.push(theme.customCSS);
  }

  return lines.join("\n\n");
}

/**
 * Convert DefineThemeConfig to the GraphQL ThemeConfigInput shape
 * used by the updateTheme mutation.
 */
export function convertThemeToInput(
  theme: DefineThemeConfig,
): Record<string, unknown> {
  // Compile customVariables into customCSS prefix
  let customCSS = theme.customCSS || "";
  if (theme.customVariables && Object.keys(theme.customVariables).length > 0) {
    const varLines = Object.entries(theme.customVariables).map(
      ([k, v]) => `  ${k}: ${v};`,
    );
    const prefix = `:root {\n${varLines.join("\n")}\n}`;
    customCSS = customCSS ? `${prefix}\n${customCSS}` : prefix;
  }

  const input: Record<string, unknown> = {};

  if (theme.fonts?.heading) {
    input.headingFont = {
      family: theme.fonts.heading.family,
      source: theme.fonts.heading.source,
      weights: theme.fonts.heading.weights ?? [400, 700],
      customFontUrl: theme.fonts.heading.customFontUrl ?? null,
    };
  }

  if (theme.fonts?.body) {
    input.bodyFont = {
      family: theme.fonts.body.family,
      source: theme.fonts.body.source,
      weights: theme.fonts.body.weights ?? [400, 700],
      customFontUrl: theme.fonts.body.customFontUrl ?? null,
    };
  }

  if (theme.colors) input.colors = theme.colors;
  if (theme.darkColors) input.darkColors = theme.darkColors;
  if (theme.typography) input.typography = theme.typography;
  if (theme.spacing != null) input.spacing = theme.spacing;
  if (theme.borderRadius) input.borderRadius = theme.borderRadius;
  if (customCSS) input.customCSS = customCSS;

  return input;
}
