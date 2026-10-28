// GET /api/status → what is configured, for the setup screen. Never returns secrets.
import { db, dbEnabled, COMPANY } from "@/lib/db";

export async function GET() {
  const status = {
    accessCodeRequired: Boolean(process.env.ACCESS_CODE),
    gemma: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMMA_MODEL || "gemma-4-31b-it",
    },
    supabase: { configured: dbEnabled(), ok: false, seeded: false, error: null },
  };

  if (status.supabase.configured) {
    try {
      const { data, error } = await db().from("company_profile").select("company").eq("company", COMPANY).maybeSingle();
      if (error) throw new Error(error.message);
      status.supabase.ok = true;
      status.supabase.seeded = Boolean(data);
    } catch (err) {
      status.supabase.error = /relation .* does not exist|schema cache/i.test(err.message)
        ? "Tables not found. Run supabase/schema.sql in the Supabase SQL Editor."
        : err.message;
    }
  }
  return Response.json(status);
}
