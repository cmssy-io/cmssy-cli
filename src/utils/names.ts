export interface BlockNames {
  type: string;
  camel: string;
  Pascal: string;
  Label: string;
}

function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

export function blockNames(input: string): BlockNames {
  const parts = words(input);
  if (parts.length === 0) {
    throw new Error("Block name must contain at least one letter or digit.");
  }
  const type = parts.join("-");
  const Pascal = parts.map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
  const camel = Pascal[0]!.toLowerCase() + Pascal.slice(1);
  const Label = parts.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
  return { type, camel, Pascal, Label };
}
