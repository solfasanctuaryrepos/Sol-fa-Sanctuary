
import React, { useState, useRef } from 'react';
import { Upload, Music, Eye, Download, Search, List, Grid, MoreVertical, Edit2, Trash2, FileText, ArrowUp, ArrowDown, X, Check, Lock, ShieldAlert, Globe, AlertTriangle } from 'lucide-react';
import { MusicSheet } from '../types';
import { db } from '../supabase';

interface DashboardProps {
  onUploadClick: () => void;
  onPreview: (sheet: MusicSheet) => void;
  darkMode: boolean;
  sheets: MusicSheet[];
  userEmail: string;
}

type SortConfig = { key: keyof MusicSheet; direction: 'asc' | 'desc' } | null;

const Dashboard: React.FC<DashboardProps> = ({ onUploadClick, onPreview, darkMode, sheets, userEmail }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [activeMobileMenuId, setActiveMobileMenuId] = useState<string | null>(null);
  
  const userSheets = sheets.filter(sheet => sheet.uploadedBy === userEmail);
  const [editingSheet, setEditingSheet] = useState<MusicSheet | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleSort = (key: keyof MusicSheet) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const parseSize = (size: string) => {
    if (!size) return 0;
    const [val, unit] = size.split(' ');
    const num = parseFloat(val);
    if (unit === 'GB') return num * 1024 * 1024 * 1024;
    if (unit === 'MB') return num * 1024 * 1024;
    if (unit === 'KB') return num * 1024;
    return num;
  };

  const sortedSheets = [...userSheets].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    
    let valA: any = a[key];
    let valB: any = b[key];

    if (key === 'fileSize') {
      valA = parseSize(valA as string);
      valB = parseSize(valB as string);
    }

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredSheets = sortedSheets.filter(sheet => 
    sheet.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sheet.composer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDownload = (e: React.MouseEvent, sheet: MusicSheet) => {
    e.stopPropagation();
    window.open(sheet.pdfUrl, '_blank');
  };

  const handleDelete = (e: React.MouseEvent, sheet: MusicSheet) => {
    e.nativeEvent.stopImmediatePropagation();
    e.preventDefault();
    e.stopPropagation();
    
    setDeleteConfirmation({
      id: sheet.id,
      title: sheet.title
    });
  };

  const executeDeletion = async () => {
    if (!deleteConfirmation) return;
    
    try {
      const { error } = await db
        .from('sheets')
        .delete()
        .eq('id', deleteConfirmation.id);
        
      if (error) throw error;
      setDeleteConfirmation(null);
    } catch (error: any) {
      console.error("Deletion error:", error);
      alert(`Failed to delete: ${error.message || 'Unknown error'}`);
    }
  };

  const handleEdit = (e: React.MouseEvent, sheet: MusicSheet) => {
    e.stopPropagation();
    setEditingSheet(sheet);
  };

  const toggleVisibility = async (e: React.MouseEvent, sheet: MusicSheet) => {
    e.stopPropagation();
    try {
      const { error } = await db
        .from('sheets')
        .update({ is_public: !sheet.is_public })
        .eq('id', sheet.id);
      if (error) throw error;
    } catch (error) {
      console.error("Visibility update error:", error);
    }
  };

  const handleUpdateSheet = async (updatedSheet: MusicSheet) => {
    try {
      const { id, ...data } = updatedSheet;
      const { error } = await db
        .from('sheets')
        .update({
          title: data.title,
          composer: data.composer,
          type: data.type,
          is_public: data.is_public
        })
        .eq('id', id);
      
      if (error) throw error;
      setEditingSheet(null);
    } catch (error) {
      console.error("Update error:", error);
      alert("Failed to save changes.");
    }
  };

  const SortIcon = ({ colKey }: { colKey: keyof MusicSheet }) => {
    if (sortConfig?.key !== colKey) return null;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="ml-1" /> : <ArrowDown size={14} className="ml-1" />;
  };

  const stats = [
    { label: 'Total Uploads', value: String(userSheets.length), sub: 'music sheets uploaded', icon: Music },
    { label: 'Total Views', value: String(userSheets.reduce((acc, s) => acc + s.views, 0)), sub: 'times your sheets were viewed', icon: Eye },
    { label: 'Total Downloads', value: String(userSheets.reduce((acc, s) => acc + s.downloads, 0)), sub: 'times your sheets were downloaded', icon: Download },
  ];

  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const cardBg = darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-3xl font-serif font-bold ${textPrimary}`}>Dashboard</h1>
          <p className={textSecondary}>Here's an overview of your music sanctuary.</p>
        </div>
        <button 
          onClick={onUploadClick}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-all shadow-lg active:scale-95 shadow-green-500/10"
        >
          <Upload size={18} />
          Upload Music
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className={`p-6 rounded-2xl relative overflow-hidden group border ${cardBg}`}>
            <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
              <stat.icon size={64} />
            </div>
            <p className={`text-sm font-medium mb-4 ${textSecondary}`}>{stat.label}</p>
            <p className={`text-4xl font-bold mb-1 ${textPrimary}`}>{stat.value}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wider">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className={`text-2xl font-serif font-bold ${textPrimary}`}>My Music Sheets</h2>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by title..." 
                className={`border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 w-full sm:w-64 ${darkMode ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-sm'}`}
              />
            </div>
            <div className={`flex border rounded-lg overflow-hidden ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${viewMode === 'list' ? (darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900') : (darkMode ? 'bg-slate-900 text-slate-400 hover:text-slate-100' : 'bg-white text-slate-400 hover:text-slate-900')}`}
              >
                <List size={16} />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${viewMode === 'grid' ? (darkMode ? 'bg-slate-800 text-slate-100' : 'bg-slate-100 text-slate-900') : (darkMode ? 'bg-slate-900 text-slate-400 hover:text-slate-100' : 'bg-white text-slate-400 hover:text-slate-900')}`}
              >
                <Grid size={16} />
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredSheets.length > 0 ? filteredSheets.map((sheet) => (
              <div key={sheet.id} className={`border rounded-2xl overflow-hidden group hover:border-green-500/50 transition-all flex flex-col ${cardBg}`}>
                <div 
                  className="aspect-[3/4] overflow-hidden relative cursor-pointer"
                  onClick={() => onPreview(sheet)}
                >
                  <img src={sheet.thumbnailUrl} alt={sheet.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  
                  {/* Badge moved to top-left to avoid overlap with menu dots on mobile */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1 items-start group-hover:opacity-0 transition-opacity">
                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow-lg ${sheet.isPublic ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
                      {sheet.isPublic ? 'Public' : 'Private'}
                    </div>
                  </div>

                  {/* Mobile Trigger Button: Swapped to top-right to match standard UX patterns */}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMobileMenuId(activeMobileMenuId === sheet.id ? null : sheet.id);
                    }}
                    className="md:hidden absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white backdrop-blur-sm z-10"
                  >
                    <MoreVertical size={16} />
                  </button>

                  <div className={`absolute inset-0 bg-black/60 transition-opacity flex flex-col p-4 ${activeMobileMenuId === sheet.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {/* Action buttons moved to the center of the card to clear corner controls */}
                    <div className="flex-1 flex items-center justify-center gap-4 transform -translate-y-2 group-hover:translate-y-0 transition-transform delay-75">
                      <button 
                        type="button"
                        onClick={(e) => toggleVisibility(e, sheet)}
                        className={`p-3 rounded-full backdrop-blur-md border border-white/20 text-white transition-all hover:scale-110 active:scale-90 ${sheet.isPublic ? 'bg-blue-500/40 hover:bg-blue-500' : 'bg-slate-700/40 hover:bg-slate-700'}`}
                        title={sheet.isPublic ? "Make Private" : "Make Public"}
                      >
                        {sheet.isPublic ? <Lock size={20} /> : <Globe size={20} />}
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => handleEdit(e, sheet)}
                        className="p-3 rounded-full backdrop-blur-md border border-white/20 bg-white/10 text-white hover:bg-green-500 transition-all hover:scale-110 active:scale-90"
                        title="Edit"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => handleDelete(e, sheet)}
                        className="p-3 rounded-full backdrop-blur-md border border-white/20 bg-white/10 text-white hover:bg-red-500 transition-all hover:scale-110 active:scale-90"
                        title="Delete"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>

                    <div className="flex shrink-0">
                      <button 
                        type="button"
                        onClick={(e) => handleDownload(e, sheet)}
                        className="w-full py-2.5 bg-green-500 text-white text-sm font-bold rounded-xl transform translate-y-2 group-hover:translate-y-0 transition-transform shadow-lg active:scale-95 flex items-center justify-center gap-2 hover:bg-green-600"
                      >
                        <Download size={18} />
                        Download
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className={`font-bold truncate mb-1 ${textPrimary}`}>
                    {sheet.title}
                  </h3>
                  <div className={`flex items-center justify-between text-xs ${textSecondary}`}>
                    <span>{sheet.composer}</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><Eye size={12} /> {sheet.views}</span>
                      <span className="flex items-center gap-1"><Download size={12} /> {sheet.downloads}</span>
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-20 text-center text-slate-500 border-2 border-dashed rounded-3xl border-slate-800/50">
                <Music size={48} className="mx-auto mb-4 opacity-20" />
                <p>No music sheets found in your collection.</p>
              </div>
            )}
          </div>
        ) : (
          <div className={`border rounded-2xl overflow-hidden ${cardBg}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[600px] md:min-w-full">
                <thead className={darkMode ? 'bg-slate-950/50' : 'bg-slate-50'}>
                  <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-4 md:px-6 py-4">Sheet</th>
                    <th className="px-4 md:px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('title')}>
                      <div className="flex items-center">Title <SortIcon colKey="title" /></div>
                    </th>
                    <th className="hidden lg:table-cell px-6 py-4">Visibility</th>
                    <th className="hidden md:table-cell px-6 py-4 cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('fileSize')}>
                      <div className="flex items-center">Size <SortIcon colKey="fileSize" /></div>
                    </th>
                    <th className="hidden md:table-cell px-6 py-4 text-center cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('views')}>
                      <div className="flex justify-center items-center">Views <SortIcon colKey="views" /></div>
                    </th>
                    <th className="hidden md:table-cell px-6 py-4 text-center cursor-pointer hover:text-green-500 transition-colors" onClick={() => handleSort('downloads')}>
                      <div className="flex justify-center items-center">Downloads <SortIcon colKey="downloads" /></div>
                    </th>
                    <th className="px-4 md:px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {filteredSheets.map(sheet => (
                    <tr key={sheet.id} className={darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                      <td className="px-4 md:px-6 py-4">
                        <button 
                          type="button"
                          onClick={() => onPreview(sheet)}
                          className="relative overflow-hidden rounded border border-slate-700 active:scale-95 transition-transform group/img"
                        >
                          <img src={sheet.thumbnailUrl} className="w-10 h-10 object-cover" alt="" />
                          <div className="absolute inset-0 bg-green-500/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye size={14} className="text-white" />
                          </div>
                        </button>
                      </td>
                      <td className={`px-4 md:px-6 py-4 text-sm font-medium cursor-pointer hover:text-green-500 transition-colors ${textPrimary}`} onClick={() => onPreview(sheet)}>
                        {sheet.title}
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4">
                        <div className="flex items-center gap-2">
                           <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${sheet.isPublic ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                              {sheet.isPublic ? 'Public' : 'Private'}
                           </span>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500">{sheet.fileSize}</td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.views}</td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-slate-500 text-center">{sheet.downloads}</td>
                      <td className="px-4 md:px-6 py-4 text-right">
                        {/* Added text-white on mobile to dashboard list actions as requested */}
                        <div className="flex items-center justify-end gap-1 max-md:text-white">
                          <button 
                            type="button"
                            onClick={(e) => toggleVisibility(e, sheet)}
                            className={`p-2 transition-colors ${sheet.isPublic ? 'hover:text-amber-500' : 'hover:text-green-500'}`}
                            title={sheet.isPublic ? "Make Private" : "Make Public"}
                          >
                            {sheet.isPublic ? <Lock size={16}/> : <Globe size={16}/>}
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => handleDownload(e, sheet)}
                            className="p-2 hover:text-green-500 transition-colors" 
                            title="Download"
                          >
                            <Download size={16}/>
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => handleEdit(e, sheet)}
                            className="p-2 hover:text-blue-500 transition-colors" 
                            title="Edit"
                          >
                            <Edit2 size={16}/>
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => handleDelete(e, sheet)}
                            className="p-2 hover:text-red-500 transition-colors" 
                            title="Delete"
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {editingSheet && (
        <EditSheetModal 
          sheet={editingSheet} 
          onClose={() => setEditingSheet(null)} 
          onSave={handleUpdateSheet} 
          darkMode={darkMode} 
        />
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className={`w-full max-w-md rounded-3xl overflow-hidden border animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-2xl'}`}>
            <div className="p-8">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="text-red-500" size={32} />
              </div>
              
              <div className="text-center mb-8">
                <h2 className={`text-2xl font-serif font-bold mb-2 ${textPrimary}`}>Confirm Deletion</h2>
                <p className={`${textSecondary}`}>
                  Are you sure you want to permanently delete <span className="font-bold text-red-500">{deleteConfirmation.title}</span>? 
                  This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirmation(null)}
                  className={`flex-1 py-3.5 font-bold rounded-xl border transition-all active:scale-95 ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  Cancel
                </button>
                <button 
                  onClick={executeDeletion}
                  className="flex-1 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-xl shadow-red-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface EditSheetModalProps {
  sheet: MusicSheet;
  onClose: () => void;
  onSave: (sheet: MusicSheet) => void;
  darkMode: boolean;
}

const EditSheetModal: React.FC<EditSheetModalProps> = ({ sheet, onClose, onSave, darkMode }) => {
  const [formData, setFormData] = useState<MusicSheet>({ ...sheet });
  const overlayRef = useRef<HTMLDivElement>(null);

  const bgClass = darkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200 shadow-2xl';
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-600';
  const inputBg = darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div 
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose()}
      className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className={`w-full max-w-xl rounded-2xl overflow-hidden border animate-in zoom-in-95 duration-200 ${bgClass}`}>
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
              <Edit2 className="text-green-500" size={20} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${textPrimary}`}>Edit Music Sheet</h2>
              <p className={`text-sm ${textSecondary}`}>Update the details for this piece in the sanctuary.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-green-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form className="p-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Title</label>
            <input 
              type="text" 
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={`w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
            />
          </div>

          <div className="space-y-2">
            <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Composed by</label>
            <input 
              type="text" 
              required
              value={formData.composer}
              onChange={(e) => setFormData({ ...formData, composer: e.target.value })}
              className={`w-full rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all ${inputBg} ${darkMode ? 'text-white' : 'text-black'}`}
            />
          </div>

          <div className="space-y-2">
            <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Music Type</label>
            <select 
              value={formData.type.toLowerCase()}
              onChange={(e) => setFormData({ ...formData, type: e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1) })}
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
              className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 transition-colors cursor-not-allowed border-green-500/50 bg-green-500/5 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
                <Check className="text-green-500" size={24} />
              </div>
              <p className={`text-sm ${textSecondary}`}>
                <span className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  {formData.title}.pdf
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {formData.fileSize} • File exists on server
              </p>
            </div>
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
                checked={formData.isPublic}
                onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              />
              <div className="w-11 h-6 bg-slate-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>

          <button 
            type="submit"
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95 shadow-green-500/20 flex items-center justify-center gap-2"
          >
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
};

export default Dashboard;
