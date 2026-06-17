
import React, { useState, useEffect, useRef } from 'react';
import { ChillerItem, InflowSource } from '../types';
import { INFLOW_SOURCES } from '../constants';
import {
  Save,
  Calendar,
  ChevronDown,
  Package2,
  Scale,
  Calculator,
  ArrowDownToLine,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  Layers,
  Zap,
  Search
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CalculatorPopup from './CalculatorPopup';

interface InflowFormProps {
  // Fix: Omit itemCode from the items passed to onSubmitBatch to match App.tsx handleInflow signature
  onSubmitBatch: (items: Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status' | 'itemCode'>[]) => void;
}

const InflowForm: React.FC<InflowFormProps> = ({ onSubmitBatch }) => {
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [availableItems, setAvailableItems] = useState<{ id: string, code: string, description: string, is_active?: boolean }[]>([]);
  // Fix: Omit itemCode from draftItems state to match formData structure and onSubmitBatch prop
  const [draftItems, setDraftItems] = useState<Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status' | 'itemCode'>[]>([]);

  // Searchable Dropdown States
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    itemsId: '', // UUID from items table
    itemName: '',
    pcs: 0,
    kgs: 0,
    productionDate: new Date().toISOString().split('T')[0],
    slaughteringDate: new Date().toISOString().split('T')[0],
    source: 'PDS' as InflowSource,
    allocation: 'PDS' as InflowSource,
    isWIP: false
  });

  // Multiple quantity & weight rows in form
  const [qtyRows, setQtyRows] = useState<{ pcs: number; kgs: number }[]>([{ pcs: 0, kgs: 0 }]);
  const [activeCalculator, setActiveCalculator] = useState<{
    rowIndex: number;
    field: 'pcs' | 'kgs';
    value: number;
  } | null>(null);

  const handleQtyRowChange = (index: number, field: 'pcs' | 'kgs', value: number) => {
    setQtyRows(prev => prev.map((row, i) => {
      if (i === index) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  const handleAddQtyRow = () => {
    setQtyRows(prev => [...prev, { pcs: 0, kgs: 0 }]);
  };

  const handleRemoveQtyRow = (index: number) => {
    setQtyRows(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    fetchItems();

    // Click outside listener for dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('code', { ascending: true });

      if (error) {
        console.error("Supabase Error (Table items):", error.message);
      } else if (data) {
        const activeItems = data.filter((item: any) => item.is_active !== false);
        setAvailableItems(activeItems);
      }
    } catch (err) {
      console.error("Connection Error:", err);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = qtyRows.filter(row => row.pcs > 0 && row.kgs > 0);

    if (!formData.itemsId || validRows.length === 0) {
      alert('Mohon pilih produk dan isi kuantitas (Pcs & Kg) dengan benar.');
      return;
    }

    if (isBatchMode) {
      const newDrafts = validRows.map(row => ({
        ...formData,
        pcs: row.pcs,
        kgs: row.kgs
      }));
      setDraftItems(prev => [...prev, ...newDrafts]);
      // Reset only quantity rows to keep product name of draft items selected
      setQtyRows([{ pcs: 0, kgs: 0 }]);
    } else {
      const newItems = validRows.map(row => ({
        ...formData,
        pcs: row.pcs,
        kgs: row.kgs
      }));
      onSubmitBatch(newItems);
      setQtyRows([{ pcs: 0, kgs: 0 }]);
    }
  };


  const removeDraftItem = (index: number) => {
    setDraftItems(prev => prev.filter((_, i) => i !== index));
  };

  const submitFinalBatch = () => {
    if (draftItems.length === 0) return;
    onSubmitBatch(draftItems);
    setDraftItems([]);
  };

  const filteredDropdownItems = availableItems.filter(item =>
    item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-bottom duration-500">
      <div className={`${isBatchMode ? 'lg:col-span-5' : 'lg:col-span-8 lg:col-start-3'} space-y-6 transition-all duration-300`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Input Barang Masuk</h2>
            <p className="text-gray-500 text-sm font-medium">Registrasi pemindahan produk ke Chiller</p>
          </div>

          <div className="inline-flex bg-gray-200 p-1 rounded-xl self-start md:self-center">
            <button
              type="button"
              onClick={() => setIsBatchMode(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${!isBatchMode ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Zap size={14} />
              SINGLE
            </button>
            <button
              type="button"
              onClick={() => setIsBatchMode(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${isBatchMode ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Layers size={14} />
              BATCH
            </button>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="space-y-1 flex-1 relative" ref={dropdownRef}>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Package2 size={14} className="text-red-600" />
                  Nama Produk (Code)
                </label>

                {/* Custom Searchable Dropdown */}
                <div className="relative">
                  <div
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={`w-full bg-gray-50 border-2 rounded-xl px-4 py-3 transition-all outline-none font-bold cursor-pointer flex items-center justify-between ${isDropdownOpen ? 'border-red-600 ring-4 ring-red-100' : 'border-gray-100'}`}
                  >
                    <span className={formData.itemsId ? 'text-gray-800' : 'text-gray-400'}>
                      {formData.itemsId
                        ? (() => {
                          const found = availableItems.find(i => i.id === formData.itemsId);
                          return found ? `${found.code} - ${found.description}` : 'Terpilih';
                        })()
                        : 'Pilih Produk...'}
                    </span>
                    <ChevronDown className={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} size={18} />
                  </div>

                  {isDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-3 border-b border-gray-50">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Cari kode atau nama..."
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border-none rounded-lg text-xs font-bold focus:ring-2 focus:ring-red-500 outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {filteredDropdownItems.length > 0 ? (
                          filteredDropdownItems.map(item => (
                            <div
                              key={item.id}
                              onClick={() => {
                                setFormData(prev => ({ ...prev, itemsId: item.id, itemName: `${item.code} - ${item.description}` }));
                                setIsDropdownOpen(false);
                                setSearchQuery('');
                              }}
                              className={`px-4 py-3 hover:bg-red-50 cursor-pointer transition-colors flex flex-col ${formData.itemsId === item.id ? 'bg-red-50' : ''}`}
                            >
                              <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">{item.code}</span>
                              <span className="text-xs font-bold text-gray-800">{item.description}</span>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-6 text-center text-gray-400 text-[10px] font-black uppercase">Produk tidak ditemukan</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-4 py-3 rounded-xl border-2 border-gray-100 select-none hover:bg-gray-100 transition-colors w-full">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                    checked={formData.isWIP}
                    onChange={(e) => setFormData(prev => ({ ...prev, isWIP: e.target.checked }))}
                  />
                  <span className="text-xs font-black text-gray-700 uppercase">WIP (Work In Progress)</span>
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between pl-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-[#9ca3af]">Detail Baris Kuantitas (Pcs &amp; Kg)</span>
                <button
                  type="button"
                  onClick={handleAddQtyRow}
                  className="flex items-center gap-1.5 text-[10px] font-black text-red-600 uppercase hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100"
                >
                  <Plus size={12} />
                  Tambah Baris
                </button>
              </div>

              <div className="space-y-2">
                {qtyRows.map((row, idx) => (
                  <div key={idx} className="flex gap-3 items-center animate-in fade-in duration-200">
                    <div className="flex-1 relative">
                      <button
                        type="button"
                        onClick={() => setActiveCalculator({ rowIndex: idx, field: 'pcs', value: row.pcs })}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 p-1 hover:bg-gray-100 hover:text-red-600 rounded-lg transition-colors cursor-pointer outline-none"
                        title="Buka kalkulator Qty"
                      >
                        <Calculator size={14} />
                      </button>
                      <input
                        type="number"
                        placeholder="Qty (Pcs)"
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl pl-10 pr-4 py-3 focus:border-red-600 focus:bg-white transition-all outline-none font-bold text-sm"
                        value={row.pcs || ''}
                        onChange={(e) => handleQtyRowChange(idx, 'pcs', parseInt(e.target.value) || 0)}
                      />
                    </div>

                    <div className="flex-1 relative">
                      <button
                        type="button"
                        onClick={() => setActiveCalculator({ rowIndex: idx, field: 'kgs', value: row.kgs })}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 p-1 hover:bg-gray-100 hover:text-red-50 rounded-lg transition-colors cursor-pointer outline-none"
                        title="Buka kalkulator Berat"
                      >
                        <Scale size={14} />
                      </button>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Berat (Kg)"
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl pl-10 pr-4 py-3 focus:border-red-600 focus:bg-white transition-all outline-none font-bold text-sm"
                        value={row.kgs || ''}
                        onChange={(e) => handleQtyRowChange(idx, 'kgs', parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    {qtyRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveQtyRow(idx)}
                        className="p-3 bg-gray-50 hover:bg-red-50 hover:text-red-600 border border-gray-100 hover:border-red-100 text-gray-400 rounded-xl transition-all cursor-pointer"
                        title="Hapus Baris"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={14} className="text-red-600" />
                  Tgl Produksi
                </label>
                <input
                  type="date"
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 outline-none font-bold"
                  value={formData.productionDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, productionDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar size={14} className="text-red-600" />
                  Tgl Potong
                </label>
                <input
                  type="date"
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 outline-none font-bold"
                  value={formData.slaughteringDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, slaughteringDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <ArrowDownToLine size={14} className="text-red-600" />
                  Sumber Barang
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 outline-none font-bold cursor-pointer"
                    value={formData.source}
                    onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value as InflowSource }))}
                  >
                    {INFLOW_SOURCES.map(src => <option key={src} value={src}>{src}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={14} className="text-red-600" />
                  Alokasi Barang
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 outline-none font-bold cursor-pointer"
                    value={formData.allocation}
                    onChange={(e) => setFormData(prev => ({ ...prev, allocation: e.target.value as InflowSource }))}
                  >
                    {INFLOW_SOURCES.map(src => <option key={src} value={src}>{src}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className={`w-full text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 uppercase text-sm ${isBatchMode ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-100' : 'bg-red-600 hover:bg-red-700 shadow-red-100'}`}
          >
            {isBatchMode ? <Plus className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {isBatchMode ? 'Tambahkan Ke Daftar Batch' : 'Simpan Langsung ke Chiller'}
          </button>
        </form>
      </div>

      {isBatchMode && (
        <div className="lg:col-span-7 flex flex-col space-y-4 animate-in slide-in-from-right duration-300">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-800 uppercase flex items-center gap-3">
              Antrian Batch
              <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full">{draftItems.length}</span>
            </h3>
            {draftItems.length > 0 && (
              <button
                onClick={() => setDraftItems([])}
                className="text-[10px] font-bold text-gray-400 hover:text-red-600 flex items-center gap-1 uppercase"
              >
                <Trash2 size={12} /> Hapus Semua
              </button>
            )}
          </div>

          <div className="flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
            <div className="overflow-y-auto flex-1">
              {draftItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 p-10 text-center">
                  <Layers size={48} className="mb-4 opacity-10" />
                  <p className="font-bold text-xs uppercase tracking-widest">Daftar Kosong</p>
                  <p className="text-[10px] mt-1">Gunakan form di samping untuk mulai antrian batch.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                    <tr>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider text-right">Qty/Wght</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider">Src/Aloc</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {draftItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] font-bold text-gray-800 leading-tight">{item.itemName}</div>
                            {item.isWIP && <span className="text-[8px] font-black bg-amber-100 text-amber-700 px-1 rounded">WIP</span>}
                          </div>
                          <div className="text-[8px] text-gray-400 font-medium">POT: {item.slaughteringDate}</div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="text-[11px] font-black text-gray-700">{item.pcs} Pcs</div>
                          <div className="text-[9px] font-bold text-gray-400">{item.kgs.toFixed(2)} Kg</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            <span className="bg-gray-100 text-gray-600 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase w-fit">S: {item.source}</span>
                            <span className="bg-red-50 text-red-600 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase w-fit">A: {item.allocation}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => removeDraftItem(idx)} className="text-gray-300 hover:text-red-600 transition-colors">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {draftItems.length > 0 && (
              <div className="p-4 bg-red-50 border-t border-red-100">
                <button
                  onClick={submitFinalBatch}
                  className="w-full bg-red-600 text-white font-black py-3 rounded-xl shadow-xl shadow-red-200 hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase text-xs"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Konfirmasi & Simpan Batch
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeCalculator && (
        <CalculatorPopup
          initialValue={activeCalculator.value}
          title={`Hitung ${activeCalculator.field === 'pcs' ? 'Qty (Pcs)' : 'Berat (Kg)'}`}
          onApply={(val) => {
            handleQtyRowChange(activeCalculator.rowIndex, activeCalculator.field, val);
          }}
          onClose={() => setActiveCalculator(null)}
        />
      )}
    </div>
  );
};

export default InflowForm;
