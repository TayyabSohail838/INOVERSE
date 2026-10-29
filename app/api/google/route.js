// GET    /api/google → { configured, connected, account, last_synced_at }
// DELETE /api/google → disconnect Gmail (also revokes Inoverse's access at Google)
import { googleConfigured, revoke, PROVIDER } from "@/lib/google";
import { getIntegration, removeIntegration } from "@/lib/tasks";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const configured = googleConfigured();
  const integ = configured ? await getIntegration(PROVIDER).catch(() => null) : null;
  return Response.json({
    configured,
    connected: Boolean(integ),
    account: integ?.account || "",
    last_synced_at: integ?.last_synced_at || null,
  });
});

export const DELETE = route(async () => {
  const integ = await getIntegration(PROVIDER);
  if (integ) {
    await revoke(integ.refresh_token);
    await removeIntegration(PROVIDER);
  }
  return Response.json({ ok: true });
});
