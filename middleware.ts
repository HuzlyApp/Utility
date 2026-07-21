import { auth } from "@/lib/auth/server";

// Server-side session validation + redirect for every protected route (spec §1).
// Unauthenticated users are redirected to /login. API routes and server actions
// additionally re-validate the session via requireUser() for defense in depth.
export default auth.middleware({
  loginUrl: "/login",
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/jobs/:path*",
    "/candidates/:path*",
    "/analyses/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/change-password",
  ],
};
