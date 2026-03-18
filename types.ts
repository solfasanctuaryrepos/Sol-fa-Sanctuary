
export type View = 'home' | 'library' | 'dashboard' | 'admin' | 'about';
export type AdminTab = 'users' | 'content';

export interface MusicSheet {
  id: string;
  title: string;
  composer: string;
  type: string;
  uploadedAt: string;
  fileSize: string;
  views: number;
  downloads: number;
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