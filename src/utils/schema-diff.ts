export interface SchemaField {
  type: string;
  label?: string;
  required?: boolean;
  defaultValue?: unknown;
  [key: string]: unknown;
}

export type Schema = Record<string, SchemaField>;

export interface SchemaChange {
  kind: "breaking" | "info";
  message: string;
}

/**
 * Compare local schema against remote schema and detect changes.
 * Returns a list of breaking and non-breaking changes.
 */
export function diffSchema(local: Schema, remote: Schema): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const localKeys = new Set(Object.keys(local));
  const remoteKeys = new Set(Object.keys(remote));

  // Fields removed (in remote but not in local)
  for (const key of remoteKeys) {
    if (!localKeys.has(key)) {
      changes.push({
        kind: "breaking",
        message: `Field "${key}" removed`,
      });
    }
  }

  // Fields added (in local but not in remote)
  for (const key of localKeys) {
    if (!remoteKeys.has(key)) {
      const field = local[key];
      const isRequired = field.required && field.defaultValue === undefined;
      if (isRequired) {
        changes.push({
          kind: "breaking",
          message: `Required field "${key}" added without defaultValue`,
        });
      } else {
        const defaultInfo =
          field.defaultValue !== undefined
            ? ` (default: ${JSON.stringify(field.defaultValue)})`
            : "";
        changes.push({
          kind: "info",
          message: `Field "${key}" added${field.required ? " (required)" : " (optional)"}${defaultInfo}`,
        });
      }
    }
  }

  // Fields changed (in both)
  for (const key of localKeys) {
    if (!remoteKeys.has(key)) continue;
    const localField = local[key];
    const remoteField = remote[key];

    // Type changed
    if (localField.type !== remoteField.type) {
      changes.push({
        kind: "breaking",
        message: `Field "${key}" type changed: ${remoteField.type} -> ${localField.type}`,
      });
    }

    // Label changed
    if (
      localField.label !== remoteField.label &&
      localField.label !== undefined
    ) {
      changes.push({
        kind: "info",
        message: `Field "${key}" label changed: "${remoteField.label}" -> "${localField.label}"`,
      });
    }

    // DefaultValue changed
    if (
      JSON.stringify(localField.defaultValue) !==
      JSON.stringify(remoteField.defaultValue)
    ) {
      if (localField.defaultValue !== undefined) {
        changes.push({
          kind: "info",
          message: `Field "${key}" defaultValue changed`,
        });
      }
    }
  }

  return changes;
}

/**
 * Check if there are any breaking changes in the diff.
 */
export function hasBreakingChanges(changes: SchemaChange[]): boolean {
  return changes.some((c) => c.kind === "breaking");
}
