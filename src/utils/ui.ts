import { readFileSync } from "node:fs";
import pc from "picocolors";

export function getVersion(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(url, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const ui = {
  info: (msg: string) => console.log(msg),
  dim: (msg: string) => console.log(pc.dim(msg)),
  success: (msg: string) => console.log(pc.green(msg)),
  warn: (msg: string) => console.log(pc.yellow(msg)),
  error: (msg: string) => console.error(pc.red(msg)),
};

export { pc };
