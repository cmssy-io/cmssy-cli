import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveWorkspace } from "./delivery.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(ok: boolean, body: unknown): void {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("resolveWorkspace", () => {
  it("resolves a language-keyed siteName via defaultLanguage", async () => {
    mockFetch(true, {
      data: {
        publicSiteConfig: {
          siteName: { en: "My Site", de: "Meine Seite" },
          defaultLanguage: "de",
        },
      },
    });
    expect(await resolveWorkspace("demo")).toEqual({
      status: "found",
      siteName: "Meine Seite",
    });
  });

  it("returns not-found when publicSiteConfig is null", async () => {
    mockFetch(true, { data: { publicSiteConfig: null } });
    expect(await resolveWorkspace("nope")).toEqual({ status: "not-found" });
  });

  it("returns error on a non-OK response", async () => {
    mockFetch(false, {});
    const r = await resolveWorkspace("x");
    expect(r.status).toBe("error");
  });
});
