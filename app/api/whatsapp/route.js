// The WhatsApp webhook. Set this URL in Meta → WhatsApp → Configuration:
//   https://<your-vercel-domain>/api/whatsapp   (verify token = WHATSAPP_VERIFY_TOKEN)
// GET  → Meta's one-time check that the URL is yours
// POST → incoming messages. Answered with 200 right away (Meta retries slow replies),
//        then Inovo works on the message in the background.
import { after } from "next/server";
import { handleIncoming, signatureOk, whatsappConfigured } from "@/lib/whatsapp";

export const maxDuration = 60;

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new Response(p.get("hub.challenge") || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req) {
  if (!whatsappConfigured()) return new Response("WhatsApp is not set up", { status: 503 });
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Bad signature", { status: 401 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const messages = (body.entry || []).flatMap((e) => (e.changes || []).flatMap((c) => c.value?.messages || []));
  if (messages.length) {
    after(async () => {
      for (const m of messages) {
        await handleIncoming(m).catch((err) => console.error("WhatsApp message failed:", err.message));
      }
    });
  }
  return new Response("OK", { status: 200 });
}
