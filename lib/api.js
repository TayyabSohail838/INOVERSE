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

  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === "access_code") window.dispatchEvent(new Event("cofounder:need-code"));
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
