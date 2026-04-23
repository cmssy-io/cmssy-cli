import fs from "fs-extra";
import path from "path";

export function generateNextConfig(devRoot: string, projectRoot: string) {
  const rel = path.relative(devRoot, projectRoot);
  const content = `import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: resolve(__dirname, "${rel}"),
  },

  allowedDevOrigins: ['*'],

  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
`;
  fs.writeFileSync(path.join(devRoot, "next.config.mjs"), content);
}

export function generateTsConfig(devRoot: string, projectRoot: string) {
  // Paths must be relative to tsconfig location (.cmssy/dev/)
  const rel = path.relative(devRoot, projectRoot);

  // Read project tsconfig to forward user-defined path aliases and includes
  const projectTsConfigPath = path.join(projectRoot, "tsconfig.json");
  let userPaths: Record<string, string[]> = {};
  let userIncludes: string[] = [];
  if (fs.existsSync(projectTsConfigPath)) {
    try {
      const projectTsConfig = JSON.parse(
        fs.readFileSync(projectTsConfigPath, "utf-8"),
      );
      const rawPaths = projectTsConfig.compilerOptions?.paths || {};
      // Re-map user paths relative to .cmssy/dev/ (project tsconfig uses baseUrl: ".")
      for (const [alias, targets] of Object.entries(rawPaths) as [
        string,
        string[],
      ][]) {
        // Skip cmssy-cli/config — we handle it ourselves
        if (alias === "cmssy-cli/config") continue;
        userPaths[alias] = targets.map((t) => `${rel}/${t}`);
      }
      // Re-map user includes relative to .cmssy/dev/
      // Convert catch-all globs (e.g. blocks/**/*) to TS-only for better perf
      const rawIncludes = projectTsConfig.include || [];
      userIncludes = rawIncludes.flatMap((inc: string) => {
        const remapped = `${rel}/${inc}`;
        if (remapped.endsWith("/**/*")) {
          const base = remapped.slice(0, -5);
          return [`${base}/**/*.ts`, `${base}/**/*.tsx`];
        }
        return [remapped];
      });
    } catch {
      // Ignore parse errors — fall back to defaults
    }
  }

  const tsConfig = {
    compilerOptions: {
      target: "ES2020",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: {
        // User-defined aliases from project tsconfig (e.g. @/* for shadcn)
        ...userPaths,
        // Cmssy built-in aliases (override user if conflicting)
        "@blocks/*": [`${rel}/blocks/*`],
        "@templates/*": [`${rel}/templates/*`],
        "@styles/*": [`${rel}/styles/*`],
        "@lib/*": [`${rel}/lib/*`],
        "cmssy-cli/config": [`${rel}/node_modules/cmssy-cli/config`],
      },
    },
    include: [
      "next-env.d.ts",
      "**/*.ts",
      "**/*.tsx",
      ".next/types/**/*.ts",
      `${rel}/blocks/**/*.ts`,
      `${rel}/blocks/**/*.tsx`,
      `${rel}/templates/**/*.ts`,
      `${rel}/templates/**/*.tsx`,
      // User-defined includes from project tsconfig (e.g. components/**/*, lib/**/*)
      ...userIncludes,
    ],
    exclude: ["node_modules"],
  };

  fs.writeFileSync(
    path.join(devRoot, "tsconfig.json"),
    JSON.stringify(tsConfig, null, 2) + "\n",
  );
}
