
export type View = 'home' | 'library' | 'dashboard' | 'admin' | 'about' | 'profile' | 'collections' | 'help' | 'pricing' | 'founding-member' | 'billing-admin' | 'ensemble';
export type AdminTab = 'users' | 'content' | 'requests';
export type DashTab = 'mine' | 'favourites' | 'requests';

export interface SheetRequest {
  id: string;
  title: string;
  composer: string | null;
  notes: string | null;
  requested_by: string | null;
  requester_name: string | null;
  requester_email: string | null;
  status: 'open' | 'in_progress' | 'fulfilled' | 'closed';
  fulfilled_sheet_id: string | null;
  votes_count: number;
  created_at: string;
  updated_at: string;
  /** client-side: whether current user has voted */
  voted_by_me?: boolean;
  /** client-side: comment count */
  comments_count?: number;
}

export interface RequestComment {
  id: string;
  request_id: string;
  user_id: string;
  display_name: string;
  body: string;
  sheet_id: string | null;
  created_at: string;
  updated_at: string;
  /** linked sheet info if sheet_id is set */
  linked_sheet?: { id: string; title: string; composer: string } | null;
}

export interface RequestVote {
  id: string;
  request_id: string;
  user_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  sheetId: string;
  userId: string;
  userEmail: string;
  displayName: string | null;
  body: string;
  createdAt: string;
  parentId: string | null;
  likesCount: number;
  likedByMe: boolean;
  replies?: Comment[];
}

export interface Collection {
  id: string;
  userId: string;
  userEmail: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  sheetCount?: number;
}

export interface MusicSheet {
  id: string;
  title: string;
  composer: string;
  type: string;
  uploadedAt: string;
  fileSize: string;
  views: number;
  downloads: number;
  commentsCount: number;
  likesCount: number;
  isPublic: boolean;
  isAdminRestricted: boolean;
  thumbnailUrl: string;
  pdfUrl: string;
  uploadedBy: string;
}

// ── Ensemble workspace types ──────────────────────────────────────────────────

export interface Organisation {
  id: string;
  name: string;
  owner_id: string;
  plan: 'ensemble';
  plan_expires_at: string | null;
  max_seats: number;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'active' | 'removed';
  invited_by: string | null;
  invited_at: string;
  joined_at: string | null;
  /** Joined from profiles */
  profiles?: { display_name: string | null } | null;
}

export interface OrgCollection {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  /** Sheet count — populated when fetched with org_collection_sheets(count) */
  sheetCount?: number;
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user';
  status: 'Active' | 'Inactive';
  createdAt: string;
}