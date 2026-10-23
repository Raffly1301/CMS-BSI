
import React, { useState, useEffect, useMemo } from 'react';
import { VirtualInventory } from '../types';
import { supabase } from '../lib/supabase';
import { saveTableCache, getTableCache } from '../lib/cacheHelper';
import {
  Package,
  Search,
  ArrowRightLeft,
  History,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Filter,
  Clock
} from 'lucide-react';
import { formatNumber } from '@/utils';

type SortField = 'item_name' | 'item_code' | 'quantity_pcs' | 'quantity_kgs' | 'updated_at' | 'destination';
type SortOrder = 'asc' | 'desc';

const VirtualInventoryList: React.FC = () => {
  const [inventory, setInventory] = useState<VirtualInventory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDestination, setFilterDestination] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  useEffect(() => {
    fetchVirtualInventory();
  }, []);

  const fetchVirtualInventory = async () => {
    setIsLoading(true);
    try {
      let { data, error } = await supabase
        .from('virtual_inventory')
        .select(`
          *,
          items:items_id (
            code,
            description
          )
        `)
        .order('updated_at', { ascending: false });

      if (error) {
        console.warn("Relational fetch for virtual_inventory failed, falling back to separate queries:", error);
        const { data: rawVirtual, error: vErr } = await supabase
          .from('virtual_inventory')
          .select('*');
        if (vErr) throw vErr;

        const { data: rawItems } = await supabase.from('items').select('id, code, description');
        const itemMap: Record<string, { code: string; description: string }> = {};
        if (rawItems) {
          rawItems.forEach((i: any) => { itemMap[i.id] = { code: i.code, description: i.description }; });
        }

        data = (rawVirtual || []).map((v: any) => ({
          ...v,
          items: itemMap[v.items_id] ? { code: itemMap[v.items_id].code, description: itemMap[v.items_id].description } : null
        }));
      }

      if (data) {
        const mappedData = data.map((item: any) => ({
          ...item,
          item_name: item.items?.description || 'N/A',
          item_code: item.items?.code || 'N/A'
        }));
        setInventory(mappedData as VirtualInventory[]);
        saveTableCache('virtual_inventory', mappedData);
      }
    } catch (err) {
      console.error("Error fetching virtual inventory, reading from local cache:", err);
      const cached = getTableCache('virtual_inventory');
      if (cached) setInventory(cached as VirtualInventory[]);
    } finally {
      setIsLoading(false);
    }
  };

  const destinations = useMemo(() => {
    return ['ALL', ...Array.from(new Set(inventory.map(i => i.destination)))].sort();
  }, [inventory]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedInventory = useMemo(() => {
    let result = inventory.filter(item => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        item.destination.toLowerCase().includes(searchLower) ||
        (item.item_name || '').toLowerCase().includes(searchLower) ||
        (item.item_code || '').toLowerCase().includes(searchLower);

      const matchesDest = filterDestination === 'ALL' || item.destination === filterDestination;
      return matchesSearch && matchesDest;
    });

    result.sort((a, b) => {
      let valA: any = a[sortField] || '';
      let valB: any = b[sortField] || '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [inventory, searchQuery, filterDestination, sortField, sortOrder]);

  const summaryByLocation = useMemo(() => {
    return inventory.reduce((acc, item) => {
      if (!acc[item.destination]) {
        acc[item.destination] = { pcs: 0, kgs: 0, items: 0 };
      }
      acc[item.destination].pcs += item.quantity_pcs;
      acc[item.destination].kgs += item.quantity_kgs;
      acc[item.destination].items += 1;
      return acc;
    }, {} as Record<string, { pcs: number, kgs: number, items: number }>);
  }, [inventory]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase flex items-center gap-3">
              <Layers className="text-red-600" />
              Inventory
            </h2>
            <button
              onClick={fetchVirtualInventory}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-red-600"
              title="Refresh Data"
            >
              <History size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-gray-500 text-sm font-medium tracking-tight">Stok barang di luar Chiller (Marinasi, Parting, dll)</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Cari item atau lokasi..."
              className="pl-10 pr-4 py-2 bg-white border-2 border-gray-100 rounded-xl focus:border-red-600 outline-none font-bold text-sm transition-all w-full sm:w-72"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <select
              className="pl-9 pr-4 py-2 bg-white border-2 border-gray-100 rounded-xl font-bold text-sm outline-none focus:border-red-600 cursor-pointer appearance-none w-full"
              value={filterDestination}
              onChange={(e) => setFilterDestination(e.target.value)}
            >
              {destinations.map(dest => (
                <option key={dest} value={dest}>{dest === 'ALL' ? 'Semua Lokasi' : dest}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Summary Cards */}
        <div className="bg-white p-4 rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100 flex items-center gap-4 group hover:scale-[1.01] transition-all duration-300">
          <div className="bg-blue-50 w-12 h-12 rounded-xl flex items-center justify-center text-blue-600 group-hover:rotate-6 transition-transform">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Item Terdaftar</p>
            <p className="text-xl font-black text-gray-900 leading-none">{filteredAndSortedInventory.length}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100 flex items-center gap-4 group hover:scale-[1.01] transition-all duration-300">
          <div className="bg-red-50 w-12 h-12 rounded-xl flex items-center justify-center text-red-600 group-hover:rotate-6 transition-transform">
            <Package size={24} />
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Pcs</p>
            <p className="text-xl font-black text-gray-900 leading-none">
              {filteredAndSortedInventory.reduce((sum, item) => sum + item.quantity_pcs, 0).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100 flex items-center gap-4 group hover:scale-[1.01] transition-all duration-300">
          <div className="bg-green-50 w-12 h-12 rounded-xl flex items-center justify-center text-green-600 group-hover:rotate-6 transition-transform">
            <TrendingDown size={24} />
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Total Berat (Kg)</p>
            <p className="text-xl font-black text-gray-900 leading-none">
              {filteredAndSortedInventory.reduce((sum, item) => sum + item.quantity_kgs, 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Location Summary Section */}
      <div className="space-y-4 pt-2">
        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
          <div className="bg-red-600 p-1 rounded-md text-white">
            <ArrowRightLeft size={14} />
          </div>
          Stok Per Bagian
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(Object.entries(summaryByLocation) as [string, { pcs: number, kgs: number, items: number }][]).map(([loc, stats]) => (
            <div key={loc} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 hover:shadow-red-100/30 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-50/20 rounded-full -mr-12 -mt-12 group-hover:scale-125 transition-transform duration-500" />

              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 group-hover:bg-red-600 group-hover:text-white transition-all duration-200 shadow-md shadow-red-50">
                    <Layers size={20} />
                  </div>
                  <span className="text-lg font-black text-gray-900 uppercase tracking-tight">{loc}</span>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Update</p>
                  <p className="text-[9px] font-black text-red-600 uppercase bg-red-50 px-1.5 py-0.5 rounded-md">
                    {inventory.find(i => i.destination === loc)?.updated_at
                      ? new Date(inventory.find(i => i.destination === loc)!.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
                      : '-'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 relative z-10">
                <div className="bg-gray-50/60 p-3 rounded-2xl border border-gray-100 group-hover:bg-white group-hover:border-red-50 transition-all">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Quantity</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-xl font-black text-gray-900">{stats.pcs.toLocaleString()}</p>
                    <p className="text-[8px] font-black text-gray-400 uppercase">Pcs</p>
                  </div>
                </div>
                <div className="bg-gray-50/60 p-3 rounded-2xl border border-gray-100 group-hover:bg-white group-hover:border-red-50 transition-all">
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Weight</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-xl font-black text-gray-900">{stats.kgs.toFixed(2)}</p>
                    <p className="text-[8px] font-black text-gray-400 uppercase">Kg</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {Object.keys(summaryByLocation).length === 0 && !isLoading && (
            <div className="col-span-full py-20 text-center bg-gray-50 rounded-[3rem] border-4 border-dashed border-gray-100">
              <div className="flex flex-col items-center gap-4 opacity-30">
                <Package size={64} className="text-gray-400" />
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Belum ada stok di bagian manapun</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Inventory Table */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl shadow-gray-200/50 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
            <div className="bg-red-600 p-1 rounded-md text-white">
              <Package size={14} />
            </div>
            Detail Inventori
          </h3>
          <span className="text-[10px] font-black text-gray-400 uppercase bg-white px-3 py-1 rounded-full border border-gray-100">
            {filteredAndSortedInventory.length} Baris
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4">
                  <button
                    onClick={() => handleSort('item_code')}
                    className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                  >
                    Kode Item
                    <ArrowUpDown size={12} className={sortField === 'item_code' ? 'text-red-600' : ''} />
                  </button>
                </th>
                <th className="px-6 py-4">
                  <button
                    onClick={() => handleSort('item_name')}
                    className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                  >
                    Nama Item
                    <ArrowUpDown size={12} className={sortField === 'item_name' ? 'text-red-600' : ''} />
                  </button>
                </th>
                <th className="px-6 py-4">
                  <button
                    onClick={() => handleSort('destination')}
                    className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                  >
                    Lokasi
                    <ArrowUpDown size={12} className={sortField === 'destination' ? 'text-red-600' : ''} />
                  </button>
                </th>
                <th className="px-6 py-4">
                  <button
                    onClick={() => handleSort('quantity_pcs')}
                    className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                  >
                    Qty (Pcs)
                    <ArrowUpDown size={12} className={sortField === 'quantity_pcs' ? 'text-red-600' : ''} />
                  </button>
                </th>
                <th className="px-6 py-4">
                  <button
                    onClick={() => handleSort('quantity_kgs')}
                    className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                  >
                    Berat (Kg)
                    <ArrowUpDown size={12} className={sortField === 'quantity_kgs' ? 'text-red-600' : ''} />
                  </button>
                </th>
                <th className="px-6 py-4">
                  <button
                    onClick={() => handleSort('updated_at')}
                    className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-red-600 transition-colors"
                  >
                    Terakhir Update
                    <ArrowUpDown size={12} className={sortField === 'updated_at' ? 'text-red-600' : ''} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredAndSortedInventory.map((item) => (
                <tr key={item.id} className="hover:bg-red-50/30 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-xs font-black text-gray-900 bg-gray-100 px-2 py-1 rounded-md group-hover:bg-white transition-colors">
                      {item.item_code}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs font-bold text-gray-700">{item.item_name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black text-red-600 uppercase bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                      {item.destination}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-black text-gray-900">{formatNumber(item.quantity_pcs, 0)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-black text-gray-900">{formatNumber(item.quantity_kgs, 2)}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Clock size={12} />
                      <span className="text-[10px] font-bold">
                        {new Date(item.updated_at).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAndSortedInventory.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <Search size={48} />
                      <p className="text-sm font-black uppercase tracking-widest">Tidak ada item yang ditemukan</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VirtualInventoryList;
