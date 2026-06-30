import { existsSync } from "node:fs";
import { join } from "node:path";
import { cancel, intro, isCancel, log, outro, text } from "@clack/prompts";
import type { ParsedArgs } from "../utils/args.js";
import { writeFileSafe } from "../utils/files.js";
import { blockNames } from "../utils/names.js";
import { registerBlock } from "../utils/registry.js";
import { readTemplate, renderTemplate } from "../utils/templates.js";
import { pc } from "../utils/ui.js";

export async function addBlockCommand(args: ParsedArgs): Promise<void> {
  const cwd = process.cwd();
  const base = existsSync(join(cwd, "src", "cmssy", "blocks.ts"))
    ? join(cwd, "src")
    : cwd;
  const blocksFile = join(base, "cmssy", "blocks.ts");

  intro(pc.bold("cmssy add block"));

  if (!existsSync(blocksFile)) {
    log.error("No cmssy/blocks.ts found - run `cmssy init` first.");
    process.exitCode = 1;
    return;
  }

  let input = args.positionals[0];
  if (!input) {
    const answer = await text({
      message: "Block name",
      placeholder: "feature-grid",
      validate: (v) => (v?.trim() ? undefined : "Required"),
    });
    if (isCancel(answer)) {
      cancel("Cancelled.");
      process.exit(0);
    }
    input = answer.trim();
  }

  const names = blockNames(input);
  const vars = {
    type: names.type,
    camel: names.camel,
    Pascal: names.Pascal,
    Label: names.Label,
  };

  const dir = join(base, "blocks", names.type);
  const blockTs = renderTemplate(readTemplate("block", "block.ts.tpl"), vars);
  const componentTsx = renderTemplate(
    readTemplate("block", "Component.tsx.tpl"),
    vars,
  );

  const r1 = await writeFileSafe(join(dir, "block.ts"), blockTs);
  const r2 = await writeFileSafe(
    join(dir, `${names.Pascal}.tsx`),
    componentTsx,
  );

  if (r1 === "skipped" || r2 === "skipped") {
    log.warn(
      `Block "${names.type}" already exists - left existing files alone.`,
    );
  } else {
    log.success(
      `Created blocks/${names.type}/ (block.ts + ${names.Pascal}.tsx)`,
    );
  }

  const registered = await registerBlock(blocksFile, names.camel, names.type);
  log.info(
    registered
      ? `Registered ${names.camel}Block in cmssy/blocks.ts`
      : `${names.camel}Block already registered`,
  );

  outro(
    `Added "${names.type}". Edit its component, then use it in the editor.`,
  );
}
