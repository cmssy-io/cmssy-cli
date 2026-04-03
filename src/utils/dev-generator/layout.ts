import fs from "fs-extra";
import path from "path";

export function generateRootLayout(devRoot: string) {
  const content = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cmssy Dev Server",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23667eea'/%3E%3Ctext x='50' y='70' font-size='60' font-weight='bold' text-anchor='middle' fill='white' font-family='system-ui'%3EC%3C/text%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
  fs.writeFileSync(path.join(devRoot, "app/layout.tsx"), content);
}

export function generateGlobalsCss(devRoot: string, projectRoot: string) {
  const rel = path.relative(path.join(devRoot, "app"), projectRoot);

  // Check for project CSS files that contain Tailwind / theme
  const cssFiles = ["styles/main.css", "styles/globals.css", "app/globals.css"];
  const projectCssFile = cssFiles.find((f) =>
    fs.existsSync(path.join(projectRoot, f)),
  );

  // Import the project's main CSS (Tailwind + theme) if it exists
  const projectCssImport = projectCssFile
    ? `@import "${rel}/${projectCssFile}";\n\n`
    : "";

  const content = `${projectCssImport}*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
`;
  fs.writeFileSync(path.join(devRoot, "app/globals.css"), content);
}
