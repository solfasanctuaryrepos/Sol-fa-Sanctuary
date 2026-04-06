/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ CRITICAL: Missing Supabase environment variables. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env.local file or your hosting provider's dashboard. The app will not function correctly.");
}
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper for auth
export const auth = supabase.auth;

// Helper for database
export const db = supabase;

// Helper for storage
export const storage = supabase.storage;
