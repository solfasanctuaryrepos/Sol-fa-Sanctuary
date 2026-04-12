/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Before creating the client, evict any stale tokens from localStorage.
// A revoked or expired-server-side token causes the Supabase client to enter
// a broken internal state on init, blocking all subsequent API calls and
// preventing re-login. We detect this by checking the token's expiry; if the
// token is expired we remove it so the client starts clean.
try {
  const storageKey = `sb-${supabaseUrl.match(/\/\/([^.]+)/)?.[1]}-auth-token`;
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const parsed = JSON.parse(raw);
    const expiresAt: number = parsed?.expires_at ?? 0;
    // Remove if expired (with a 60-second buffer)
    if (expiresAt < Math.floor(Date.now() / 1000) + 60) {
      localStorage.removeItem(storageKey);
    }
  }
} catch {
  // Ignore — storage may be unavailable in some contexts
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const auth = supabase.auth;
export const db = supabase;
export const storage = supabase.storage;
