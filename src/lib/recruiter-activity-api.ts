import type { NextRequest } from "next/server";
import type { AppUser } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/session";
import {
  resolveDateRange,
  resolveScopedRecruiterId,
  type DatePreset,
} from "@/lib/recruiter-activity";
import { resolveTenantIdForQuery } from "@/lib/dal/recruiter-activity";

export function parsePreset(raw: string | null): DatePreset {
  const allowed: DatePreset[] = [
    "today",
    "yesterday",
    "last_7_days",
    "last_30_days",
    "this_month",
    "last_month",
    "custom",
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as DatePreset;
  return "last_7_days";
}

export function parseActivityQuery(req: NextRequest, user: AppUser) {
  const url = req.nextUrl;
  const tenantId = resolveTenantIdForQuery(user, url.searchParams.get("tenantId"));

  if (user.role !== "SUPER_ADMIN") {
    if (!user.tenantId || user.tenantId !== tenantId) {
      throw new AuthError("Forbidden", 403);
    }
  }

  const scopedRecruiterId = resolveScopedRecruiterId({
    viewerRole: user.role,
    viewerUserId: user.id,
    requestedRecruiterId: url.searchParams.get("recruiterId"),
  });

  const preset = parsePreset(url.searchParams.get("preset"));
  const range = resolveDateRange(preset, {
    customFrom: url.searchParams.get("from") ?? undefined,
    customTo: url.searchParams.get("to") ?? undefined,
  });

  const queryUser: AppUser =
    user.role === "SUPER_ADMIN" ? { ...user, tenantId } : user;

  return {
    tenantId,
    scopedRecruiterId,
    preset,
    range,
    queryUser,
    search: url.searchParams.get("search"),
    statusFilter: (url.searchParams.get("status") as "active" | "inactive" | "all" | null) ?? "all",
    candidateId: url.searchParams.get("candidateId"),
    jobId: url.searchParams.get("jobId"),
    actionType: url.searchParams.get("actionType"),
    exportType: url.searchParams.get("type") ?? "productivity",
    limit: Number(url.searchParams.get("limit") ?? "50") || 50,
    page: Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1),
    offset: Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0),
  };
}
