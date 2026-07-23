import { ok } from "@/lib/http";
import { withUser } from "@/lib/api-helpers";
import { getProviderAvailability, AI_MODEL_OPTIONS } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public availability flags only — never returns API keys or secrets. */
export async function GET() {
  return withUser("ai.providers", async () => {
    const availability = getProviderAvailability();
    return ok({
      options: AI_MODEL_OPTIONS.map((o) => ({
        id: o.id,
        label: o.label,
        provider: o.provider,
        available: availability[o.provider].available,
        message: availability[o.provider].message,
      })),
      availability,
      default_option: "grok-4.5",
    });
  });
}
