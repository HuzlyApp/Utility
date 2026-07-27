import { describe, expect, it } from "vitest";
import {
  buildLoginRedirectUrl,
  getPostLoginRedirect,
  sanitizeInternalReturnTo,
} from "@/lib/auth/return-to";

describe("return-to safety", () => {
  it("accepts internal paths with query strings", () => {
    expect(sanitizeInternalReturnTo("/analyses/123?tab=summary")).toBe(
      "/analyses/123?tab=summary"
    );
  });

  it("rejects external urls", () => {
    expect(sanitizeInternalReturnTo("https://evil.example/phish")).toBeNull();
    expect(sanitizeInternalReturnTo("//evil.example/phish")).toBeNull();
  });

  it("falls back to dashboard on invalid input", () => {
    expect(getPostLoginRedirect("javascript:alert(1)")).toBe("/dashboard");
  });

  it("builds login redirect with safe returnTo", () => {
    const loginUrl = buildLoginRedirectUrl(
      new URL("https://app.example.com/analyses/abc?view=full")
    );
    expect(loginUrl.pathname).toBe("/login");
    expect(loginUrl.searchParams.get("returnTo")).toBe("/analyses/abc?view=full");
  });
});

