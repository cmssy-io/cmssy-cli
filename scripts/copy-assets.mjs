import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const assets = [{ from: "src/skills", to: "dist/skills" }];

for (const { from, to } of assets) {
  const src = path.join(repoRoot, from);
  const dest = path.join(repoRoot, to);

  if (!fs.existsSync(src)) {
    console.error(`✖ Missing asset source: ${from}`);
    process.exit(1);
  }

  fs.copySync(src, dest, { overwrite: true });
  console.log(`✔ Copied ${from} → ${to}`);
}
