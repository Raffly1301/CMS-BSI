
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ItemMaster, User } from '../types';
import { saveTableCache, getTableCache } from '../lib/cacheHelper';
import {
  Plus,
  Trash2,
  Search,
  Package,
  AlertCircle,
  Loader2,
  Database,
  Pencil,
  X
} from 'lucide-react';
import { formatNumber } from '@/utils';

declare const XLSX: any;

interface ItemDatabaseProps {
  user: User | null;
}

const ItemDatabase: React.FC<ItemDatabaseProps> = ({ user }) => {
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [isAdding, setIsAdding] = useState(false);
  const [isDownloadingDb, setIsDownloadingDb] = useState(false);

  // Form state
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingItem, setEditingItem] = useState<ItemMaster | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const fetchItems = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, code, description, category, is_active')
        .order('code', { ascending: true });

      if (error) throw error;
      if (data) {
        setItems(data);
        saveTableCache('items', data);
      }
    } catch (err) {
      console.error('Error fetching items, loading from cache:', err);
      const cached = getTableCache('items');
      if (cached) setItems(cached);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newName) {
      setError('Kode dan Nama Item wajib diisi');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error } = await supabase
        .from('items')
        .insert({
          code: newCode.toUpperCase(),
          description: newName.toUpperCase(),
          category: newCategory.toUpperCase() || 'GENERAL',
          is_active: true
        });

      if (error) throw error;

      setNewCode('');
      setNewName('');
      setNewCategory('');
      setIsAdding(false);
      fetchItems();
    } catch (err: any) {
      console.error('Error adding item:', err);
      setError(err.message || 'Gagal menambahkan item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus item ini?')) return;

    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchItems();
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Gagal menghapus item. Item mungkin sedang digunakan dalam transaksi.');
    }
  };

  const handleToggleActive = async (id: string, currentIsActive: boolean) => {
    // Optimistic UI Update first
    setItems(prevItems =>
      prevItems.map(item => item.id === id ? { ...item, is_active: !currentIsActive } : item)
    );

    try {
      const { error } = await supabase
        .from('items')
        .update({ is_active: !currentIsActive })
        .eq('id', id);

      if (error) throw error;
      // Fetch fresh data in the background silently
      fetchItems(true);
    } catch (err: any) {
      console.error('Error toggling item active status:', err);
      // Revert local state update on failure
      setItems(prevItems =>
        prevItems.map(item => item.id === id ? { ...item, is_active: currentIsActive } : item)
      );
      alert(err.message || 'Gagal mengubah status aktif/tidak aktif item.');
    }
  };

  const handleStartEdit = (item: ItemMaster) => {
    setEditingItem(item);
    setEditCode(item.code);
    setEditName(item.description);
    setEditCategory(item.category || '');
    setError('');
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editCode || !editName) {
      setError('Kode dan Nama Item wajib diisi');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error } = await supabase
        .from('items')
        .update({
          code: editCode.toUpperCase(),
          description: editName.toUpperCase(),
          category: editCategory.toUpperCase() || 'GENERAL'
        })
        .eq('id', editingItem.id);

      if (error) throw error;

      setEditingItem(null);
      setEditCode('');
      setEditName('');
      setEditCategory('');
      fetchItems();
    } catch (err: any) {
      console.error('Error updating item:', err);
      setError(err.message || 'Gagal mengubah item');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const itemCategory = (item.category || 'GENERAL').toUpperCase();
    const matchesCategory = selectedCategory === 'ALL' || itemCategory === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const canManage = user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'SUPERADMIN';

  const downloadFullDatabase = async () => {
    if (user?.role?.toUpperCase() !== 'SUPERADMIN') {
      alert('Akses Ditolak: Fitur download database hanya untuk Superadmin.');
      return;
    }

    setIsDownloadingDb(true);
    try {
      const tablesToExport = ['chiller_stock', 'transactions', 'items', 'users', 'virtual_inventory'];
      const wb = XLSX.utils.book_new();

      for (const tableName of tablesToExport) {
        let allRows: any[] = [];
        let from = 0;
        const PAGE_SIZE = 1000;
        let keepGoing = true;

        while (keepGoing) {
          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(from, from + PAGE_SIZE - 1);

          if (error) {
            console.error(`Gagal mengambil data dari ${tableName}:`, error);
            break;
          }

          if (data && data.length > 0) {
            allRows = allRows.concat(data);
            from += PAGE_SIZE;
            if (data.length < PAGE_SIZE) keepGoing = false;
          } else {
            keepGoing = false;
          }
        }

        const cleanedRows = allRows.map(row => {
          if (tableName === 'users' && row.password) {
            const { password, ...rest } = row;
            return { ...rest, password: '***' };
          }
          return row;
        });

        const ws = XLSX.utils.json_to_sheet(cleanedRows.length > 0 ? cleanedRows : [{}]);
        XLSX.utils.book_append_sheet(wb, ws, tableName);
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `BSI_CMS_Database_Full_${timestamp}.xlsx`);
    } catch (err: any) {
      console.error('Error exporting database:', err);
      alert('Gagal mendownload database: ' + (err.message || 'Error tidak diketahui'));
    } finally {
      setIsDownloadingDb(false);
    }
  };

  if (!canManage) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-gray-400">
        <AlertCircle size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-black uppercase tracking-widest">Akses Ditolak</p>
        <p className="text-xs font-bold mt-2">Hanya Admin yang dapat mengakses database item.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase flex items-center gap-3">
            <Database className="text-red-600" size={24} />
            Database Master Item
          </h2>
          <p className="text-sm text-gray-500 font-medium">Kelola daftar produk dan kode item sistem</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user?.role?.toUpperCase() === 'SUPERADMIN' && (
            <button
              type="button"
              onClick={downloadFullDatabase}
              disabled={isDownloadingDb}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-200 cursor-pointer disabled:opacity-50"
              title="Download Semua Database Per Kolom (Superadmin Only)"
            >
              {isDownloadingDb ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Database size={16} />
              )}
              <span>{isDownloadingDb ? 'DOWNLOADING...' : 'DOWNLOAD ALL DB'}</span>
            </button>
          )}
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-red-200 cursor-pointer"
          >
            {isAdding ? <Plus className="rotate-45" size={16} /> : <Plus size={16} />}
            {isAdding ? 'BATAL' : 'TAMBAH ITEM BARU'}
          </button>
        </div>
      </header>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border-2 border-red-100 shadow-xl animate-in slide-in-from-top-4 duration-300">
          <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kode Item</label>
              <input
                type="text"
                placeholder="Contoh: BL-01"
                className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama / Deskripsi Produk</label>
              <input
                type="text"
                placeholder="Contoh: BONELESS DADA"
                className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kategori (Opsional)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Contoh: BONELESS"
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 rounded-xl text-xs font-black disabled:opacity-50 flex items-center justify-center min-w-[100px]"
                >
                  {submitting ? <Loader2 className="animate-spin" size={16} /> : 'SIMPAN'}
                </button>
              </div>
            </div>
          </form>
          {error && <p className="text-red-600 text-[10px] font-bold mt-3 uppercase flex items-center gap-1"><AlertCircle size={12} /> {error}</p>}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Cari berdasarkan kode atau nama produk..."
            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-gray-50 px-4 py-2.5 rounded-xl border border-transparent focus-within:border-red-600 focus-within:bg-white transition-colors">
          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Filter Kategori:</label>
          <select
            className="bg-transparent border-none outline-none font-bold text-xs uppercase cursor-pointer text-gray-700 min-w-[150px]"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">SEMUA KATEGORI</option>
            {Array.from(new Set(items.map(item => (item.category || 'GENERAL').toUpperCase()))).sort().map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kode Item</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nama Produk</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kategori</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin mx-auto text-red-600 mb-2" size={24} />
                    <span className="text-[10px] font-black text-gray-400 uppercase">Memuat Data...</span>
                  </td>
                </tr>
              ) : filteredItems.length > 0 ? (
                filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="text-xs font-black text-red-600 uppercase tracking-tight">{item.code}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-gray-800 uppercase">{item.description}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black px-2 py-1 bg-gray-100 text-gray-500 rounded-lg uppercase">
                        {item.category || 'GENERAL'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(item.id, item.is_active !== false)}
                        type="button"
                        className="flex items-center gap-2 cursor-pointer outline-none select-none"
                        title="Klik untuk mengubah status aktif"
                      >
                        <div className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${item.is_active !== false ? 'bg-green-600' : 'bg-gray-200'}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${item.is_active !== false ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${item.is_active !== false ? 'text-green-600' : 'text-gray-400'}`}>
                          {item.is_active !== false ? 'AKTIF' : 'NON-AKTIF'}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        <button
                          onClick={() => handleStartEdit(item)}
                          className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer outline-none"
                          title="Edit Item"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer outline-none"
                          title="Hapus Item"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Package size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data item tidak ditemukan</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase">Total: {filteredItems.length} Produk Terdaftar</p>
      </div>

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-gray-100 shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setEditingItem(null)}
              className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer outline-none"
            >
              <X size={18} />
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                <Pencil className="text-red-600 animate-pulse" size={18} />
                Edit Master Item
              </h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">Ubah detail produk {editingItem.code}</p>
            </div>

            <form onSubmit={handleUpdateItem} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kode Item</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama / Deskripsi Produk</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kategori (Opsional)</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-red-600 text-[10px] font-bold uppercase flex items-center gap-1">
                  <AlertCircle size={12} /> {error}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer"
                >
                  BATAL
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center shadow-lg shadow-red-100 cursor-pointer"
                >
                  {submitting ? <Loader2 className="animate-spin" size={16} /> : 'SIMPAN PERUBAHAN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemDatabase;
