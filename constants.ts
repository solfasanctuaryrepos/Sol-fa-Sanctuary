import { MusicSheet, User } from './types';

export const MOCK_SHEETS: MusicSheet[] = [];

export const MOCK_USERS: User[] = [];

// ── Founding Supporters ──────────────────────────────────────────────────────
// Update this list as supporters confirm contributions. Tier determines
// styling on the wall. Order = order of commitment (first to confirm first).

export type FoundingSupporterTier = 'supporter' | 'revshare' | 'ensemble' | 'patron';

export interface FoundingSupporter {
  name: string;
  tier: FoundingSupporterTier;
  /** Optional — choir/group name to display alongside */
  group?: string;
  /** Optional — short message from the supporter */
  message?: string;
}

export const FOUNDING_SUPPORTERS: FoundingSupporter[] = [
  // Example placeholders — replace with real names as they confirm:
  // { name: 'Jane Doe', tier: 'supporter' },
  // { name: 'John Smith', tier: 'revshare', group: 'Voices of Hope Choir' },
];

/** Total available Founding Supporter spots in this round. */
export const FOUNDING_SUPPORTER_CAP = 12;
