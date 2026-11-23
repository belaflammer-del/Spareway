import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStore } from "@/lib/store/local";
import { WalletError } from "@/lib/store/types";

let store: LocalStore;
beforeEach(() => {
  store = new LocalStore(path.join(mkdtempSync(path.join(tmpdir(), "kk-")), "db.json"));
});

describe("token wallet", () => {
  it("credits purchases idempotently (no double booking)", async () => {
    expect((await store.creditTokens("u1", 3, "purchase", "stripe:cs_1")).applied).toBe(true);
    expect((await store.creditTokens("u1", 3, "purchase", "stripe:cs_1")).applied).toBe(false);
    expect(await store.getBalance("u1")).toBe(3);
  });

  it("reserves, captures and keeps balance consistent", async () => {
    await store.creditTokens("u1", 1, "purchase", "k1");
    const r = await store.reserveTokens("u1", "an1", 1, "an1:reserve");
    expect(await store.getBalance("u1")).toBe(0);
    await store.captureReservation(r.id);
    await store.captureReservation(r.id); // idempotent
    expect(await store.getBalance("u1")).toBe(0);
    await expect(store.releaseReservation(r.id)).rejects.toBeInstanceOf(WalletError);
  });

  it("releases tokens when an analysis fails (no permanent loss)", async () => {
    await store.creditTokens("u1", 1, "purchase", "k1");
    const r = await store.reserveTokens("u1", "an1", 1, "an1:reserve");
    await store.releaseReservation(r.id, "Analyse fehlgeschlagen");
    await store.releaseReservation(r.id); // idempotent
    expect(await store.getBalance("u1")).toBe(1);
  });

  it("prevents double reservation via idempotency key and overdraft", async () => {
    await store.creditTokens("u1", 1, "purchase", "k1");
    const a = await store.reserveTokens("u1", "an1", 1, "an1:reserve");
    const b = await store.reserveTokens("u1", "an1", 1, "an1:reserve");
    expect(a.id).toBe(b.id);
    await expect(store.reserveTokens("u1", "an2", 1, "an2:reserve")).rejects.toMatchObject({ code: "insufficient_balance" });
  });

  it("serializes concurrent reservations", async () => {
    await store.creditTokens("u1", 2, "purchase", "k1");
    const results = await Promise.allSettled([1, 2, 3, 4].map((i) => store.reserveTokens("u1", `an${i}`, 1, `an${i}:reserve`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await store.getBalance("u1")).toBe(0);
  });

  it("finds a recent identical analysis by fingerprint (no second token)", async () => {
    const base = { userId: "u1", status: "completed" as const, tier: "full" as const, category: "vehicle" as const, platform: "ebay" as const, title: "x", aiCostUsd: 0, aiInputTokens: 0, aiOutputTokens: 0, mode: "rules_only" as const };
    await store.createAnalysis({ ...base, id: "an_old", createdAt: "2020-01-01T00:00:00Z", fingerprint: "fp1" });
    await store.createAnalysis({ ...base, id: "an_new", createdAt: new Date().toISOString(), fingerprint: "fp1" });
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    expect((await store.findAnalysisByFingerprint("u1", "fp1", since))?.id).toBe("an_new");
    expect(await store.findAnalysisByFingerprint("u2", "fp1", since)).toBeNull();
  });

  it("refund debit never goes below zero", async () => {
    await store.creditTokens("u1", 3, "purchase", "k1");
    const r = await store.reserveTokens("u1", "an1", 2, "an1:reserve");
    await store.captureReservation(r.id);
    const d = await store.debitRefund("u1", 3, "refund:ch_1");
    expect(d.debited).toBe(1);
    expect(await store.getBalance("u1")).toBe(0);
    expect((await store.debitRefund("u1", 3, "refund:ch_1")).applied).toBe(false);
  });
});
