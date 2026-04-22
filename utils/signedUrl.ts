import { storage } from '../supabase';
import { MusicSheet } from '../types';

// Rewrite legacy http://IP:PORT storage URLs to the current Supabase base URL.
// Handles any stale URLs that may have been cached or stored before the HTTPS migration.
const LEGACY_BASE = 'http://76.13.138.43:54321';
const SUPABASE_BASE = (import.meta.env.VITE_SUPABASE_URL as string) || '';

function sanitizeUrl(url: string): string {
  if (url.startsWith(LEGACY_BASE) && SUPABASE_BASE && SUPABASE_BASE !== LEGACY_BASE) {
    return SUPABASE_BASE + url.slice(LEGACY_BASE.length);
  }
  return url;
}

function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

export async function getPdfUrl(sheet: MusicSheet): Promise<string> {
  const pdfUrl = sanitizeUrl(sheet.pdfUrl);
  if (sheet.isPublic) return pdfUrl;
  // Private sheet: create a signed URL
  const path = extractStoragePath(pdfUrl, 'sheets');
  if (!path) return pdfUrl; // fallback
  const { data, error } = await storage.from('sheets').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return pdfUrl;
  return sanitizeUrl(data.signedUrl);
}

/** Sanitize any storage URL — use for thumbnails, etc. */
export function sanitizeStorageUrl(url: string): string {
  return sanitizeUrl(url);
}
