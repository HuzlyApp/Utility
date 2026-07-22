import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { config } from "@/lib/config";

type NeonAuthInstance = ReturnType<typeof createNeonAuth>;

let authInstance: NeonAuthInstance | null = null;

// Next.js imports route/middleware modules during `next build` to collect page
// data. Auth is not used at build time, so allow the build to proceed when env
// vars are not yet available (e.g. CI before secrets are injected).
const BUILD_TIME_COOKIE_SECRET =
  "build-time-placeholder-not-used-at-runtime-32c";

function resolveCookieSecret(): string {
  if (config.neonAuthCookieSecret) return config.neonAuthCookieSecret;
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return BUILD_TIME_COOKIE_SECRET;
  }
  throw new Error(
    "Missing NEON_AUTH_COOKIE_SECRET. Set a 32+ character secret in your environment."
  );
}

function getAuthInstance(): NeonAuthInstance {
  if (!authInstance) {
    authInstance = createNeonAuth({
      baseUrl: config.neonAuthBaseUrl,
      cookies: {
        secret: resolveCookieSecret(),
      },
      logLevel: "warn",
    });
  }
  return authInstance;
}

// Single server-side Neon Auth (Managed Better Auth) instance. Provides
// handler() for the API proxy, middleware() for route protection, getSession()
// for server components / actions / routes, and all Better Auth server methods.
export const auth: NeonAuthInstance = new Proxy({} as NeonAuthInstance, {
  get(_target, prop, receiver) {
    const instance = getAuthInstance();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
