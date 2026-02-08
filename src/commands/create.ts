import chalk from "chalk";
import fs from "fs-extra";
import inquirer from "inquirer";
import ora from "ora";
import path from "path";
import { loadConfig } from "../utils/cmssy-config.js";
import { getFieldTypes } from "../utils/field-schema.js";
import { generateTypes } from "../utils/type-generator.js";
import { updateBlockInCache } from "../utils/blocks-meta-cache.js";

/**
 * Convert kebab-case or snake_case to PascalCase.
 * Examples: "marketing-site" → "MarketingSite", "my_block" → "MyBlock"
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

interface CreateBlockOptions {
  yes?: boolean;
  description?: string;
  category?: string;
  tags?: string;
}

async function createBlock(name: string, options: CreateBlockOptions = {}) {
  const spinner = ora("Creating block...").start();

  try {
    // Load config
    const config = await loadConfig();
    const blockPath = path.join(process.cwd(), "blocks", name);

    // Check if block already exists
    if (fs.existsSync(blockPath)) {
      spinner.fail(`Block "${name}" already exists`);
      process.exit(1);
    }

    let answers: {
      displayName: string;
      description: string;
      category: string;
      tags: string[];
    };

    if (options.yes) {
      // Use defaults or provided options
      const defaultDisplayName = toPascalCase(name);
      answers = {
        displayName: defaultDisplayName,
        description: options.description || "",
        category: options.category || "marketing",
        tags: options.tags
          ? options.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      };
      spinner.text = "Creating block files...";
    } else {
      // Stop spinner before prompting (ora can interfere with inquirer stdin)
      spinner.stop();

      // Prompt for block details
      answers = await inquirer.prompt([
        {
          type: "input",
          name: "displayName",
          message: "Display name:",
          default: toPascalCase(name),
        },
        {
          type: "input",
          name: "description",
          message: "Description:",
          default: options.description || "",
        },
        {
          type: "list",
          name: "category",
          message: "Category:",
          choices: [
            "marketing",
            "typography",
            "media",
            "layout",
            "forms",
            "navigation",
            "other",
          ],
          default: options.category || "marketing",
        },
        {
          type: "input",
          name: "tags",
          message: "Tags (comma-separated):",
          default: options.tags || "",
          filter: (input) =>
            input
              .split(",")
              .map((tag: string) => tag.trim())
              .filter(Boolean),
        },
      ]);

      // Restart spinner for file creation
      spinner.start("Creating block files...");
    }

    // Create directory structure
    fs.mkdirSync(path.join(blockPath, "src"), { recursive: true });

    // Create component file based on framework
    if (config.framework === "react") {
      // Strip spaces from displayName (already PascalCase from toPascalCase or user input)
      const componentName = answers.displayName.replace(/\s+/g, "");
      const componentFile = `import { BlockContent } from './block';

export default function ${componentName}({ content }: { content: BlockContent }) {
  const {
    heading = 'Heading',
    description = 'Description',
  } = content;

  return (
    <section className="${name}">
      <h2>{heading}</h2>
      <p>{description}</p>
    </section>
  );
}
`;
      fs.writeFileSync(
        path.join(blockPath, "src", `${componentName}.tsx`),
        componentFile
      );

      // Create index file - simplified format (standard React export)
      const indexFile = `export { default } from "./${componentName}";
import "./index.css";
`;
      fs.writeFileSync(path.join(blockPath, "src", "index.tsx"), indexFile);
    }

    // Create CSS file (with main.css import if project uses Tailwind)
    const hasTailwind = fs.existsSync(path.join(process.cwd(), "postcss.config.js"));
    const cssFile = hasTailwind
      ? `@import "../../../styles/main.css";
`
      : `.${name} {
  padding: 2rem;
}

.${name} h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.${name} p {
  font-size: 1rem;
  color: #666;
}
`;
    fs.writeFileSync(path.join(blockPath, "src", "index.css"), cssFile);

    // Create minimal package.json
    const packageJson = {
      name: `@${config.projectName || "vendor"}/blocks.${name}`,
      version: "1.0.0",
      description: answers.description,
      author: config.author,
    };

    fs.writeFileSync(
      path.join(blockPath, "package.json"),
      JSON.stringify(packageJson, null, 2) + "\n"
    );

    // Create block.config.ts
    const blockConfigContent = `import { defineBlock } from 'cmssy-cli/config';

export default defineBlock({
  name: '${answers.displayName}',
  description: '${answers.description}',
  category: '${answers.category}',
  tags: ${JSON.stringify(answers.tags)},

  schema: {
    heading: {
      type: 'singleLine',
      label: 'Heading',
      required: true,
      defaultValue: 'Heading',
    },
    description: {
      type: 'multiLine',
      label: 'Description',
      placeholder: 'Enter description',
      defaultValue: 'Description',
    },
  },

  pricing: { licenseType: 'free' },
});
`;

    fs.writeFileSync(
      path.join(blockPath, "block.config.ts"),
      blockConfigContent
    );

    // Create preview.json
    const previewData = {
      heading: "Preview Heading",
      description: "This is how your block will look in the preview.",
    };

    fs.writeFileSync(
      path.join(blockPath, "preview.json"),
      JSON.stringify(previewData, null, 2) + "\n"
    );

    // Generate initial types
    const initialSchema = {
      heading: {
        type: "singleLine" as const,
        label: "Heading",
        required: true,
        defaultValue: "Heading",
      },
      description: {
        type: "multiLine" as const,
        label: "Description",
        placeholder: "Enter description",
        defaultValue: "Description",
      },
    };

    const fieldTypes = await getFieldTypes();
    await generateTypes({ blockPath, schema: initialSchema, fieldTypes });

    // Add to metadata cache for instant filters
    updateBlockInCache(
      name,
      "block",
      {
        name: answers.displayName,
        description: answers.description,
        category: answers.category,
        tags: answers.tags,
        schema: initialSchema,
      },
      "1.0.0"
    );

    spinner.succeed(`Block "${name}" created successfully`);
    console.log(chalk.cyan("\nNext steps:\n"));
    console.log(chalk.white("  cmssy dev         # Preview your block"));
    console.log(chalk.white("  cmssy build       # Build your block\n"));
  } catch (error) {
    spinner.fail("Failed to create block");
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
}

interface CreateTemplateOptions {
  yes?: boolean;
  description?: string;
}

async function createPage(name: string, options: CreateTemplateOptions = {}) {
  const spinner = ora("Creating page template...").start();

  try {
    const config = await loadConfig();
    const pagePath = path.join(process.cwd(), "templates", name);

    if (fs.existsSync(pagePath)) {
      spinner.fail(`Page template "${name}" already exists`);
      process.exit(1);
    }

    let answers: {
      displayName: string;
      description: string;
    };

    if (options.yes) {
      // Use defaults or provided options
      const defaultDisplayName = toPascalCase(name);
      answers = {
        displayName: defaultDisplayName,
        description: options.description || "",
      };
      spinner.text = "Creating page files...";
    } else {
      // Stop spinner before prompting (ora can interfere with inquirer stdin)
      spinner.stop();

      answers = await inquirer.prompt([
        {
          type: "input",
          name: "displayName",
          message: "Display name:",
          default: toPascalCase(name),
        },
        {
          type: "input",
          name: "description",
          message: "Description:",
          default: options.description || "",
        },
      ]);

      // Restart spinner for file creation
      spinner.start("Creating page files...");
    }

    fs.mkdirSync(path.join(pagePath, "src"), { recursive: true });

    if (config.framework === "react") {
      // Strip spaces from displayName (already PascalCase from toPascalCase or user input)
      const componentName = answers.displayName.replace(/\s+/g, "");
      const componentFile = `import { BlockContent } from './block';

export default function ${componentName}({ content }: { content: BlockContent }) {
  const {
    title = 'Page Title',
    sections = [],
  } = content;

  return (
    <div className="${name}-page">
      <header>
        <h1>{title}</h1>
      </header>
      <main>
        {sections.map((section, index) => (
          <div key={index} className="section">
            {/* Render blocks here */}
          </div>
        ))}
      </main>
    </div>
  );
}
`;
      fs.writeFileSync(
        path.join(pagePath, "src", `${componentName}.tsx`),
        componentFile
      );

      const indexFile = `export { default } from './${componentName}';
import './index.css';
`;
      fs.writeFileSync(path.join(pagePath, "src", "index.tsx"), indexFile);
    }

    const cssFile = `.${name}-page {
  min-height: 100vh;
}

.${name}-page header {
  padding: 2rem;
  background: #f5f5f5;
}

.${name}-page h1 {
  font-size: 2.5rem;
  margin: 0;
}

.${name}-page main {
  padding: 2rem;
}

.section {
  margin-bottom: 2rem;
}
`;
    fs.writeFileSync(path.join(pagePath, "src", "index.css"), cssFile);

    // Create minimal package.json
    const packageJson = {
      name: `@${config.projectName || "vendor"}/templates.${name}`,
      version: "1.0.0",
      description: answers.description,
      author: config.author,
    };

    fs.writeFileSync(
      path.join(pagePath, "package.json"),
      JSON.stringify(packageJson, null, 2) + "\n"
    );

    // Create block.config.ts (using defineTemplate)
    const blockConfigContent = `import { defineTemplate } from 'cmssy-cli/config';

export default defineTemplate({
  name: '${answers.displayName}',
  description: '${answers.description}',
  category: 'pages',

  schema: {
    title: {
      type: 'singleLine',
      label: 'Page Title',
      required: true,
      defaultValue: 'Page Title',
    },
    sections: {
      type: 'repeater',
      label: 'Page Sections',
      schema: {
        // Define section fields here
      },
    },
  },

  pricing: { licenseType: 'free' },
});
`;

    fs.writeFileSync(
      path.join(pagePath, "block.config.ts"),
      blockConfigContent
    );

    const previewData = {
      title: "Preview Page",
      sections: [],
    };

    fs.writeFileSync(
      path.join(pagePath, "preview.json"),
      JSON.stringify(previewData, null, 2) + "\n"
    );

    // Generate initial types
    const initialSchema = {
      title: {
        type: "singleLine" as const,
        label: "Page Title",
        required: true,
        defaultValue: "Page Title",
      },
      sections: {
        type: "repeater" as const,
        label: "Page Sections",
        schema: {},
      },
    };

    const fieldTypesTemplate = await getFieldTypes();
    await generateTypes({ blockPath: pagePath, schema: initialSchema, fieldTypes: fieldTypesTemplate });

    // Add to metadata cache for instant filters
    updateBlockInCache(
      name,
      "template",
      {
        name: answers.displayName,
        description: answers.description,
        category: "pages",
        tags: [],
        schema: initialSchema,
      },
      "1.0.0"
    );

    spinner.succeed(`Page template "${name}" created successfully`);
    console.log(chalk.cyan("\nNext steps:\n"));
    console.log(chalk.white("  cmssy dev         # Preview your page"));
    console.log(chalk.white("  cmssy build       # Build your page\n"));
  } catch (error) {
    spinner.fail("Failed to create page template");
    console.error(chalk.red("Error:"), error);
    process.exit(1);
  }
}

export const createCommand = {
  block: createBlock,
  page: createPage,
};
