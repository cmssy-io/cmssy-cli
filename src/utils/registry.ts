import { readFile, writeFile } from "node:fs/promises";

/**
 * Idempotently add a block import + array entry to a cmssy/blocks.ts registry.
 * Returns true when the file changed.
 */
export async function registerBlock(
  blocksFile: string,
  camel: string,
  type: string,
): Promise<boolean> {
  let content = await readFile(blocksFile, "utf8");
  const token = `${camel}Block`;
  if (new RegExp(`\\b${token}\\b`).test(content)) return false;

  const importLine = `import { ${token} } from "@/blocks/${type}/block";`;
  const lines = content.split("\n");
  let lastImport = -1;
  lines.forEach((line, i) => {
    if (line.startsWith("import ")) lastImport = i;
  });
  lines.splice(lastImport + 1, 0, importLine);
  content = lines.join("\n");

  content = content.replace(
    /export const blocks = \[([\s\S]*?)\]/,
    (_match, inner: string) => {
      const items = inner
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      items.push(token);
      return `export const blocks = [${items.join(", ")}]`;
    },
  );

  await writeFile(blocksFile, content, "utf8");
  return true;
}
