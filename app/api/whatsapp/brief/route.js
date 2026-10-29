// GET  /api/whatsapp/brief → sent by Vercel Cron every morning (see vercel.json)
// POST /api/whatsapp/brief → "Send me today's brief" button in the app
import { sendBrief, whatsappConfigured } from "@/lib/whatsapp";
import { route } from "@/lib/http";
import { isDemo } from "@/lib/demo";

export const maxDuration = 60;

export async function GET(req) {
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!whatsappConfigured()) return Response.json({ sent: false, reason: "WhatsApp is not set up." });
  try {
    return Response.json(await sendBrief());
  } catch (err) {
    console.error("Morning brief:", err.message);
    return Response.json({ sent: false, reason: err.message }, { status: 500 });
  }
}

export const POST = route(async () => {
  if (isDemo()) return Response.json({ sent: false, reason: "The public demo doesn't send WhatsApp messages." });
  if (!whatsappConfigured()) return Response.json({ sent: false, reason: "WhatsApp is not set up yet. See “Connect WhatsApp” in the README." });
  return Response.json(await sendBrief());
});
