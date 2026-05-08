export const PUBLISH_JOB_STATUS = {
  QUEUED: "queued",
  BUILDING: "building",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type PublishJobStatus =
  (typeof PUBLISH_JOB_STATUS)[keyof typeof PUBLISH_JOB_STATUS];

export const BLOCK_BUILD_STATUS = {
  PENDING: "pending",
  BUILDING: "building",
  PUBLISHED: "published",
  FAILED: "failed",
} as const;

export type BlockBuildStatus =
  (typeof BLOCK_BUILD_STATUS)[keyof typeof BLOCK_BUILD_STATUS];

export interface PublishJobBlockResult {
  type: string;
  version: string;
  sourceUrl: string;
  status: BlockBuildStatus | string;
  bundleUrls?: { server: string; client: string; styles: string } | null;
  bundleSizes?: { server: number; client: number; styles: number } | null;
  bundleMs?: number | null;
  ssrTestMs?: number | null;
  error?: { code: string; stage: string; message: string } | null;
}

export interface PublishJobTimings {
  queuedAt: string;
  buildStartedAt?: string | null;
  buildCompletedAt?: string | null;
  spawnMs?: number | null;
  pnpmInstallMs?: number | null;
  networkLockdownMs?: number | null;
  snapshotMs?: number | null;
}

export interface PublishJob {
  id: string;
  workspaceId: string;
  status: PublishJobStatus | string;
  libManifestHash: string;
  snapshotId?: string | null;
  blocks: PublishJobBlockResult[];
  timings: PublishJobTimings;
  error?: { code: string; stage: string; message: string } | null;
}
