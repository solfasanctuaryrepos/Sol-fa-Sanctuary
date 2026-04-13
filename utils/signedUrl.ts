import { storage } from '../supabase';
import { MusicSheet } from '../types';

function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.slice(idx + marker.length);
}

export async function getPdfUrl(sheet: MusicSheet): Promise<string> {
  if (sheet.isPublic) return sheet.pdfUrl;
  // Private sheet: create a signed URL
  const path = extractStoragePath(sheet.pdfUrl, 'sheets');
  if (!path) return sheet.pdfUrl; // fallback
  const { data, error } = await storage.from('sheets').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return sheet.pdfUrl;
  return data.signedUrl;
}
