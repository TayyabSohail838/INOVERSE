// Small helpers shared by every API route.
import { InputError } from "@/lib/store";
import { DemoError } from "@/lib/demo";

// Optional access code: set ACCESS_CODE in the environment before sharing a deployed link.
export function guard(req) {
  const code = process.env.ACCESS_CODE;
  if (!code) return null;
  if (req.headers.get("x-access-code") === code) return null;
  return Response.json({ error: "Access code required.", code: "access_code" }, { status: 401 });
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new InputError("Request body must be JSON.");
  }
}

// Wrap a route handler: access check + consistent errors.
export function route(handler) {
  return async (req, ctx) => {
    const denied = guard(req);
    if (denied) return denied;
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof InputError) return Response.json({ error: err.message }, { status: 400 });
      if (err instanceof DemoError) return Response.json({ error: err.message, demo: true }, { status: 403 });
      console.error(err);
      // busy = Google's AI is overloaded: a short "try again" message, not a crash
      return Response.json({ error: err.message || "Something went wrong." }, { status: err.busy ? 503 : 500 });
    }
  };
}

// Next.js 15 passes params as a promise; awaiting also works on Next.js 14.
export async function idFrom(ctx) {
  const params = await ctx?.params;
  const id = params?.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new InputError("Invalid id.");
  return id;
}
