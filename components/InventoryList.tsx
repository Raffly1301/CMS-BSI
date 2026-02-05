
import React, { useState, useMemo, useEffect } from 'react';
import { ChillerItem, OutflowDestination, InflowSource } from '../types';
import { OUTFLOW_DESTINATIONS, INFLOW_SOURCES } from '../constants';
import { 
  ArrowUpFromLine, 
  Search, 
  Calendar, 
  Boxes, 
  X,
  Check,
  CheckSquare,
  Square,
  Tag,
  Filter,
  RotateCcw,
  Scale,
  Calculator,
  AlertTriangle
} from 'lucide-react';

interface InventoryListProps {
  items: ChillerItem[];
  onOut: (id: string, destination: OutflowDestination, outPcs?: number, outKgs?: number) => void;
  onBatchOut: (ids: string[], destination: OutflowDestination) => void;
}

const InventoryList: React.FC<InventoryListProps> = ({ items, onOut, onBatchOut }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isBatchOutModalOpen, setIsBatchOutModalOpen] = useState(false);
  const [selectedItemForSingleOut, setSelectedItemForSingleOut] = useState<ChillerItem | null>(null);
  const [destination, setDestination] = useState<OutflowDestination>('Boneless');
  
  // Partial Outflow States
  const [outPcs, setOutPcs] = useState<number>(0);
  const [outKgs, setOutKgs] = useState<number>(0);

  // Filter States
  const [filterSource, setFilterSource] = useState<InflowSource | 'ALL'>('ALL');
  const [filterWIP, setFilterWIP] = useState<'ALL' | 'WIP' | 'REGULAR'>('ALL');
  const [filterProdDate, setFilterProdDate] = useState('');
  const [filterSlaughterDate, setFilterSlaughterDate] = useState('');

  // Reset partial states when selecting a new item
  useEffect(() => {
    if (selectedItemForSingleOut) {
      setOutPcs(selectedItemForSingleOut.pcs);
      setOutKgs(selectedItemForSingleOut.kgs);
    }
  }, [selectedItemForSingleOut]);

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const matchesSearch = 
        i.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSource = filterSource === 'ALL' || i.source === filterSource;
      const matchesWIP = 
        filterWIP === 'ALL' || 
        (filterWIP === 'WIP' && i.isWIP) || 
        (filterWIP === 'REGULAR' && !i.isWIP);
      
      const matchesProdDate = !filterProdDate || i.productionDate === filterProdDate;
      const matchesSlaughterDate = !filterSlaughterDate || i.slaughteringDate === filterSlaughterDate;

      return matchesSearch && matchesSource && matchesWIP && matchesProdDate && matchesSlaughterDate;
    });
  }, [items, searchTerm, filterSource, filterWIP, filterProdDate, filterSlaughterDate]);

  // Calculate Totals
  const totals = useMemo(() => {
    return filteredItems.reduce((acc, curr) => ({
      pcs: acc.pcs + curr.pcs,
      kgs: acc.kgs + curr.kgs
    }), { pcs: 0, kgs: 0 });
  }, [filteredItems]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterSource('ALL');
    setFilterWIP('ALL');
    setFilterProdDate('');
    setFilterSlaughterDate('');
  };

  const toggleSelection = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchOutTrigger = () => {
    if (selectedItemIds.length === 0) return;
    setIsBatchOutModalOpen(true);
  };

  const executeBatchOut = () => {
    onBatchOut(selectedItemIds, destination);
    setSelectedItemIds([]);
    setIsBatchOutModalOpen(false);
  };

  const activeFilterCount = [
    filterSource !== 'ALL',
    filterWIP !== 'ALL',
    filterProdDate !== '',
    filterSlaughterDate !== ''
  ].filter(Boolean).length;

  const isInvalidPartial = selectedItemForSingleOut && (
    outPcs <= 0 || outPcs > selectedItemForSingleOut.pcs ||
    outKgs <= 0 || outKgs > selectedItemForSingleOut.kgs
  );

  return (
    <div className="space-y-4 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight uppercase">Stok Chiller Aktif</h2>
          <p className="text-[8px] md:text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            Manajemen Inventori Real-time
          </p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <input 
              type="text"
              placeholder="Cari item..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-600 outline-none shadow-sm font-bold text-[11px] md:text-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl border-2 font-black text-[10px] transition-all ${showFilters || activeFilterCount > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}
          >
            <Filter size={12} />
            FILTER {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        </div>
      </header>

      {/* Summary Totals Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
        <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-[7px] md:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5 md:mb-1">Total Batch</p>
          <div className="flex items-baseline gap-1.5 md:gap-2">
            <span className="text-xl md:text-2xl font-black text-gray-900 leading-none">{filteredItems.length}</span>
            <span className="text-[9px] md:text-[10px] font-bold text-gray-400">Items</span>
          </div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-[7px] md:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5 md:mb-1">Total Quantity</p>
          <div className="flex items-baseline gap-1.5 md:gap-2">
            <span className="text-xl md:text-2xl font-black text-red-600 leading-none">{totals.pcs.toLocaleString()}</span>
            <span className="text-[9px] md:text-[10px] font-bold text-gray-400">Pcs</span>
          </div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center col-span-2 md:col-span-1">
          <p className="text-[7px] md:text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5 md:mb-1">Total Berat</p>
          <div className="flex items-baseline gap-1.5 md:gap-2">
            <span className="text-xl md:text-2xl font-black text-red-600 leading-none">{totals.kgs.toFixed(2).toLocaleString()}</span>
            <span className="text-[9px] md:text-[10px] font-bold text-gray-400">Kgs</span>
          </div>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-4 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sumber</label>
            <select 
              className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-red-600"
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as any)}
            >
              <option value="ALL">SEMUA SUMBER</option>
              {INFLOW_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Jenis Produk</label>
            <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-100">
              {(['ALL', 'WIP', 'REGULAR'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterWIP(type)}
                  className={`flex-1 py-1 text-[9px] font-black rounded ${filterWIP === type ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tgl Produksi</label>
            <input 
              type="date"
              className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold outline-none"
              value={filterProdDate}
              onChange={(e) => setFilterProdDate(e.target.value)}
            />
          </div>
          <div className="space-y-1 flex flex-col justify-end">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tgl Potong</label>
            <div className="flex gap-2">
              <input 
                type="date"
                className="flex-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                value={filterSlaughterDate}
                onChange={(e) => setFilterSlaughterDate(e.target.value)}
              />
              <button 
                onClick={resetFilters}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reset Filter"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Action Bar */}
      {selectedItemIds.length > 0 && (
        <div className="sticky top-4 z-30 flex items-center justify-between bg-red-600 text-white p-3 rounded-xl shadow-xl animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3 ml-2">
            <CheckSquare className="w-5 h-5" />
            <span className="font-black text-sm uppercase">{selectedItemIds.length} Terpilih</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSelectedItemIds([])}
              className="px-3 py-1.5 hover:bg-red-700 rounded-lg text-xs font-bold transition-all uppercase"
            >
              Batal
            </button>
            <button 
              onClick={handleBatchOutTrigger}
              className="bg-white text-red-600 px-4 py-1.5 rounded-lg text-xs font-black shadow-lg hover:bg-gray-100 active:scale-95 transition-all flex items-center gap-2 uppercase"
            >
              <ArrowUpFromLine className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center border-2 border-dashed border-gray-100 mt-4">
          <Boxes className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Data Tidak Ditemukan</h3>
          <button onClick={resetFilters} className="mt-4 text-[10px] font-black text-red-600 uppercase underline">Reset Pencarian</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredItems.map((item) => {
            const isSelected = selectedItemIds.includes(item.id);
            return (
              <div 
                key={item.id} 
                onClick={() => toggleSelection(item.id)}
                className={`
                  group relative bg-white rounded-2xl overflow-hidden border-2 transition-all cursor-pointer flex flex-col md:flex-row md:items-stretch
                  ${isSelected ? 'border-red-500 bg-red-50/20' : 'border-gray-50 hover:border-red-200 shadow-sm'}
                `}
              >
                <div className={`hidden md:block w-1.5 ${isSelected ? 'bg-red-500' : 'bg-transparent'}`} />
                <div className="flex-1 flex flex-col p-4 md:p-3 gap-3">
                  <div className="flex items-center justify-between md:justify-start gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-red-100 text-red-700 text-[8px] md:text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                        ASAL: {item.source}
                      </span>
                      {item.isWIP && (
                        <span className="bg-amber-100 text-amber-700 text-[8px] md:text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex items-center gap-1">
                          <Tag size={8} /> WIP
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] md:text-[9px] font-bold text-gray-300 tracking-tight md:tracking-tighter truncate md:max-w-[100px]">
                      {item.id}
                    </span>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 flex-1">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base md:text-sm font-black text-gray-800 truncate uppercase leading-tight mb-1">
                        {item.itemName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                         <div className="flex items-center gap-1">
                           <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">PD:</span>
                           <span className="text-[9px] font-bold text-gray-600">{item.productionDate}</span>
                         </div>
                         <div className="flex items-center gap-1">
                           <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">SD:</span>
                           <span className="text-[9px] font-bold text-gray-600">{item.slaughteringDate}</span>
                         </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden divide-x divide-gray-100">
                      <div className="flex flex-col flex-1 px-4 py-2 md:py-1.5">
                        <span className="text-[7px] md:text-[8px] font-black text-gray-400 uppercase leading-none mb-1">Quantity</span>
                        <span className="text-xs md:text-[11px] font-black text-gray-700 leading-none">{item.pcs} Pcs</span>
                      </div>
                      <div className="flex flex-col flex-1 px-4 py-2 md:py-1.5">
                        <span className="text-[7px] md:text-[8px] font-black text-gray-400 uppercase leading-none mb-1">Weight</span>
                        <span className="text-xs md:text-[11px] font-black text-gray-700 leading-none">{item.kgs.toFixed(2)} Kg</span>
                      </div>
                    </div>

                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemForSingleOut(item);
                      }}
                      className="w-full md:w-auto md:ml-auto bg-red-600 text-white font-black px-6 py-3 md:py-2 rounded-xl md:rounded-lg flex items-center justify-center gap-2 hover:bg-red-700 transition-colors uppercase text-[10px] md:text-[9px] tracking-[0.15em] shadow-lg shadow-red-100 active:scale-[0.98] md:active:scale-95"
                    >
                      <ArrowUpFromLine className="w-3.5 h-3.5" />
                      Keluar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Out Modal - Enhanced for Partial Outflow */}
      {(isBatchOutModalOpen || selectedItemForSingleOut) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase">Proses Pengeluaran</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                    {isBatchOutModalOpen ? `${selectedItemIds.length} Batch terpilih` : `ID: ${selectedItemForSingleOut?.id}`}
                  </p>
                </div>
                <button onClick={() => { setIsBatchOutModalOpen(false); setSelectedItemForSingleOut(null); }} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100">
                 <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Item yang diproses:</p>
                 {isBatchOutModalOpen ? (
                   <p className="text-base font-black text-red-600">Gabungan {selectedItemIds.length} Batch Produk</p>
                 ) : (
                   <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-base font-black text-red-600 uppercase leading-tight">{selectedItemForSingleOut?.itemName}</p>
                        <p className="text-xs font-bold text-gray-600">Total Stok: {selectedItemForSingleOut?.pcs} Pcs / {selectedItemForSingleOut?.kgs.toFixed(2)} Kg</p>
                      </div>
                      {selectedItemForSingleOut?.isWIP && <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded uppercase">WIP</span>}
                    </div>

                    {/* Partial Outflow Inputs */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                          <Calculator size={10} /> Qty Keluar (Pcs)
                        </label>
                        <input 
                          type="number" 
                          className={`w-full bg-white border-2 rounded-lg px-3 py-2 text-xs font-black outline-none transition-all ${outPcs > (selectedItemForSingleOut?.pcs || 0) ? 'border-red-500 focus:ring-red-100' : 'border-gray-100 focus:border-red-600'}`}
                          value={outPcs}
                          onChange={(e) => setOutPcs(parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                          <Scale size={10} /> Berat Keluar (Kg)
                        </label>
                        <input 
                          type="number" 
                          step="0.01"
                          className={`w-full bg-white border-2 rounded-lg px-3 py-2 text-xs font-black outline-none transition-all ${outKgs > (selectedItemForSingleOut?.kgs || 0) ? 'border-red-500 focus:ring-red-100' : 'border-gray-100 focus:border-red-600'}`}
                          value={outKgs}
                          onChange={(e) => setOutKgs(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    {/* Sisa Stok Preview */}
                    <div className="flex items-center gap-2 bg-white/50 px-3 py-2 rounded-lg border border-dashed border-gray-200">
                       <span className="text-[9px] font-black text-gray-400 uppercase">Sisa Stok:</span>
                       <span className={`text-[10px] font-black ${isInvalidPartial ? 'text-red-500 animate-pulse' : 'text-gray-600'}`}>
                        {selectedItemForSingleOut ? (selectedItemForSingleOut.pcs - outPcs) : 0} Pcs / 
                        {selectedItemForSingleOut ? (selectedItemForSingleOut.kgs - outKgs).toFixed(2) : '0.00'} Kg
                       </span>
                       {isInvalidPartial && <AlertTriangle size={12} className="text-red-500 ml-auto" />}
                    </div>
                   </div>
                 )}
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                  Pilih Tujuan Keluar (Destination)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {OUTFLOW_DESTINATIONS.map(dest => (
                    <button
                      key={dest}
                      onClick={() => setDestination(dest)}
                      className={`
                        py-2 px-1 rounded-lg border-2 text-[8px] font-black transition-all uppercase
                        ${destination === dest 
                          ? 'border-red-600 bg-red-50 text-red-700' 
                          : 'border-gray-50 hover:border-gray-200 text-gray-400'}
                      `}
                    >
                      {dest}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3">
              <button 
                onClick={() => { setIsBatchOutModalOpen(false); setSelectedItemForSingleOut(null); }}
                className="flex-1 py-3 font-black text-gray-400 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all uppercase text-xs"
              >
                Batal
              </button>
              <button 
                disabled={isInvalidPartial}
                onClick={() => {
                  if (isBatchOutModalOpen) {
                    executeBatchOut();
                  } else if (selectedItemForSingleOut) {
                    onOut(selectedItemForSingleOut.id, destination, outPcs, outKgs);
                    setSelectedItemForSingleOut(null);
                  }
                }}
                className={`flex-1 py-3 font-black text-white rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase text-xs ${isInvalidPartial ? 'bg-gray-300 cursor-not-allowed grayscale' : 'bg-red-600 shadow-red-100 hover:bg-red-700 active:scale-95'}`}
              >
                <Check className="w-4 h-4" />
                Konfirmasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryList;
