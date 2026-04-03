import chalk from "chalk";
import { execSync } from "child_process";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { getFieldTypes } from "../utils/field-schema.js";
import { generateTypes } from "../utils/type-generator.js";

interface InitAnswers {
  projectName: string;
  authorName: string;
  authorEmail: string;
}

interface InitOptions {
  yes?: boolean;
}

// ---------------------------------------------------------------------------
// Detect existing Next.js project in cwd
// ---------------------------------------------------------------------------

function detectNextProject(cwd: string): boolean {
  return ["next.config.js", "next.config.mjs", "next.config.ts"].some((f) =>
    fs.existsSync(path.join(cwd, f)),
  );
}

function detectCmssyProject(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, "cmssy.config.js"));
}

// ---------------------------------------------------------------------------
// Scaffold example hero block (shared between both modes)
// ---------------------------------------------------------------------------

async function scaffoldExampleBlock(
  projectPath: string,
  answers: InitAnswers,
): Promise<void> {
  const heroBlockPath = path.join(projectPath, "blocks", "hero");
  fs.mkdirSync(path.join(heroBlockPath, "src"), { recursive: true });

  // Hero.tsx
  fs.writeFileSync(
    path.join(heroBlockPath, "src", "Hero.tsx"),
    `import { BlockContent } from "./block";

export default function Hero({ content }: { content: BlockContent }) {
  const {
    heading = "Welcome to Cmssy",
    subheading = "Build reusable UI blocks with React & Tailwind",
    ctaText = "Get Started",
    ctaUrl = "#",
  } = content;

  return (
    <section className="flex items-center justify-center min-h-[400px] p-8 bg-gradient-to-br from-purple-600 to-purple-900 text-white text-center">
      <div className="max-w-3xl">
        <h1 className="text-5xl font-bold mb-4">{heading}</h1>
        <p className="text-xl mb-8 opacity-90">{subheading}</p>
        <a
          href={ctaUrl}
          className="inline-block px-8 py-4 bg-white text-purple-600 rounded-lg font-semibold hover:scale-105 transition-transform"
        >
          {ctaText}
        </a>
      </div>
    </section>
  );
}
`,
  );

  // index.tsx
  fs.writeFileSync(
    path.join(heroBlockPath, "src", "index.tsx"),
    `export { default } from "./Hero";
import "./index.css";
`,
  );

  // index.css
  fs.writeFileSync(
    path.join(heroBlockPath, "src", "index.css"),
    `@import "../../../styles/main.css";\n`,
  );

  // package.json
  fs.writeFileSync(
    path.join(heroBlockPath, "package.json"),
    JSON.stringify(
      {
        name: `@${answers.projectName}/blocks.hero`,
        version: "1.0.0",
        description: "Hero section block",
        author: { name: answers.authorName, email: answers.authorEmail },
      },
      null,
      2,
    ) + "\n",
  );

  // config.ts
  fs.writeFileSync(
    path.join(heroBlockPath, "config.ts"),
    `import { defineBlock, field } from "@cmssy/cli/config";

export default defineBlock({
  name: "Hero Section",
  description: "Hero section with heading and CTA",
  category: "marketing",
  tags: ["hero", "landing", "cta"],

  schema: {
    heading: field({
      type: "singleLine",
      label: "Heading",
      defaultValue: "Welcome to Cmssy",
    }),
    subheading: field({
      type: "singleLine",
      label: "Subheading",
      defaultValue: "Build reusable UI blocks with React & Tailwind",
    }),
    ctaText: field({
      type: "singleLine",
      label: "CTA Text",
      defaultValue: "Get Started",
    }),
    ctaUrl: field({
      type: "link",
      label: "CTA URL",
      defaultValue: "#",
    }),
  },
});
`,
  );

  // preview.json
  fs.writeFileSync(
    path.join(heroBlockPath, "preview.json"),
    JSON.stringify(
      {
        heading: "Welcome to Cmssy",
        subheading: "Build reusable UI blocks with React & Tailwind",
        ctaText: "Get Started",
        ctaUrl: "#",
      },
      null,
      2,
    ) + "\n",
  );

  // Generate types
  const heroSchema = {
    heading: {
      type: "singleLine" as const,
      label: "Heading",
      defaultValue: "Welcome to Cmssy",
    },
    subheading: {
      type: "singleLine" as const,
      label: "Subheading",
      defaultValue: "Build reusable UI blocks",
    },
    ctaText: {
      type: "singleLine" as const,
      label: "CTA Text",
      defaultValue: "Get Started",
    },
    ctaUrl: { type: "link" as const, label: "CTA URL", defaultValue: "#" },
  };
  const fieldTypes = await getFieldTypes();
  await generateTypes({
    blockPath: heroBlockPath,
    schema: heroSchema,
    fieldTypes,
  });
}

// ---------------------------------------------------------------------------
// Write cmssy.config.js
// ---------------------------------------------------------------------------

function writeCmssyConfig(projectPath: string, answers: InitAnswers): void {
  const config = {
    framework: "react",
    projectName: answers.projectName,
    author: { name: answers.authorName, email: answers.authorEmail },
    build: { outDir: "public", minify: true, sourcemap: true },
  };
  fs.writeFileSync(
    path.join(projectPath, "cmssy.config.js"),
    `export default ${JSON.stringify(config, null, 2)};\n`,
  );
}

// ---------------------------------------------------------------------------
// Write styles/main.css
// ---------------------------------------------------------------------------

function writeMainCss(projectPath: string): void {
  const stylesDir = path.join(projectPath, "styles");
  fs.mkdirSync(stylesDir, { recursive: true });

  fs.writeFileSync(
    path.join(stylesDir, "main.css"),
    `@import "tailwindcss";
@source "../blocks";
@source "../templates";
@source "../components";

/* Set default border color (Tailwind v4 reset uses currentColor) */
@layer base {
  *,
  ::after,
  ::before {
    border-color: var(--border, currentColor);
  }
}
`,
  );
}

// ---------------------------------------------------------------------------
// Write .env.example
// ---------------------------------------------------------------------------

function writeEnvExample(projectPath: string): void {
  fs.writeFileSync(
    path.join(projectPath, ".env.example"),
    `# Cmssy API Configuration
# Run 'cmssy configure' to set these values

# Cmssy GraphQL API URL
CMSSY_API_URL=https://api.cmssy.io/graphql

# Cmssy API Token (get from Dashboard → API Tokens)
CMSSY_API_TOKEN=

# Workspace ID (for workspace publish)
CMSSY_WORKSPACE_ID=
`,
  );
}

// ---------------------------------------------------------------------------
// Merge cmssy scripts into existing package.json
// ---------------------------------------------------------------------------

function mergeCmssyScripts(projectPath: string): void {
  const pkgPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const pkg = fs.readJsonSync(pkgPath);
  pkg.scripts = pkg.scripts || {};

  if (!pkg.scripts["cmssy:dev"]) {
    pkg.scripts["cmssy:dev"] = "cmssy dev";
  }
  if (!pkg.scripts["cmssy:build"]) {
    pkg.scripts["cmssy:build"] = "cmssy build";
  }
  if (!pkg.scripts["cmssy:publish"]) {
    pkg.scripts["cmssy:publish"] = "cmssy publish --all";
  }

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// New project mode: create-next-app + cmssy layer
// ---------------------------------------------------------------------------

async function initNewProject(
  name: string,
  options: InitOptions,
): Promise<void> {
  console.log(chalk.blue.bold("\n🔨 Cmssy - Create New Project\n"));

  let answers: InitAnswers;

  if (options.yes) {
    answers = { projectName: name, authorName: "", authorEmail: "" };
    console.log(chalk.gray(`Using defaults: ${name}\n`));
  } else {
    answers = await inquirer.prompt<InitAnswers>([
      {
        type: "input",
        name: "projectName",
        message: "Project name:",
        default: name,
        validate: (input) => {
          if (/^[a-z0-9-_]+$/.test(input)) return true;
          return "Must contain only lowercase letters, numbers, hyphens, underscores";
        },
      },
      {
        type: "input",
        name: "authorName",
        message: "Author name:",
        default: "",
      },
      {
        type: "input",
        name: "authorEmail",
        message: "Author email:",
        default: "",
      },
    ]);
    name = answers.projectName;
  }

  const projectPath = path.join(process.cwd(), name);

  if (fs.existsSync(projectPath)) {
    console.error(chalk.red(`\n✖ Directory "${name}" already exists\n`));
    process.exit(1);
  }

  // Step 1: Run create-next-app
  const spinner = ora("Running create-next-app...").start();
  try {
    execSync(
      `npx create-next-app@latest ${name} --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*"`,
      { cwd: process.cwd(), stdio: "pipe" },
    );
    spinner.succeed("Next.js project created");
  } catch (error) {
    spinner.fail("Failed to run create-next-app");
    console.error(
      chalk.red("\nMake sure npx is available and you have internet access.\n"),
    );
    process.exit(1);
  }

  // Step 2: Add cmssy layer
  spinner.start("Adding Cmssy configuration...");
  try {
    // Create directories
    fs.mkdirSync(path.join(projectPath, "blocks"), { recursive: true });
    fs.mkdirSync(path.join(projectPath, "templates"), { recursive: true });
    fs.mkdirSync(path.join(projectPath, ".cmssy"), { recursive: true });

    writeCmssyConfig(projectPath, answers);
    writeMainCss(projectPath);
    writeEnvExample(projectPath);
    mergeCmssyScripts(projectPath);

    // Add .cmssy/ to gitignore
    const gitignorePath = path.join(projectPath, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      if (!content.includes(".cmssy")) {
        fs.appendFileSync(gitignorePath, "\n# Cmssy\n.cmssy/\npublic/\n");
      }
    }

    spinner.succeed("Cmssy configuration added");

    // Step 3: Install @cmssy/types
    spinner.start("Installing @cmssy/types...");
    execSync("npm install --save-dev @cmssy/types @cmssy/cli", {
      cwd: projectPath,
      stdio: "pipe",
    });
    spinner.succeed("Dependencies installed");

    // Step 4: Create example block
    spinner.start("Creating example hero block...");
    await scaffoldExampleBlock(projectPath, answers);
    spinner.succeed("Example hero block created");

    console.log(chalk.green.bold("\n✓ Project created successfully!\n"));
    console.log(chalk.cyan("Next steps:\n"));
    console.log(chalk.white(`  cd ${name}`));
    console.log(chalk.white("  npm run cmssy:dev\n"));
    console.log(chalk.gray("Commands:"));
    console.log(chalk.gray("  cmssy create block <name>   Add a new block"));
    console.log(chalk.gray("  cmssy dev                   Start dev server"));
    console.log(
      chalk.gray("  cmssy publish --all -w ID   Publish to workspace\n"),
    );
  } catch (error) {
    spinner.fail("Failed to set up Cmssy");
    console.error(chalk.red("\nError:"), error);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Existing project mode: add cmssy to current Next.js project
// ---------------------------------------------------------------------------

async function initExistingProject(options: InitOptions): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.blue.bold("\n🔨 Cmssy - Initialize in Existing Project\n"));
  console.log(
    chalk.gray(`Detected Next.js project in ${path.basename(cwd)}\n`),
  );

  if (detectCmssyProject(cwd)) {
    console.error(
      chalk.red("✖ This project already has cmssy.config.js. Nothing to do.\n"),
    );
    process.exit(1);
  }

  // Read project name from existing package.json
  const pkgPath = path.join(cwd, "package.json");
  const pkg = fs.existsSync(pkgPath) ? fs.readJsonSync(pkgPath) : {};
  const defaultName = pkg.name || path.basename(cwd);

  let answers: InitAnswers;

  if (options.yes) {
    answers = { projectName: defaultName, authorName: "", authorEmail: "" };
    console.log(chalk.gray(`Using defaults: ${defaultName}\n`));
  } else {
    answers = await inquirer.prompt<InitAnswers>([
      {
        type: "input",
        name: "projectName",
        message: "Cmssy project name:",
        default: defaultName,
      },
      {
        type: "input",
        name: "authorName",
        message: "Author name:",
        default: pkg.author?.name || "",
      },
      {
        type: "input",
        name: "authorEmail",
        message: "Author email:",
        default: pkg.author?.email || "",
      },
    ]);
  }

  const spinner = ora("Adding Cmssy configuration...").start();
  try {
    // Create directories
    fs.mkdirSync(path.join(cwd, "blocks"), { recursive: true });
    fs.mkdirSync(path.join(cwd, "templates"), { recursive: true });
    fs.mkdirSync(path.join(cwd, ".cmssy"), { recursive: true });

    writeCmssyConfig(cwd, answers);
    writeMainCss(cwd);
    writeEnvExample(cwd);
    mergeCmssyScripts(cwd);

    // Add .cmssy/ to gitignore
    const gitignorePath = path.join(cwd, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      if (!content.includes(".cmssy")) {
        fs.appendFileSync(gitignorePath, "\n# Cmssy\n.cmssy/\n");
      }
    }

    spinner.succeed("Cmssy configuration added");

    // Install dependencies
    spinner.start("Installing @cmssy/types...");
    const packageManager = detectPackageManager(cwd);
    const installCmd =
      packageManager === "pnpm"
        ? "pnpm add -D @cmssy/types @cmssy/cli"
        : packageManager === "yarn"
          ? "yarn add -D @cmssy/types @cmssy/cli"
          : "npm install --save-dev @cmssy/types @cmssy/cli";
    execSync(installCmd, { cwd, stdio: "pipe" });
    spinner.succeed("Dependencies installed");

    // Create example block
    spinner.start("Creating example hero block...");
    await scaffoldExampleBlock(cwd, answers);
    spinner.succeed("Example hero block created");

    console.log(chalk.green.bold("\n✓ Cmssy initialized successfully!\n"));
    console.log(chalk.cyan("Next steps:\n"));
    console.log(chalk.white("  npm run cmssy:dev\n"));
    console.log(chalk.gray("New files:"));
    console.log(chalk.gray("  cmssy.config.js        Project configuration"));
    console.log(chalk.gray("  blocks/hero/            Example block"));
    console.log(chalk.gray("  styles/main.css         Tailwind source paths"));
    console.log(
      chalk.gray("  .env.example            API credentials template\n"),
    );
  } catch (error) {
    spinner.fail("Failed to initialize Cmssy");
    console.error(chalk.red("\nError:"), error);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Detect package manager from lockfile
// ---------------------------------------------------------------------------

function detectPackageManager(cwd: string): "npm" | "pnpm" | "yarn" {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function initCommand(
  name?: string,
  options: InitOptions = {},
): Promise<void> {
  if (name) {
    // Explicit name → create new project
    await initNewProject(name, options);
  } else if (detectNextProject(process.cwd())) {
    // No name, but in Next.js project → existing mode
    await initExistingProject(options);
  } else {
    console.error(
      chalk.red(
        "\n✖ No project name provided and no Next.js project detected.\n",
      ),
    );
    console.log(chalk.cyan("Usage:\n"));
    console.log(chalk.white("  cmssy init my-blocks     Create a new project"));
    console.log(
      chalk.white(
        "  cmssy init               Initialize in existing Next.js project\n",
      ),
    );
    process.exit(1);
  }
}
