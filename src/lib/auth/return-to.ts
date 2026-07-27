const DEFAULT_RETURN_TO = "/dashboard";

export function sanitizeInternalReturnTo(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;

  try {
    const parsed = new URL(value, "https://internal.local");
    if (parsed.origin !== "https://internal.local") return null;
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!normalized.startsWith("/")) return null;
    if (normalized === "/login") return null;
    return normalized;
  } catch {
    return null;
  }
}

export function getPostLoginRedirect(input: string | null | undefined): string {
  return sanitizeInternalReturnTo(input) ?? DEFAULT_RETURN_TO;
}

export function buildLoginRedirectUrl(current: URL, loginPath = "/login"): URL {
  const loginUrl = new URL(loginPath, current.origin);
  const returnTo = sanitizeInternalReturnTo(
    `${current.pathname}${current.search}${current.hash}`
  );
  if (returnTo && returnTo !== DEFAULT_RETURN_TO) {
    loginUrl.searchParams.set("returnTo", returnTo);
  }
  return loginUrl;
}

