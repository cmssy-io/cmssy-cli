import { join } from "node:path";
import { cancel, isCancel, log, password, spinner, text } from "@clack/prompts";
import type { ParsedArgs } from "../utils/args.js";
import { resolveWorkspace } from "../utils/delivery.js";
import { setEnvVars } from "../utils/env.js";
import { pathExists } from "../utils/files.js";
import { HEADLESS_SETTINGS_HINT } from "../utils/constants.js";
import { pc } from "../utils/ui.js";

function flagString(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bail(): never {
  cancel("Cancelled.");
  process.exit(0);
}

/** Prompt for + persist workspace credentials. Shared by `link` and `init`. */
export async function runLink(
  cwd: string,
  flags: ParsedArgs["flags"],
): Promise<void> {
  let slug = flagString(flags.slug);
  if (!slug) {
    const answer = await text({
      message: "Workspace slug",
      placeholder: "my-workspace",
      validate: (v) => (v?.trim() ? undefined : "Required"),
    });
    if (isCancel(answer)) bail();
    slug = answer.trim();
  }

  let secret = flagString(flags.secret);
  if (!secret) {
    const answer = await password({
      message: `Draft secret (${HEADLESS_SETTINGS_HINT})`,
      validate: (v) => (v?.trim() ? undefined : "Required"),
    });
    if (isCancel(answer)) bail();
    secret = answer.trim();
  }

  const apiUrl = flagString(flags["api-url"]);
  const s = spinner();
  s.start("Checking workspace");
  const lookup = await resolveWorkspace(slug, apiUrl);
  if (lookup.status === "found") {
    s.stop(`Workspace found${lookup.siteName ? `: ${lookup.siteName}` : ""}`);
  } else if (lookup.status === "not-found") {
    s.stop(pc.yellow(`No published workspace "${slug}" yet - saving anyway`));
  } else {
    s.stop(pc.yellow(`Could not verify workspace (${lookup.message})`));
  }

  await setEnvVars(
    join(cwd, ".env"),
    { CMSSY_WORKSPACE_SLUG: slug, CMSSY_DRAFT_SECRET: secret },
    { overwrite: true },
  );
  await setEnvVars(
    join(cwd, ".env.example"),
    { CMSSY_WORKSPACE_SLUG: "", CMSSY_DRAFT_SECRET: "" },
    { overwrite: false },
  );

  log.success("Wrote .env");
}

export async function linkCommand(args: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  if (!pathExists(join(cwd, "cmssy.config.ts"))) {
    log.warn("No cmssy.config.ts here - run `cmssy init` first.");
  }
  const { intro, outro } = await import("@clack/prompts");
  intro(pc.bold("cmssy link"));
  await runLink(cwd, args.flags);
  outro("Linked.");
}
