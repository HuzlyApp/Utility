import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { config } from "@/lib/config";

// Single server-side Neon Auth (Managed Better Auth) instance. Provides
// handler() for the API proxy, middleware() for route protection, getSession()
// for server components / actions / routes, and all Better Auth server methods.
export const auth = createNeonAuth({
  baseUrl: config.neonAuthBaseUrl,
  cookies: {
    secret: config.neonAuthCookieSecret,
  },
  logLevel: "warn",
});
