import { parseArgs } from "./utils/args.js";
import { getVersion, pc, ui } from "./utils/ui.js";
import { initCommand } from "./commands/init.js";
import { linkCommand } from "./commands/link.js";
import { addBlockCommand } from "./commands/add-block.js";
import { doctorCommand } from "./commands/doctor.js";

const HELP = `
${pc.bold("cmssy")} - wire a Next.js app to a headless cmssy workspace

${pc.bold("Usage")}
  cmssy <command> [options]

${pc.bold("Commands")}
  init                 Scaffold or wire a Next.js App Router app to cmssy
  link                 Connect an initialized project to a workspace
  add block <name>     Scaffold a new block and register it
  doctor               Diagnose a cmssy project's setup

${pc.bold("Options")}
  -h, --help           Show this help
  -v, --version        Show version
`;

async function main(): Promise<void> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals[0];

  if (flags.version || flags.v) {
    console.log(getVersion());
    return;
  }

  if (!command || flags.help || flags.h) {
    console.log(HELP);
    return;
  }

  const rest = { positionals: positionals.slice(1), flags };

  switch (command) {
    case "init":
      await initCommand(rest);
      break;
    case "link":
      await linkCommand(rest);
      break;
    case "add":
      if (positionals[1] === "block") {
        await addBlockCommand({ positionals: positionals.slice(2), flags });
      } else {
        ui.error(
          `Unknown add target: ${pc.bold(positionals[1] ?? "")}. Try ${pc.bold("cmssy add block <name>")}.`,
        );
        process.exitCode = 1;
      }
      break;
    case "doctor":
      await doctorCommand(rest);
      break;
    default:
      ui.error(`Unknown command: ${pc.bold(command)}`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  ui.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
