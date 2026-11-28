import { expect, it } from "vitest";
import { describeAiError, safeErr } from "@/lib/ai/errors";

const FAKE = "sk-proj-TESTONLY TESTabcdefghijklmnopqrstuvwxyz0123456789ABCDEF";

it("gibt niemals Schlüssel oder Header-Werte aus", () => {
  const e = new TypeError(`Headers.append: "Bearer ${FAKE}" is an invalid header value.`);
  for (const t of [describeAiError(e).reason, safeErr(e)]) {
    expect(t).not.toMatch(/TESTONLY|TESTabcdef|sk-proj/);
  }
  expect(safeErr(new Error(`token ${"x".repeat(40)}`))).not.toContain("x".repeat(40));
  expect(describeAiError({ status: 404, message: "model not found" }, "gpt-x").code).toBe("model");
  expect(describeAiError({ status: 401, message: "Incorrect API key" }).code).toBe("auth_format");
});
