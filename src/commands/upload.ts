import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import ora from "ora";
import FormData from "form-data";
import fetch from "node-fetch";
import { loadConfig } from "../utils/config.js";

interface UploadOptions {
  workspace?: string;
  all?: boolean;
}

export async function uploadCommand(
  packageFiles: string[] = [],
  options: UploadOptions
) {
  const cwd = process.cwd();
  const packagesDir = path.join(cwd, "packages");

  // Load API config
  const config = loadConfig();

  if (!config.apiToken) {
    console.error(
      chalk.red("✖ API token not configured. Run:") +
        chalk.white("\n  cmssy configure")
    );
    process.exit(1);
  }

  // Determine workspace ID
  let workspaceId = options.workspace || config.workspaceId;

  if (!workspaceId) {
    console.error(
      chalk.red("✖ Workspace ID required. Specify with --workspace or set CMSSY_WORKSPACE_ID in .env")
    );
    process.exit(1);
  }

  // Check if packages directory exists
  if (!(await fs.pathExists(packagesDir))) {
    console.error(
      chalk.red("✖ No packages directory found. Run:") +
        chalk.white("\n  cmssy package --all")
    );
    process.exit(1);
  }

  // Determine which packages to upload
  let toUpload: string[] = [];

  if (options.all) {
    // Get all ZIP files from packages directory
    const files = await fs.readdir(packagesDir);
    toUpload = files
      .filter((f) => f.endsWith(".zip"))
      .map((f) => path.join(packagesDir, f));
  } else if (packageFiles.length > 0) {
    // Specific files
    for (const file of packageFiles) {
      const filePath = path.isAbsolute(file) ? file : path.join(packagesDir, file);

      // Add .zip extension if missing
      const zipPath = filePath.endsWith(".zip") ? filePath : `${filePath}.zip`;

      if (!(await fs.pathExists(zipPath))) {
        console.error(chalk.red(`✖ Package not found: ${zipPath}`));
        process.exit(1);
      }
      toUpload.push(zipPath);
    }
  } else {
    console.error(
      chalk.red("✖ Specify packages to upload or use --all:\n") +
        chalk.white("  cmssy upload hero-1.0.0.zip\n") +
        chalk.white("  cmssy upload hero-1.0.0 pricing-2.1.0\n") +
        chalk.white("  cmssy upload --all")
    );
    process.exit(1);
  }

  if (toUpload.length === 0) {
    console.log(chalk.yellow("⚠ No packages found to upload"));
    return;
  }

  console.log(chalk.blue(`\n📤 Uploading ${toUpload.length} package(s)...\n`));

  // Upload each package
  let successCount = 0;
  let failCount = 0;

  for (const filePath of toUpload) {
    const fileName = path.basename(filePath);
    const result = await uploadPackage(filePath, workspaceId, config.apiUrl, config.apiToken);

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log();
  if (successCount > 0) {
    console.log(chalk.green(`✓ Successfully uploaded ${successCount} package(s)`));
  }
  if (failCount > 0) {
    console.log(chalk.red(`✖ Failed to upload ${failCount} package(s)`));
  }
}

async function uploadPackage(
  filePath: string,
  workspaceId: string,
  apiUrl: string,
  apiToken: string
): Promise<{ success: boolean; error?: string }> {
  const fileName = path.basename(filePath);
  const spinner = ora(`Uploading ${chalk.cyan(fileName)}`).start();

  try {
    // Create form data
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), {
      filename: fileName,
      contentType: "application/zip",
    });
    form.append("workspaceId", workspaceId);

    // Determine upload endpoint
    const uploadUrl = apiUrl.replace("/graphql", "/api/upload-package");

    // Upload file
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    const result: any = await response.json();

    if (result.success || result.url) {
      const fileSize = (fs.statSync(filePath).size / 1024).toFixed(2);
      spinner.succeed(
        `Uploaded ${chalk.cyan(fileName)} (${fileSize} KB)${
          result.url ? chalk.gray(` → ${result.url}`) : ""
        }`
      );
      return { success: true };
    } else {
      throw new Error(result.error || "Upload failed");
    }
  } catch (error: any) {
    spinner.fail(
      `Failed to upload ${chalk.cyan(fileName)}: ${error.message}`
    );
    return { success: false, error: error.message };
  }
}
