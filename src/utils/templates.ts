import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export function templatesRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "templates");
    if (existsSync(join(candidate, "init"))) return candidate;
    dir = dirname(dir);
  }
  throw new Error("cmssy CLI templates not found");
}

export function readTemplate(...segments: string[]): string {
  return readFileSync(join(templatesRoot(), ...segments), "utf8");
}

export function renderTemplate(
  content: string,
  vars: Record<string, string>,
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? vars[key]! : match,
  );
}

export interface TemplateFile {
  /** path relative to the template subtree root, POSIX-style */
  rel: string;
  abs: string;
}

export function collectFiles(subtree: string): TemplateFile[] {
  const root = join(templatesRoot(), subtree);
  const out: TemplateFile[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        walk(abs);
      } else {
        out.push({ rel: relative(root, abs).split("\\").join("/"), abs });
      }
    }
  };

  walk(root);
  return out;
}
