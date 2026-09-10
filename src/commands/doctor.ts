import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { intro, outro } from "@clack/prompts";
import type { ParsedArgs } from "../utils/args.js";
import { readPackageJson } from "../utils/project.js";
import { pc } from "../utils/ui.js";

type Status = "pass" | "warn" | "fail";
interface Check {
  label: string;
  status: Status;
  hint?: string;
}

const MARK: Record<Status, string> = {
  pass: pc.green("✓"),
  warn: pc.yellow("!"),
  fail: pc.red("✗"),
};

export async function doctorCommand(_args: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  const base = existsSync(join(cwd, "src", "cmssy", "blocks.ts"))
    ? join(cwd, "src")
    : cwd;

  intro(pc.bold("cmssy doctor"));
  const checks: Check[] = [];

  const required: Array<[string, string]> = [
    ["cmssy.config.ts", join(cwd, "cmssy.config.ts")],
    ["proxy.ts", join(cwd, "proxy.ts")],
    ["app/[[...path]]/page.tsx", join(base, "app", "[[...path]]", "page.tsx")],
    ["app/api/draft/route.ts", join(base, "app", "api", "draft", "route.ts")],
    ["cmssy/blocks.ts", join(base, "cmssy", "blocks.ts")],
    ["cmssy/editor.tsx", join(base, "cmssy", "editor.tsx")],
  ];
  for (const [label, p] of required) {
    checks.push(
      existsSync(p)
        ? { label, status: "pass" }
        : { label, status: "fail", hint: "missing - run `cmssy init`" },
    );
  }

  const pkg = readPackageJson(cwd);
  const next =
    pkg?.dependencies?.["@cmssy/next"] ?? pkg?.devDependencies?.["@cmssy/next"];
  const react =
    pkg?.dependencies?.["@cmssy/react"] ??
    pkg?.devDependencies?.["@cmssy/react"];
  if (!next || !react) {
    checks.push({
      label: "@cmssy/next + @cmssy/react installed",
      status: "fail",
      hint: "missing - add @cmssy/next and @cmssy/react",
    });
  } else if (next !== react) {
    checks.push({
      label: "@cmssy/* versions aligned",
      status: "warn",
      hint: `@cmssy/next ${next} vs @cmssy/react ${react}`,
    });
  } else {
    checks.push({ label: `@cmssy/* ${next}`, status: "pass" });
  }

  const envPath = join(cwd, ".env");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  for (const key of ["CMSSY_WORKSPACE_SLUG", "CMSSY_DRAFT_SECRET"]) {
    const set = new RegExp(`^${key}=.+$`, "m").test(env);
    checks.push(
      set
        ? { label: key, status: "pass" }
        : {
            label: key,
            status: "warn",
            hint: "not set in .env - run `cmssy link`",
          },
    );
  }

  const blocksFile = join(base, "cmssy", "blocks.ts");
  if (existsSync(blocksFile)) {
    const content = readFileSync(blocksFile, "utf8");
    const refs = [...content.matchAll(/@\/blocks\/([^/]+)\/block/g)].map(
      (m) => m[1]!,
    );
    const missing = refs.filter(
      (name) => !existsSync(join(base, "blocks", name, "block.ts")),
    );
    checks.push(
      missing.length === 0
        ? { label: `block registry (${refs.length} block(s))`, status: "pass" }
        : {
            label: "block registry imports resolve",
            status: "fail",
            hint: `missing block file(s): ${missing.join(", ")}`,
          },
    );
  }

  for (const c of checks) {
    console.log(
      `  ${MARK[c.status]} ${c.label}${c.hint ? pc.dim(` - ${c.hint}`) : ""}`,
    );
  }

  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  if (failed) {
    process.exitCode = 1;
    outro(pc.red(`${failed} problem(s), ${warned} warning(s).`));
  } else {
    outro(
      warned
        ? pc.yellow(`OK with ${warned} warning(s).`)
        : pc.green("All good."),
    );
  }
}
