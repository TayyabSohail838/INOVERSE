// GET /api/google/connect → sends you to Google to let Inoverse read your "Inovo" emails.
// This is a normal page visit (not a fetch), so the access code comes as ?access=.
import { randomBytes } from "node:crypto";
import { authUrl, googleConfigured } from "@/lib/google";

export async function GET(req) {
  const url = new URL(req.url);
  const code = process.env.ACCESS_CODE;
  if (code && url.searchParams.get("access") !== code) {
    return new Response("Access code required.", { status: 401 });
  }
  if (!googleConfigured()) {
    return Response.redirect(new URL("/?gmail=not-configured", url), 302);
  }
  // random state, checked on the way back, so nobody else can finish this sign-in
  const state = randomBytes(16).toString("hex");
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl(url.origin, state),
      "Set-Cookie": `g_oauth_state=${state}; Path=/api/google; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === "https:" ? "; Secure" : ""}`,
    },
  });
}
