// Supabase client for the server only. Uses the service role key, so it must
// never be imported into a client component.
import { createClient } from "@supabase/supabase-js";

let client = null;

export const COMPANY = process.env.COMPANY_SLUG || "inovix";

export function dbEnabled() {
  return Boolean(client || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY));
}

export function db() {
  if (client) return client;
  if (!dbEnabled()) return null;
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Tests swap in a fake client.
export function setDbForTests(fake) {
  client = fake;
}

// Unwrap a Supabase result: return data or throw a readable error.
export function must({ data, error }) {
  if (error) throw new Error(`Database: ${error.message}`);
  return data;
}
