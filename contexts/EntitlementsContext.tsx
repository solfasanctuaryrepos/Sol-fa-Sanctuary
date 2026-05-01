/**
 * EntitlementsContext
 *
 * Wraps the app so any component can access the current user's entitlements
 * without prop-drilling. The context also exposes a `refresh()` function
 * that re-fetches entitlements — call it after a successful payment.
 */

import React, { createContext, useContext, useCallback, useState } from 'react';
import { useEntitlements, type Entitlements } from '../hooks/useEntitlements';

interface EntitlementsContextValue extends Entitlements {
  /** Re-fetch entitlements from DB — call after plan upgrade */
  refresh: () => void;
}

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

export const EntitlementsProvider: React.FC<{
  userId: string | null;
  children: React.ReactNode;
}> = ({ userId, children }) => {
  // A counter bump forces useEntitlements to re-fetch by changing the userId dep key
  const [epoch, setEpoch] = useState(0);

  // We pass a compound key so changing epoch triggers a re-fetch
  const effectiveId = userId ? `${userId}:${epoch}` : null;

  // Strip the epoch suffix before passing to Supabase query
  const rawId = effectiveId ? effectiveId.split(':')[0] : null;
  const entitlements = useEntitlements(rawId);

  const refresh = useCallback(() => setEpoch(e => e + 1), []);

  return (
    <EntitlementsContext.Provider value={{ ...entitlements, refresh }}>
      {children}
    </EntitlementsContext.Provider>
  );
};

export function useEntitlementsContext(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error('useEntitlementsContext must be used inside <EntitlementsProvider>');
  return ctx;
}
