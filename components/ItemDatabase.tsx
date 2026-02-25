
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ItemMaster, User } from '../types';
import { 
  Plus, 
  Trash2, 
  Search, 
  Package, 
  AlertCircle,
  Loader2,
  Database
} from 'lucide-react';
import { formatNumber } from '@/utils';

interface ItemDatabaseProps {
  user: User | null;
}

const ItemDatabase: React.FC<ItemDatabaseProps> = ({ user }) => {
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('code', { ascending: true });
      
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching items:', err);
    } finally {
      setLoading(false);
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
          category: newCategory.toUpperCase() || 'GENERAL'
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

  const filteredItems = items.filter(item => 
    item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canManage = user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'SUPERADMIN';

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
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-red-200"
        >
          {isAdding ? <Plus className="rotate-45" size={16} /> : <Plus size={16} />}
          {isAdding ? 'BATAL' : 'TAMBAH ITEM BARU'}
        </button>
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

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Cari berdasarkan kode atau nama produk..."
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
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
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Hapus Item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
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
    </div>
  );
};

export default ItemDatabase;
