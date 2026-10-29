// GET /api/whatsapp/status → is the WhatsApp bot set up, and which number may talk to it
import { whatsappConfigured, ownerNumber } from "@/lib/whatsapp";
import { lastInboundAt } from "@/lib/people";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const owner = ownerNumber();
  return Response.json({
    configured: whatsappConfigured(),
    owner: owner ? `+${owner.slice(0, 4)}•••${owner.slice(-3)}` : "",
    hasVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    briefTemplate: Boolean(process.env.WHATSAPP_BRIEF_TEMPLATE),
    lastMessageAt: await lastInboundAt().catch(() => null),
  });
});
