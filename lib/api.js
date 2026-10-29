// Browser-side helper for calling the app's own API.
// Safe to import in client components (no secrets, no server modules).

const KEY = "cofounder-access-code";

export function getAccessCode() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setAccessCode(code) {
  try {
    localStorage.setItem(KEY, code);
  } catch {}
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const code = getAccessCode();
  if (code) headers["x-access-code"] = code;

  // If the app server can't be reached (restarting, briefly busy), try again a
  // couple of times before giving up, and then say so in plain words.
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      break;
    } catch {
      if (attempt >= 2) {
        throw new Error(
          "Can't reach the Inoverse server. Make sure `npm run dev` is still running, then try again."
        );
      }
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === "access_code") window.dispatchEvent(new Event("cofounder:need-code"));
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
