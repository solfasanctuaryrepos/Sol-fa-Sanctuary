import React, { useRef, useState, useEffect } from 'react';
import { X, Upload, FileText, Check, Loader2, AlertCircle, Mail, RefreshCw } from 'lucide-react';
import { auth, db, storage, supabase } from '../supabase';
import { MusicSheet } from '../types';
import Modal from './Modal';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  userEmail: string;
  isVerified: boolean;
  /** Called with the newly inserted sheet so the UI updates instantly. */
  onSheetUploaded?: (sheet: MusicSheet) => void;
}

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, darkMode, userEmail, isVerified, onSheetUploaded }) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [type, setType] = useState('classical');
  const [isPublic, setIsPublic] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setFileError('Please select a valid PDF file.');
      setFile(null);
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setFileError('File is too large. Maximum allowed size is 10 MB.');
      setFile(null);
      return;
    }
    setFileError(null);
    setFile(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) validateAndSetFile(droppedFile);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleResendVerification = async () => {
    setResending(true);
    try {
      const { error } = await auth.resend({ type: 'signup', email: userEmail });
      if (error) throw error;
      setResendStatus("Verification email sent! Please check your inbox.");
    } catch (err: any) {
      setResendStatus("Error sending email: " + err.message);
    } finally {
      setResending(false);
    }
  };

  const generateThumbnail = async (pdfFile: File): Promise<Blob> => {
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfjsLib = (window as any)['pdfjsLib'];
      if (!pdfjsLib) throw new Error('PDF.js library not found. Please refresh and try again.');
      
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
      
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      
      // Optimization: Scale down to 0.7 for faster thumbnail generation and smaller upload size
      const scale = 0.7;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) throw new Error('Could not create canvas context');
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({ canvasContext: context, viewport }).promise;
      
      // Yield to event loop to keep UI responsive
      await new Promise(r => setTimeout(r, 0));
      
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Thumbnail generation failed'));
        }, 'image/jpeg', 0.75); // Lower quality for thumbnails to save bandwidth
      });
    } catch (err) {
      console.error('Thumbnail generation error:', err);
      throw err;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !composer) return;

    setIsUploading(true);
    setUploadStatus('Initializing...');
    
    try {
      setUploadStatus('Generating thumbnail...');
      const thumbnailBlob = await generateThumbnail(file);

      const timestamp = Date.now();
      
      setUploadStatus('Uploading music sheet...');
      const fileName = `${timestamp}_${file.name}`;
      const { data: pdfData, error: pdfError } = await storage
        .from('sheets')
        .upload(`${userEmail}/${fileName}`, file, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (pdfError) throw pdfError;
      
      const { data: { publicUrl: pdfUrl } } = storage
        .from('sheets')
        .getPublicUrl(`${userEmail}/${fileName}`);

      setUploadStatus('Saving preview image...');
      const thumbName = `${timestamp}_thumb.jpg`;
      const { data: thumbData, error: thumbError } = await storage
        .from('thumbnails')
        .upload(`${userEmail}/${thumbName}`, thumbnailBlob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (thumbError) throw thumbError;

      const { data: { publicUrl: thumbnailUrl } } = storage
        .from('thumbnails')
        .getPublicUrl(`${userEmail}/${thumbName}`);

      setUploadStatus('Finalizing...');
      const { data: insertedRow, error: dbError } = await db
        .from('sheets')
        .insert({
          title,
          composer,
          type: type.charAt(0).toUpperCase() + type.slice(1),
          file_size: formatFileSize(file.size),
          is_public: isPublic,
          thumbnail_url: thumbnailUrl,
          pdf_url: pdfUrl,
          uploaded_by: userEmail,
          user_id: (await auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Optimistic UI: push the new sheet into the parent's list immediately
      // so it appears without waiting for the realtime subscription to re-fetch.
      if (insertedRow && onSheetUploaded) {
        const mapped: MusicSheet = {
          id: insertedRow.id,
          title: insertedRow.title,
          composer: insertedRow.composer,
          type: insertedRow.type,
          uploadedAt: insertedRow.uploaded_at
            ? new Date(insertedRow.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          fileSize: insertedRow.file_size,
          views: insertedRow.views ?? 0,
          downloads: insertedRow.downloads ?? 0,
          isPublic: insertedRow.is_public,
          isAdminRestricted: insertedRow.is_admin_restricted ?? false,
          thumbnailUrl: insertedRow.thumbnail_url,
          pdfUrl: insertedRow.pdf_url,
          uploadedBy: insertedRow.uploaded_by,
          commentsCount: 0,
          likesCount: 0,
        };
        onSheetUploaded(mapped);
      }

      onClose();
      setFile(null);
      setTitle('');
      setComposer('');
      setType('classical');
      setUploadStatus('');
    } catch (error: any) {
      console.error("Upload error:", error);
      alert("Failed to upload music sheet. Please try again.");
    } finally {
      setIsUploading(false);
      setUploadStatus('');
    }
  };

  const bgClass = darkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200 shadow-2xl';
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const inputBg = darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

  return (
    <Modal isOpen={isOpen} onClose={onClose} darkMode={darkMode} maxWidth="xl" loading={isUploading}>
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
              <Upload className="text-green-500" size={20} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${textPrimary}`}>Upload a New Music Sheet</h2>
              <p className={`text-sm ${textSecondary}`}>Fill out the details below to add a new piece to the sanctuary.</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isUploading} aria-label="Close upload modal" className="text-slate-400 hover:text-green-500 transition-colors disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        {!isVerified ? (
          <div className="p-12 text-center space-y-6">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mx-auto ${darkMode ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
              <Mail className="text-amber-500" size={40} />
            </div>
            <div className="space-y-2">
              <h3 className={`text-2xl font-serif font-bold ${textPrimary}`}>Verification Required</h3>
              <p className={`max-w-xs mx-auto ${textSecondary}`}>
                Please verify your email address (<b>{userEmail}</b>) before uploading music sheets to the sanctuary.
              </p>
            </div>
            
            {resendStatus && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm">
                {resendStatus}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleResendVerification}
                disabled={resending}
                className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
              >
                {resending ? <RefreshCw className="animate-spin" size={20} /> : <Mail size={20} />}
                Resend Verification Email
              </button>
              <button 
                onClick={onClose}
                className={`w-full py-3.5 font-bold rounded-xl border transition-all ${darkMode ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-600 hover:text-slate-900'}`}
              >
                Maybe Later
              </button>
            </div>
          </div>
        ) : (
          <form className="p-6 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Title</label>
              <input 
                type="text" 
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Behold Our God"
                className={`w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Composed by</label>
              <input 
                type="text" 
                required
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="e.g. Peter Kwo"
                className={`w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Music Type</label>
              <select 
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={`w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all appearance-none cursor-pointer ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
              >
                <option value="classical">Classical</option>
                <option value="liturgical">Liturgical</option>
                <option value="choral">Choral</option>
                <option value="contemporary">Contemporary</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sheet Music File</label>
              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer group ${isDragging ? 'border-green-500 bg-green-500/10' : file ? 'border-green-500/50 bg-green-500/5' : darkMode ? 'border-slate-800 hover:border-green-500/50' : 'border-slate-200 hover:border-green-500/50'}`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${darkMode ? 'bg-slate-900 group-hover:bg-slate-800' : 'bg-slate-50 group-hover:bg-slate-100'}`}>
                  {file ? <Check className="text-green-500" size={24} /> : <FileText className="text-slate-400" size={24} />}
                </div>
                <p className={`text-sm ${textSecondary}`}>
                  <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    {file ? file.name : 'Click to upload'}
                  </span> {file ? '' : 'or drag and drop'}
                </p>
                <p className="text-xs text-slate-500">
                  {file ? `${formatFileSize(file.size)} • Ready` : 'Upload a PDF file. Max size 10MB.'}
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf"
                  className="hidden"
                />
              </div>
              {fileError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{fileError}</span>
                </div>
              )}
            </div>

            <div className={`p-4 rounded-xl border flex items-center justify-between ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200 shadow-inner'}`}>
              <div>
                <p className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>Make Public</p>
                <p className="text-xs text-slate-500">Allow anyone to view and download this sheet music.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>

            <button 
              type="submit"
              disabled={isUploading || !file}
              className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95 shadow-green-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUploading ? (
                <>
                  <Loader2 className="animate-spin" size={20} /> 
                  {uploadStatus || 'Uploading...'}
                </>
              ) : 'Upload'}
            </button>
          </form>
        )}
    </Modal>
  );
};

export default UploadModal;