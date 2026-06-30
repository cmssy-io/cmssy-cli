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
  const tokenRe = new RegExp(`\\b${token}\\b`);

  const arrayRe = /export const blocks\s*=\s*\[([\s\S]*?)\]/;
  const arrayMatch = arrayRe.exec(content);
  if (!arrayMatch) {
    throw new Error(
      `Could not find \`export const blocks = [...]\` in ${blocksFile} - add ${token} manually.`,
    );
  }

  if (tokenRe.test(arrayMatch[1]!)) return false;

  const lines = content.split("\n");
  const alreadyImported = lines.some(
    (line) => line.startsWith("import ") && tokenRe.test(line),
  );
  if (!alreadyImported) {
    const importLine = `import { ${token} } from "@/blocks/${type}/block";`;
    let lastImport = -1;
    lines.forEach((line, i) => {
      if (line.startsWith("import ")) lastImport = i;
    });
    lines.splice(lastImport + 1, 0, importLine);
    content = lines.join("\n");
  }

  content = content.replace(arrayRe, (_match, inner: string) => {
    const body = inner.replace(/\s+$/, "").replace(/,\s*$/, "");
    const next = body.trim() ? `${body}, ${token}` : token;
    return `export const blocks = [${next}]`;
  });

  await writeFile(blocksFile, content, "utf8");
  return true;
}
