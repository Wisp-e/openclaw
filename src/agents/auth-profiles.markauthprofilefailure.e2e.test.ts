import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateAuthProfileCooldownMs,
  clearAllAuthProfileCooldowns,
  ensureAuthProfileStore,
  markAuthProfileFailure,
} from "./auth-profiles.js";

type AuthProfileStore = ReturnType<typeof ensureAuthProfileStore>;

async function withAuthProfileStore(
  fn: (ctx: { agentDir: string; store: AuthProfileStore }) => Promise<void>,
): Promise<void> {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-auth-"));
  try {
    const authPath = path.join(agentDir, "auth-profiles.json");
    fs.writeFileSync(
      authPath,
      JSON.stringify({
        version: 1,
        profiles: {
          "anthropic:default": {
            type: "api_key",
            provider: "anthropic",
            key: "sk-default",
          },
        },
      }),
    );

    const store = ensureAuthProfileStore(agentDir);
    await fn({ agentDir, store });
  } finally {
    fs.rmSync(agentDir, { recursive: true, force: true });
  }
}

function expectCooldownInRange(remainingMs: number, minMs: number, maxMs: number): void {
  expect(remainingMs).toBeGreaterThan(minMs);
  expect(remainingMs).toBeLessThan(maxMs);
}

describe("markAuthProfileFailure", () => {
  it("disables billing failures for ~5 hours by default", async () => {
    await withAuthProfileStore(async ({ agentDir, store }) => {
      const startedAt = Date.now();
      await markAuthProfileFailure({
        store,
        profileId: "anthropic:default",
        reason: "billing",
        agentDir,
      });

      const disabledUntil = store.usageStats?.["anthropic:default"]?.disabledUntil;
      expect(typeof disabledUntil).toBe("number");
      const remainingMs = (disabledUntil as number) - startedAt;
      expectCooldownInRange(remainingMs, 4.5 * 60 * 60 * 1000, 5.5 * 60 * 60 * 1000);
    });
  });
  it("honors per-provider billing backoff overrides", async () => {
    await withAuthProfileStore(async ({ agentDir, store }) => {
      const startedAt = Date.now();
      await markAuthProfileFailure({
        store,
        profileId: "anthropic:default",
        reason: "billing",
        agentDir,
        cfg: {
          auth: {
            cooldowns: {
              billingBackoffHoursByProvider: { Anthropic: 1 },
              billingMaxHours: 2,
            },
          },
        } as never,
      });

      const disabledUntil = store.usageStats?.["anthropic:default"]?.disabledUntil;
      expect(typeof disabledUntil).toBe("number");
      const remainingMs = (disabledUntil as number) - startedAt;
      expectCooldownInRange(remainingMs, 0.8 * 60 * 60 * 1000, 1.2 * 60 * 60 * 1000);
    });
  });
  it("resets backoff counters outside the failure window", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-auth-"));
    try {
      const authPath = path.join(agentDir, "auth-profiles.json");
      const now = Date.now();
      fs.writeFileSync(
        authPath,
        JSON.stringify({
          version: 1,
          profiles: {
            "anthropic:default": {
              type: "api_key",
              provider: "anthropic",
              key: "sk-default",
            },
          },
          usageStats: {
            "anthropic:default": {
              errorCount: 9,
              failureCounts: { billing: 3 },
              lastFailureAt: now - 48 * 60 * 60 * 1000,
            },
          },
        }),
      );

      const store = ensureAuthProfileStore(agentDir);
      await markAuthProfileFailure({
        store,
        profileId: "anthropic:default",
        reason: "billing",
        agentDir,
        cfg: {
          auth: { cooldowns: { failureWindowHours: 24 } },
        } as never,
      });

      expect(store.usageStats?.["anthropic:default"]?.errorCount).toBe(1);
      expect(store.usageStats?.["anthropic:default"]?.failureCounts?.billing).toBe(1);
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("uses gentler timeout backoff (~30s) instead of standard cooldown (~60s)", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-auth-"));
    try {
      const authPath = path.join(agentDir, "auth-profiles.json");
      fs.writeFileSync(
        authPath,
        JSON.stringify({
          version: 1,
          profiles: {
            "google-antigravity:default": {
              type: "api_key",
              provider: "google-antigravity",
              key: "sk-default",
            },
          },
        }),
      );

      const store = ensureAuthProfileStore(agentDir);
      const startedAt = Date.now();
      await markAuthProfileFailure({
        store,
        profileId: "google-antigravity:default",
        reason: "timeout",
        agentDir,
      });

      const stats = store.usageStats?.["google-antigravity:default"];
      expect(stats?.errorCount).toBe(1);
      expect(stats?.failureCounts?.timeout).toBe(1);
      const cooldownUntil = stats?.cooldownUntil;
      expect(typeof cooldownUntil).toBe("number");
      // Timeout cooldown should be ~30s (first failure), not ~60s
      const remainingMs = (cooldownUntil as number) - startedAt;
      expect(remainingMs).toBeGreaterThan(25_000);
      expect(remainingMs).toBeLessThan(35_000);
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });

  it("rate_limit uses standard aggressive backoff (~60s)", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-auth-"));
    try {
      const authPath = path.join(agentDir, "auth-profiles.json");
      fs.writeFileSync(
        authPath,
        JSON.stringify({
          version: 1,
          profiles: {
            "anthropic:default": {
              type: "api_key",
              provider: "anthropic",
              key: "sk-default",
            },
          },
        }),
      );

      const store = ensureAuthProfileStore(agentDir);
      const startedAt = Date.now();
      await markAuthProfileFailure({
        store,
        profileId: "anthropic:default",
        reason: "rate_limit",
        agentDir,
      });

      const stats = store.usageStats?.["anthropic:default"];
      const cooldownUntil = stats?.cooldownUntil;
      expect(typeof cooldownUntil).toBe("number");
      // Rate limit should use standard backoff: ~60s for first failure
      const remainingMs = (cooldownUntil as number) - startedAt;
      expect(remainingMs).toBeGreaterThan(55_000);
      expect(remainingMs).toBeLessThan(65_000);
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });
});

describe("clearAllAuthProfileCooldowns", () => {
  it("clears cooldowns and error counts but preserves billing disabled state", async () => {
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-auth-"));
    try {
      const authPath = path.join(agentDir, "auth-profiles.json");
      fs.writeFileSync(
        authPath,
        JSON.stringify({
          version: 1,
          profiles: {
            "anthropic:default": {
              type: "api_key",
              provider: "anthropic",
              key: "sk-a",
            },
            "openai:default": {
              type: "api_key",
              provider: "openai",
              key: "sk-b",
            },
          },
          usageStats: {
            "anthropic:default": {
              errorCount: 5,
              cooldownUntil: Date.now() + 300_000,
              failureCounts: { rate_limit: 3, timeout: 2 },
              disabledUntil: Date.now() + 3_600_000,
              disabledReason: "billing",
            },
            "openai:default": {
              errorCount: 2,
              cooldownUntil: Date.now() + 60_000,
              failureCounts: { timeout: 2 },
            },
          },
        }),
      );

      const store = ensureAuthProfileStore(agentDir);
      await clearAllAuthProfileCooldowns({ store, agentDir });

      const anthropicStats = store.usageStats?.["anthropic:default"];
      expect(anthropicStats?.errorCount).toBe(0);
      expect(anthropicStats?.cooldownUntil).toBeUndefined();
      expect(anthropicStats?.failureCounts).toBeUndefined();
      // Billing disabled state should be preserved
      expect(anthropicStats?.disabledUntil).toBeGreaterThan(Date.now());
      expect(anthropicStats?.disabledReason).toBe("billing");

      const openaiStats = store.usageStats?.["openai:default"];
      expect(openaiStats?.errorCount).toBe(0);
      expect(openaiStats?.cooldownUntil).toBeUndefined();
      expect(openaiStats?.failureCounts).toBeUndefined();
    } finally {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  });
});

describe("calculateAuthProfileCooldownMs", () => {
  it("applies exponential backoff with a 1h cap", () => {
    expect(calculateAuthProfileCooldownMs(1)).toBe(60_000);
    expect(calculateAuthProfileCooldownMs(2)).toBe(5 * 60_000);
    expect(calculateAuthProfileCooldownMs(3)).toBe(25 * 60_000);
    expect(calculateAuthProfileCooldownMs(4)).toBe(60 * 60_000);
    expect(calculateAuthProfileCooldownMs(5)).toBe(60 * 60_000);
  });
});
