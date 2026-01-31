import fs from "fs-extra";
import path from "path";
import { ResourceConfig } from "../types/block-config.js";

const CACHE_FILE = ".cmssy/blocks-meta.json";

export interface BlockMeta {
  type: "block" | "template";
  category?: string;
  tags?: string[];
  displayName?: string;
  description?: string;
  version?: string;
  updatedAt: string;
}

export interface BlocksMetaCache {
  version: 1;
  blocks: Record<string, BlockMeta>;
}

function getCachePath(cwd = process.cwd()): string {
  return path.join(cwd, CACHE_FILE);
}

export function loadMetaCache(cwd = process.cwd()): BlocksMetaCache {
  const cachePath = getCachePath(cwd);

  if (fs.existsSync(cachePath)) {
    try {
      return fs.readJsonSync(cachePath);
    } catch {
      // Corrupted cache, return empty
    }
  }

  return { version: 1, blocks: {} };
}

export function saveMetaCache(cache: BlocksMetaCache, cwd = process.cwd()): void {
  const cachePath = getCachePath(cwd);
  fs.ensureDirSync(path.dirname(cachePath));
  fs.writeJsonSync(cachePath, cache, { spaces: 2 });
}

export function updateBlockInCache(
  name: string,
  type: "block" | "template",
  config: ResourceConfig | null,
  version?: string,
  cwd = process.cwd()
): void {
  const cache = loadMetaCache(cwd);

  cache.blocks[name] = {
    type,
    category: config?.category,
    tags: config?.tags,
    displayName: config?.name,
    description: config?.description,
    version,
    updatedAt: new Date().toISOString(),
  };

  saveMetaCache(cache, cwd);
}

export function removeBlockFromCache(name: string, cwd = process.cwd()): void {
  const cache = loadMetaCache(cwd);
  delete cache.blocks[name];
  saveMetaCache(cache, cwd);
}

export function getBlockMeta(name: string, cwd = process.cwd()): BlockMeta | null {
  const cache = loadMetaCache(cwd);
  return cache.blocks[name] || null;
}

/**
 * Get all unique categories from cache
 */
export function getCachedCategories(cwd = process.cwd()): string[] {
  const cache = loadMetaCache(cwd);
  const categories = new Set<string>();

  Object.values(cache.blocks).forEach((meta) => {
    if (meta.category) {
      categories.add(meta.category);
    }
  });

  return Array.from(categories).sort();
}

/**
 * Get all unique tags from cache
 */
export function getCachedTags(cwd = process.cwd()): string[] {
  const cache = loadMetaCache(cwd);
  const tags = new Set<string>();

  Object.values(cache.blocks).forEach((meta) => {
    if (meta.tags) {
      meta.tags.forEach((tag) => tags.add(tag));
    }
  });

  return Array.from(tags).sort();
}
