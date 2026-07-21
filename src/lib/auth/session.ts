import "server-only";
import { auth } from "./server";
import { getSql } from "@/lib/dal/client";

export type AppRole = "ADMIN" | "RECRUITER";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  mustChangePassword: boolean;
  tenantId: string;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

interface RawSessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

async function readSessionUser(): Promise<RawSessionUser | null> {
  const { data } = await auth.getSession();
  const user = data?.user as RawSessionUser | undefined;
  if (!user?.id) return null;
  return user;
}

// Ensures a user_profiles row exists for the authenticated user and returns the
// merged application view (role + must_change_password). Auto-provisions a
// RECRUITER profile the first time an authenticated user is seen (e.g. Google
// sign-in). The ADMIN role is only ever granted through the bootstrap script.
async function loadProfile(user: RawSessionUser): Promise<AppUser> {
  const sql = getSql();
  const authRole = (user.role ?? "").toLowerCase() === "admin" ? "ADMIN" : "RECRUITER";

  let rows = (await sql`
    SELECT user_id, email, full_name, role, must_change_password
    FROM user_profiles WHERE user_id = ${user.id}
  `) as Array<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    role: string;
    must_change_password: boolean;
  }>;

  if (rows.length === 0) {
    rows = (await sql`
      INSERT INTO user_profiles (user_id, email, full_name, role, must_change_password)
      VALUES (${user.id}, ${user.email ?? null}, ${user.name ?? null}, ${authRole}, false)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
      RETURNING user_id, email, full_name, role, must_change_password
    `) as typeof rows;
  }

  const profile = rows[0];
  // Role is the stronger of the auth role and the stored profile role.
  const role: AppRole =
    authRole === "ADMIN" || profile.role === "ADMIN" ? "ADMIN" : "RECRUITER";

  return {
    id: user.id,
    email: user.email ?? profile.email ?? "",
    name: user.name ?? profile.full_name,
    role,
    mustChangePassword: Boolean(profile.must_change_password),
    // Single-tenant per user for now; scope everything by owner id + tenant.
    tenantId: "default",
  };
}

// Returns the current app user or null (does not throw). For pages.
export async function getCurrentUser(): Promise<AppUser | null> {
  const user = await readSessionUser();
  if (!user) return null;
  return loadProfile(user);
}

// Throws AuthError(401) when unauthenticated. For API routes / server actions.
export async function requireUser(): Promise<AppUser> {
  const user = await readSessionUser();
  if (!user) throw new AuthError("Authentication required.", 401);
  return loadProfile(user);
}

// Throws 401 when unauthenticated, 403 when the role is insufficient.
export async function requireRole(role: AppRole): Promise<AppUser> {
  const user = await requireUser();
  if (role === "ADMIN" && user.role !== "ADMIN") {
    throw new AuthError("You do not have permission to perform this action.", 403);
  }
  return user;
}

// Clears the must_change_password flag after a successful password change.
export async function clearMustChangePassword(userId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE user_profiles SET must_change_password = false, updated_at = now()
    WHERE user_id = ${userId}
  `;
}
