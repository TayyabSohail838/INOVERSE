// GET /api/google/callback → Google sends you back here after sign-in.
// Saves the long-lived sign-in so Inovo can keep checking your "Inovo" emails.
import { exchangeCode, PROVIDER } from "@/lib/google";
import { saveIntegration } from "@/lib/tasks";

const back = (url, params) => {
  const to = new URL("/", url);
  for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
  return new Response(null, {
    status: 302,
    headers: { Location: to.toString(), "Set-Cookie": "g_oauth_state=; Path=/api/google; Max-Age=0" },
  });
};

export async function GET(req) {
  const url = new URL(req.url);
  const cookie = req.headers.get("cookie") || "";
  const expected = cookie.match(/(?:^|;\s*)g_oauth_state=([a-f0-9]+)/)?.[1];

  if (url.searchParams.get("error")) return back(url, { gmail: "cancelled" });
  if (!expected || expected !== url.searchParams.get("state")) {
    return back(url, { gmail: "error", reason: "The sign-in link expired. Try Connect Gmail again." });
  }
  try {
    const { refresh_token, account } = await exchangeCode(url.searchParams.get("code"), url.origin);
    if (!refresh_token) throw new Error("Google didn't give long-term access. Remove Inoverse at myaccount.google.com/permissions and connect again.");
    await saveIntegration(PROVIDER, { account, refresh_token });
    return back(url, { gmail: "connected" });
  } catch (err) {
    return back(url, { gmail: "error", reason: err.message.slice(0, 200) });
  }
}
