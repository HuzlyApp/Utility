import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { buildLoginRedirectUrl } from "@/lib/auth/return-to";

const neonAuthMiddleware = auth.middleware({
  loginUrl: "/login",
});

export default async function middleware(request: NextRequest) {
  const response = await neonAuthMiddleware(request);
  const location = response.headers.get("location");

  if (!location) return response;

  const redirectUrl = new URL(location, request.url);
  if (redirectUrl.pathname !== "/login") return response;
  if (redirectUrl.searchParams.has("returnTo")) return response;

  const loginWithReturnTo = buildLoginRedirectUrl(new URL(request.url));
  return NextResponse.redirect(loginWithReturnTo);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/jobs/:path*",
    "/candidates/:path*",
    "/users/:path*",
    "/analyses/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/workspace/:path*",
    "/superadmin/:path*",
    "/change-password",
  ],
};
