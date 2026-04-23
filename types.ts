
export type View = 'home' | 'library' | 'dashboard' | 'admin' | 'about' | 'profile' | 'collections' | 'help';
export type AdminTab = 'users' | 'content';

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

export interface User {
  id: string;
  displayName: string;
  email: string;
  role: 'admin' | 'user';
  status: 'Active' | 'Inactive';
  createdAt: string;
}