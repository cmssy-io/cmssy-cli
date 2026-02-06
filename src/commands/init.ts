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
  initGit: boolean;
}

interface InitOptions {
  yes?: boolean;
  framework?: string;
}

export async function initCommand(name?: string, options: InitOptions = {}) {
  console.log(chalk.blue.bold("\n🔨 Cmssy - Initialize Project\n"));

  let answers: InitAnswers;

  if (options.yes) {
    // Skip prompts, use defaults
    answers = {
      projectName: name || "my-blocks",
      authorName: "",
      authorEmail: "",
      initGit: true,
    };
    console.log(chalk.gray(`Using defaults: ${answers.projectName}\n`));
  } else {
    answers = await inquirer.prompt<InitAnswers>([
      {
        type: "input",
        name: "projectName",
        message: "Project name:",
        default: name || "my-blocks",
        validate: (input) => {
          if (/^[a-z0-9-_]+$/.test(input)) return true;
          return "Project name must contain only lowercase letters, numbers, hyphens, and underscores";
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
      {
        type: "confirm",
        name: "initGit",
        message: "Initialize git repository?",
        default: true,
      },
    ]);
  }

  const projectPath = path.join(process.cwd(), answers.projectName);

  if (fs.existsSync(projectPath)) {
    console.error(
      chalk.red(`\n✖ Directory "${answers.projectName}" already exists\n`)
    );
    process.exit(1);
  }

  const spinner = ora("Creating project structure...").start();

  try {
    // Create project directory
    fs.mkdirSync(projectPath, { recursive: true });

    // Create directory structure
    const dirs = ["blocks", "templates", "public", "styles", ".cmssy"];
    dirs.forEach((dir) => {
      fs.mkdirSync(path.join(projectPath, dir), { recursive: true });
    });

    // Create cmssy.config.js
    const config = {
      framework: "react",
      projectName: answers.projectName,
      author: {
        name: answers.authorName,
        email: answers.authorEmail,
      },
      build: {
        outDir: "public",
        minify: true,
        sourcemap: true,
      },
    };

    fs.writeFileSync(
      path.join(projectPath, "cmssy.config.js"),
      `export default ${JSON.stringify(config, null, 2)};\n`
    );

    // Create package.json
    const packageJson = {
      name: answers.projectName,
      version: "1.0.0",
      type: "module",
      scripts: {
        dev: "cmssy dev",
        build: "cmssy build",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        typescript: "^5.7.2",
        tailwindcss: "^4.0.0",
        "@tailwindcss/postcss": "^4.0.0",
        postcss: "^8.4.49",
        "postcss-cli": "^11.0.0",
        "postcss-import": "^16.1.0",
      },
    };

    fs.writeFileSync(
      path.join(projectPath, "package.json"),
      JSON.stringify(packageJson, null, 2) + "\n"
    );

    // Create tsconfig.json
    const tsConfig = {
      compilerOptions: {
        target: "ES2020",
        module: "ESNext",
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        jsx: "react-jsx",
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        forceConsistentCasingInFileNames: true,
        paths: {
          "cmssy-cli/config": ["./node_modules/cmssy-cli/config"],
        },
      },
      include: ["blocks/**/*", "templates/**/*"],
      exclude: ["node_modules", "dist", "public"],
    };
    fs.writeFileSync(
      path.join(projectPath, "tsconfig.json"),
      JSON.stringify(tsConfig, null, 2) + "\n"
    );

    // Create .gitignore
    const gitignore = `node_modules/
dist/
public/
.env
.DS_Store
*.log
.cmssy
`;
    fs.writeFileSync(path.join(projectPath, ".gitignore"), gitignore);

    // Create postcss.config.js
    const postcssConfig = `export default {
  plugins: {
    "postcss-import": {
      path: ["styles"],
    },
    "@tailwindcss/postcss": {},
  },
};
`;
    fs.writeFileSync(path.join(projectPath, "postcss.config.js"), postcssConfig);

    // Create styles/main.css
    const mainCss = `@import "tailwindcss";

/* Set default border color (Tailwind v4 reset uses currentColor) */
@layer base {
  *,
  ::after,
  ::before {
    border-color: var(--border, currentColor);
  }
}

/* Custom theme - customize your design system here */
/* @theme inline {
  --color-primary: var(--primary);
  --color-border: var(--border);
} */

/* CSS variables for theming */
/* :root {
  --primary: oklch(0.6 0.25 292);
  --border: oklch(0.9 0 0);
} */
`;
    fs.writeFileSync(path.join(projectPath, "styles", "main.css"), mainCss);

    // Create .env.example
    const envExample = `# Cmssy API Configuration
# Run 'cmssy configure' to set these values

# Cmssy GraphQL API URL
CMSSY_API_URL=https://api.cmssy.io/graphql

# Cmssy API Token (get from Dashboard → API Tokens)
CMSSY_API_TOKEN=

# Workspace ID (for workspace publish)
CMSSY_WORKSPACE_ID=
`;
    fs.writeFileSync(path.join(projectPath, ".env.example"), envExample);

    // Create README.md
    const readme = `# ${answers.projectName}

Cmssy project for building reusable UI blocks.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Commands

\`\`\`bash
cmssy dev                    # Start dev server
cmssy create block <name>    # Create new block
cmssy build                  # Build for production
cmssy publish --workspace    # Publish to workspace
\`\`\`

## Project Structure

\`\`\`
${answers.projectName}/
├── blocks/           # Your UI blocks
├── styles/
│   └── main.css      # Global Tailwind styles
├── public/           # Build output
└── cmssy.config.js
\`\`\`
`;
    fs.writeFileSync(path.join(projectPath, "README.md"), readme);

    spinner.succeed("Project structure created");

    // Create example hero block
    spinner.start("Creating example hero block...");

    const heroBlockPath = path.join(projectPath, "blocks", "hero");
    fs.mkdirSync(path.join(heroBlockPath, "src"), { recursive: true });

    // Hero.tsx
    const heroComponent = `import { BlockContent } from "./block";

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
`;
    fs.writeFileSync(path.join(heroBlockPath, "src", "Hero.tsx"), heroComponent);

    // index.tsx
    const indexFile = `import { createRoot, Root } from "react-dom/client";
import Hero from "./Hero";
import "./index.css";

interface BlockContext {
  root: Root;
}

export default {
  __component: Hero,

  mount(element: HTMLElement, props: any): BlockContext {
    const root = createRoot(element);
    root.render(<Hero content={props} />);
    return { root };
  },

  update(_element: HTMLElement, props: any, ctx: BlockContext): void {
    ctx.root.render(<Hero content={props} />);
  },

  unmount(_element: HTMLElement, ctx: BlockContext): void {
    ctx.root.unmount();
  },
};
`;
    fs.writeFileSync(path.join(heroBlockPath, "src", "index.tsx"), indexFile);

    // index.css
    fs.writeFileSync(
      path.join(heroBlockPath, "src", "index.css"),
      `@import "main.css";\n`
    );

    // package.json
    const blockPackageJson = {
      name: `@${answers.projectName}/blocks.hero`,
      version: "1.0.0",
      description: "Hero section block",
      author: {
        name: answers.authorName,
        email: answers.authorEmail,
      },
    };
    fs.writeFileSync(
      path.join(heroBlockPath, "package.json"),
      JSON.stringify(blockPackageJson, null, 2) + "\n"
    );

    // block.config.ts
    const blockConfig = `import { defineBlock } from "cmssy-cli/config";

export default defineBlock({
  name: "Hero Section",
  description: "Hero section with heading and CTA",
  category: "marketing",
  tags: ["hero", "landing", "cta"],

  schema: {
    heading: {
      type: "singleLine",
      label: "Heading",
      defaultValue: "Welcome to Cmssy",
    },
    subheading: {
      type: "singleLine",
      label: "Subheading",
      defaultValue: "Build reusable UI blocks with React & Tailwind",
    },
    ctaText: {
      type: "singleLine",
      label: "CTA Text",
      defaultValue: "Get Started",
    },
    ctaUrl: {
      type: "link",
      label: "CTA URL",
      defaultValue: "#",
    },
  },

  pricing: { licenseType: "free" },
});
`;
    fs.writeFileSync(path.join(heroBlockPath, "block.config.ts"), blockConfig);

    // preview.json
    const previewData = {
      heading: "Welcome to Cmssy",
      subheading: "Build reusable UI blocks with React & Tailwind",
      ctaText: "Get Started",
      ctaUrl: "#",
    };
    fs.writeFileSync(
      path.join(heroBlockPath, "preview.json"),
      JSON.stringify(previewData, null, 2) + "\n"
    );

    // Generate types
    const heroSchema = {
      heading: { type: "singleLine" as const, label: "Heading", defaultValue: "Welcome to Cmssy" },
      subheading: { type: "singleLine" as const, label: "Subheading", defaultValue: "Build reusable UI blocks" },
      ctaText: { type: "singleLine" as const, label: "CTA Text", defaultValue: "Get Started" },
      ctaUrl: { type: "link" as const, label: "CTA URL", defaultValue: "#" },
    };
    const fieldTypes = await getFieldTypes();
    await generateTypes({ blockPath: heroBlockPath, schema: heroSchema, fieldTypes });

    spinner.succeed("Example hero block created");

    // Initialize git
    if (answers.initGit) {
      spinner.start("Initializing git repository...");
      process.chdir(projectPath);
      execSync("git init", { stdio: "ignore" });
      execSync("git branch -m main", { stdio: "ignore" });
      spinner.succeed("Git repository initialized");
    }

    console.log(chalk.green.bold("\n✓ Project created successfully!\n"));
    console.log(chalk.cyan("Next steps:\n"));
    console.log(chalk.white(`  cd ${answers.projectName}`));
    console.log(chalk.white("  npm install"));
    console.log(chalk.white("  npm run dev\n"));
  } catch (error) {
    spinner.fail("Failed to create project");
    console.error(chalk.red("\nError:"), error);
    process.exit(1);
  }
}
