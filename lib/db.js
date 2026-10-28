// Supabase client for the server only. Uses the service role key, so it must
// never be imported into a client component.
import { createClient } from "@supabase/supabase-js";

let client = null;

export const COMPANY = process.env.COMPANY_SLUG || "inovix";

const url = () => (process.env.SUPABASE_URL || "").trim();
const key = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

export function dbEnabled() {
  return Boolean(client || (url() && key()));
}

export function db() {
  if (client) return client;
  if (!dbEnabled()) return null;
  if (!/^https?:\/\//i.test(url())) {
    throw new Error("SUPABASE_URL must be your project URL (https://<project-id>.supabase.co), not an API key.");
  }
  client = createClient(url(), key(), {
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
