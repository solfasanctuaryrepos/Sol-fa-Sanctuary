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
  const [refreshKey, setRefreshKey] = useState(0);
  const entitlements = useEntitlements(userId, refreshKey);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

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
