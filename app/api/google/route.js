// GET    /api/google → { configured, connected, account, last_synced_at }
// DELETE /api/google → disconnect Gmail (also revokes Inoverse's access at Google)
import { googleConfigured, revoke, calendarGranted, PROVIDER } from "@/lib/google";
import { getIntegration, removeIntegration } from "@/lib/tasks";
import { route } from "@/lib/http";
import { isDemo, demoReadOnly } from "@/lib/demo";

export const GET = route(async () => {
  if (isDemo()) return Response.json({ configured: googleConfigured(), connected: false, demo: true, account: "", last_synced_at: null, calendar: false });
  const configured = googleConfigured();
  const integ = configured ? await getIntegration(PROVIDER).catch(() => null) : null;
  return Response.json({
    configured,
    connected: Boolean(integ),
    account: integ?.account || "",
    last_synced_at: integ?.last_synced_at || null,
    calendar: calendarGranted(integ), // false on older Gmail-only connections: reconnect to add it
  });
});

export const DELETE = route(async () => {
  demoReadOnly();
  const integ = await getIntegration(PROVIDER);
  if (integ) {
    await revoke(integ.refresh_token);
    await removeIntegration(PROVIDER);
  }
  return Response.json({ ok: true });
});
