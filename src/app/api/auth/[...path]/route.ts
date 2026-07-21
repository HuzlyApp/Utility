import { auth } from "@/lib/auth/server";

// Neon Auth API proxy: forwards sign-in/out, OAuth callbacks, session, and
// password-reset calls to the hosted Managed Better Auth server.
export const { GET, POST } = auth.handler();
