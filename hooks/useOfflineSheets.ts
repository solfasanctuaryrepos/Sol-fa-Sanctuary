/**
 * useOfflineSheets
 *
 * Manages per-sheet offline PDF caching via the Cache Storage API.
 * The service worker (sw.js) intercepts Supabase storage fetch requests
 * and serves from this cache when offline.
 *
 * Metadata (id, title, composer, pdfUrl, thumbnailUrl) is persisted in
 * localStorage so the "Offline" tab in the Dashboard works without
 * inspecting the cache.
 */

import { useState, useEffect, useCallback } from 'react';
import { MusicSheet } from '../types';

const CACHE_NAME = 'solfa-offline-sheets-v1';
const LS_KEY = 'solfa-offline-sheet-meta';

export interface OfflineSheetMeta {
  id: string;
  title: string;
  composer: string;
  thumbnailUrl: string;
  pdfUrl: string;
  savedAt: string; // ISO string
  /** approximate size in bytes — computed after caching */
  sizeBytes?: number;
}

function readMeta(): OfflineSheetMeta[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeMeta(list: OfflineSheetMeta[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

const isSupported = () => 'caches' in window;

export function useOfflineSheets() {
  const [offlineMeta, setOfflineMeta] = useState<OfflineSheetMeta[]>(readMeta);
  const [saving, setSaving] = useState<string | null>(null);   // id currently being cached
  const [removing, setRemoving] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);         // 0–100 during save

  // Sync from localStorage when another tab makes changes
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === LS_KEY) setOfflineMeta(readMeta());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const isAvailableOffline = useCallback(
    (id: string) => offlineMeta.some(m => m.id === id),
    [offlineMeta]
  );

  /** Cache PDF + thumbnail for a sheet and persist metadata. */
  const saveForOffline = useCallback(async (sheet: MusicSheet): Promise<void> => {
    if (!isSupported()) throw new Error('Cache Storage not supported in this browser.');
    if (saving) return; // one at a time

    setSaving(sheet.id);
    setProgress(0);

    try {
      const cache = await caches.open(CACHE_NAME);

      // Fetch PDF (progress: 10 → 80)
      setProgress(10);
      const pdfResp = await fetch(sheet.pdfUrl, { mode: 'cors' });
      if (!pdfResp.ok) throw new Error(`PDF fetch failed: ${pdfResp.status}`);
      const pdfBlob = await pdfResp.blob();
      setProgress(60);
      await cache.put(new Request(sheet.pdfUrl), new Response(pdfBlob, {
        headers: { 'Content-Type': 'application/pdf' },
      }));
      setProgress(80);

      // Fetch thumbnail (progress: 80 → 95)
      let sizeBytes = pdfBlob.size;
      if (sheet.thumbnailUrl) {
        try {
          const thumbResp = await fetch(sheet.thumbnailUrl, { mode: 'cors' });
          if (thumbResp.ok) {
            const thumbBlob = await thumbResp.blob();
            await cache.put(new Request(sheet.thumbnailUrl), new Response(thumbBlob, {
              headers: { 'Content-Type': thumbBlob.type || 'image/jpeg' },
            }));
            sizeBytes += thumbBlob.size;
          }
        } catch {
          // thumbnail failure is non-fatal
        }
      }
      setProgress(95);

      // Persist metadata
      const meta: OfflineSheetMeta = {
        id: sheet.id,
        title: sheet.title,
        composer: sheet.composer,
        thumbnailUrl: sheet.thumbnailUrl,
        pdfUrl: sheet.pdfUrl,
        savedAt: new Date().toISOString(),
        sizeBytes,
      };
      const updated = [meta, ...readMeta().filter(m => m.id !== sheet.id)];
      writeMeta(updated);
      setOfflineMeta(updated);
      setProgress(100);
    } finally {
      setSaving(null);
      setProgress(0);
    }
  }, [saving]);

  /** Remove a sheet from the offline cache and metadata. */
  const removeFromOffline = useCallback(async (sheet: MusicSheet): Promise<void> => {
    if (!isSupported()) return;
    setRemoving(sheet.id);
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all([
        cache.delete(new Request(sheet.pdfUrl)),
        sheet.thumbnailUrl ? cache.delete(new Request(sheet.thumbnailUrl)) : Promise.resolve(),
      ]);
      const updated = readMeta().filter(m => m.id !== sheet.id);
      writeMeta(updated);
      setOfflineMeta(updated);
    } finally {
      setRemoving(null);
    }
  }, []);

  /** Total bytes stored across all cached PDFs+thumbnails. */
  const totalSizeBytes = offlineMeta.reduce((acc, m) => acc + (m.sizeBytes ?? 0), 0);

  return {
    offlineMeta,
    isAvailableOffline,
    saveForOffline,
    removeFromOffline,
    saving,
    removing,
    progress,
    totalSizeBytes,
    isSupported: isSupported(),
  };
}
