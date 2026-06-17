
import React, { useState, useMemo, useEffect } from 'react';
import { ChillerItem, OutflowDestination, InflowSource, User } from '../types';
import { OUTFLOW_DESTINATIONS, INFLOW_SOURCES } from '../constants';
import { formatNumber } from '@/utils';
import {
  ArrowUpFromLine,
  Search,
  Boxes,
  X,
  Check,
  CheckSquare,
  Filter,
  RotateCcw,
  Scale,
  Calculator,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Package
} from 'lucide-react';
import CalculatorPopup from './CalculatorPopup';

interface InventoryListProps {
  user: User | null;
  items: ChillerItem[];
  onOut: (id: string, destination: OutflowDestination, outPcs?: number, outKgs?: number) => void;
  onBatchOut: (ids: string[], destination: OutflowDestination) => void;
  onQCApprove: (id: string) => void;
  onQCReject: (id: string) => void;
}

const InventoryList: React.FC<InventoryListProps> = ({ user, items, onOut, onBatchOut, onQCApprove, onQCReject }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isBatchOutModalOpen, setIsBatchOutModalOpen] = useState(false);
  const [selectedItemForSingleOut, setSelectedItemForSingleOut] = useState<ChillerItem | null>(null);
  const [destination, setDestination] = useState<OutflowDestination>('Boneless');
  const [showAdminCondemConfirm, setShowAdminCondemConfirm] = useState(false);

  const [outPcs, setOutPcs] = useState<number>(0);
  const [outKgs, setOutKgs] = useState<number>(0);
  const [activeCalculator, setActiveCalculator] = useState<'pcs' | 'kgs' | null>(null);

  const [filterSource, setFilterSource] = useState<InflowSource | 'ALL'>('ALL');
  const [filterAllocation, setFilterAllocation] = useState<InflowSource | 'ALL'>('ALL');
  const [filterWIP, setFilterWIP] = useState<'ALL' | 'WIP' | 'REGULAR'>('ALL');
  const [filterProdDate, setFilterProdDate] = useState('');
  const [filterSlaughterDate, setFilterSlaughterDate] = useState('');

  useEffect(() => {
    if (selectedItemForSingleOut) {
      setOutPcs(selectedItemForSingleOut.pcs);
      setOutKgs(selectedItemForSingleOut.kgs);

      // Set default destination based on allocation
      const allocation = selectedItemForSingleOut.allocation;
      const matchedDest = OUTFLOW_DESTINATIONS.find(
        d => d.toUpperCase() === allocation.toUpperCase()
      );

      if (matchedDest) {
        setDestination(matchedDest);
      } else if (allocation === 'PDS' || allocation === 'SO FRESH') {
        setDestination('Delive');
      }
    }
  }, [selectedItemForSingleOut]);

  useEffect(() => {
    if (isBatchOutModalOpen && selectedItemIds.length > 0) {
      // Check if all selected items have the same allocation
      const selectedItems = items.filter(i => selectedItemIds.includes(i.id));
      if (selectedItems.length > 0) {
        const firstAllocation = selectedItems[0].allocation;
        const allSameAllocation = selectedItems.every(i => i.allocation === firstAllocation);

        if (allSameAllocation) {
          const matchedDest = OUTFLOW_DESTINATIONS.find(
            d => d.toUpperCase() === firstAllocation.toUpperCase()
          );

          if (matchedDest) {
            setDestination(matchedDest);
          } else if (firstAllocation === 'PDS' || firstAllocation === 'SO FRESH') {
            setDestination('Delive');
          }
        }
      }
    }
  }, [isBatchOutModalOpen, selectedItemIds, items]);

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const matchesSearch =
        i.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.batchId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesSource = filterSource === 'ALL' || i.source === filterSource;
      const matchesAllocation = filterAllocation === 'ALL' || i.allocation === filterAllocation;
      const matchesWIP =
        filterWIP === 'ALL' ||
        (filterWIP === 'WIP' && i.isWIP) ||
        (filterWIP === 'REGULAR' && !i.isWIP);

      const matchesProdDate = !filterProdDate || i.productionDate === filterProdDate;
      const matchesSlaughterDate = !filterSlaughterDate || i.slaughteringDate === filterSlaughterDate;

      return matchesSearch && matchesSource && matchesAllocation && matchesWIP && matchesProdDate && matchesSlaughterDate;
    });
  }, [items, searchTerm, filterSource, filterAllocation, filterWIP, filterProdDate, filterSlaughterDate]);

  const totals = useMemo(() => {
    return filteredItems.reduce((acc, curr) => ({
      pcs: acc.pcs + curr.pcs,
      kgs: acc.kgs + curr.kgs
    }), { pcs: 0, kgs: 0 });
  }, [filteredItems]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterSource('ALL');
    setFilterAllocation('ALL');
    setFilterWIP('ALL');
    setFilterProdDate('');
    setFilterSlaughterDate('');
  };

  const toggleSelection = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item?.status === 'PENDING_QC') return;

    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const executeConfirm = () => {
    const userRole = user?.role?.toUpperCase() || '';
    if (destination === 'Condem' && (userRole === 'ADMINQC' || userRole === 'SUPERADMIN') && !showAdminCondemConfirm) {
      setShowAdminCondemConfirm(true);
      return;
    }

    if (isBatchOutModalOpen) {
      onBatchOut(selectedItemIds, destination);
      setSelectedItemIds([]);
      setIsBatchOutModalOpen(false);
    } else if (selectedItemForSingleOut) {
      onOut(selectedItemForSingleOut.id, destination, outPcs, outKgs);
      setSelectedItemForSingleOut(null);
    }
    setShowAdminCondemConfirm(false);
  };

  const isInvalidPartial = selectedItemForSingleOut && (
    outPcs <= 0 || outPcs > selectedItemForSingleOut.pcs ||
    outKgs <= 0 || outKgs > selectedItemForSingleOut.kgs
  );

  return (
    <div className="space-y-4 pb-24">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight uppercase">Stok Chiller Aktif</h2>
          <p className="text-[8px] md:text-[10px] text-gray-500 font-bold uppercase tracking-widest">Manajemen Inventori</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <input type="text" placeholder="Cari item..." className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-600 outline-none shadow-sm font-bold text-[11px] transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-black text-[10px] transition-all ${showFilters ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}><Filter size={12} /> FILTER</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Total Batch</p>
          <div className="flex items-baseline gap-1.5"><span className="text-xl font-black text-gray-900">{filteredItems.length}</span><span className="text-[9px] font-bold text-gray-400">Items</span></div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Total Quantity</p>
          <div className="flex items-baseline gap-1.5"><span className="text-xl font-black text-red-600">{formatNumber(totals.pcs, 0)}</span><span className="text-[9px] font-bold text-gray-400">Pcs</span></div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col col-span-2 md:col-span-1">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Total Berat</p>
          <div className="flex items-baseline gap-1.5"><span className="text-xl font-black text-red-600">{formatNumber(totals.kgs, 2)}</span><span className="text-[9px] font-bold text-gray-400">Kgs</span></div>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-in slide-in-from-top-2">
          <div className="space-y-1"><label className="text-[9px] font-black text-gray-400 uppercase">Sumber</label><select className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold" value={filterSource} onChange={(e) => setFilterSource(e.target.value as any)}><option value="ALL">SEMUA</option>{INFLOW_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="space-y-1"><label className="text-[9px] font-black text-gray-400 uppercase">Alokasi</label><select className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold" value={filterAllocation} onChange={(e) => setFilterAllocation(e.target.value as any)}><option value="ALL">SEMUA</option>{INFLOW_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="space-y-1"><label className="text-[9px] font-black text-gray-400 uppercase">WIP</label><select className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold" value={filterWIP} onChange={(e) => setFilterWIP(e.target.value as any)}><option value="ALL">SEMUA</option><option value="WIP">WIP</option><option value="REGULAR">REGULAR</option></select></div>
          <div className="space-y-1"><label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tgl Produksi</label><input type="date" className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold outline-none" value={filterProdDate} onChange={(e) => setFilterProdDate(e.target.value)} /></div>
          <div className="space-y-1"><label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tgl Potong</label><input type="date" className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold outline-none" value={filterSlaughterDate} onChange={(e) => setFilterSlaughterDate(e.target.value)} /></div>
          <div className="flex items-end pb-1">
            <button onClick={resetFilters} className="w-full flex items-center justify-center gap-2 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-dashed border-gray-200 text-[9px] font-black uppercase">
              <RotateCcw size={12} /> Reset
            </button>
          </div>
        </div>
      )}

      {selectedItemIds.length > 0 && (
        <div className="sticky top-4 z-30 flex items-center justify-between bg-red-600 text-white p-3 rounded-xl shadow-xl animate-in slide-in-from-top">
          <div className="flex items-center gap-3 ml-2"><CheckSquare className="w-5 h-5" /><span className="font-black text-sm uppercase">{selectedItemIds.length} Terpilih</span></div>
          <div className="flex items-center gap-2"><button onClick={() => setSelectedItemIds([])} className="px-3 py-1.5 hover:bg-red-700 rounded-lg text-xs font-bold uppercase">Batal</button><button onClick={() => setIsBatchOutModalOpen(true)} className="bg-white text-red-600 px-4 py-1.5 rounded-lg text-xs font-black shadow-lg flex items-center gap-2 uppercase"><ArrowUpFromLine size={14} /> Keluar</button></div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {filteredItems.map((item) => {
          const isSelected = selectedItemIds.includes(item.id);
          const isPendingQC = item.status === 'PENDING_QC';
          const userRole = user?.role?.toUpperCase() || '';

          return (
            <div
              key={item.id}
              onClick={() => toggleSelection(item.id)}
              className={`
                group relative bg-white rounded-2xl overflow-hidden border-2 transition-all flex flex-col
                ${isPendingQC ? 'border-amber-400 bg-amber-50/20' : isSelected ? 'border-red-500 bg-red-50/20' : 'border-gray-50 hover:border-red-200 shadow-sm'}
                ${isPendingQC ? 'cursor-default' : 'cursor-pointer'}
              `}
            >
              <div className="flex-1 flex flex-col p-3 gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-red-50 text-red-600 text-[7px] font-black uppercase px-1.5 py-0.5 rounded border border-red-100">S: {item.source}</span>
                    <span className="bg-blue-50 text-blue-600 text-[7px] font-black uppercase px-1.5 py-0.5 rounded border border-blue-100">A: {item.allocation}</span>
                    {item.isWIP && <span className="bg-amber-100 text-amber-700 text-[7px] font-black px-1.5 py-0.5 rounded">WIP</span>}
                  </div>
                  <span className="text-[7px] font-bold text-gray-300 uppercase tracking-tighter">{item.batchId}</span>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm md:text-base font-black text-gray-900 uppercase leading-tight">{item.itemCode}</h3>
                    <div className="text-[9px] font-bold text-gray-500 truncate mt-0.5">{item.itemName}</div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex items-center gap-1"><span className="text-[7px] font-black text-gray-400 uppercase">PD:</span><span className="text-[8px] font-bold text-gray-600">{item.productionDate}</span></div>
                      <div className="flex items-center gap-1"><span className="text-[7px] font-black text-gray-400 uppercase">SD:</span><span className="text-[8px] font-bold text-gray-600">{item.slaughteringDate}</span></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 md:gap-6">
                    <div className="flex items-center bg-gray-50/80 px-3 py-2 rounded-xl border border-gray-100 gap-4">
                      <div className="flex flex-col items-center">
                        <span className="text-[6px] font-black text-gray-400 uppercase mb-0.5">Qty</span>
                        <span className="text-xs font-black text-gray-800">{formatNumber(item.pcs, 0)} <span className="text-[8px] text-gray-400">Pcs</span></span>
                      </div>
                      <div className="w-px h-6 bg-gray-200" />
                      <div className="flex flex-col items-center">
                        <span className="text-[6px] font-black text-gray-400 uppercase mb-0.5">Weight</span>
                        <span className="text-xs font-black text-gray-800">{formatNumber(item.kgs, 2)} <span className="text-[8px] text-gray-400">Kg</span></span>
                      </div>
                    </div>

                    <div className="flex-1 md:flex-none">
                      {isPendingQC ? (
                        (userRole === 'ADMINQC' || userRole === 'SUPERADMIN') ? (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); onQCReject(item.id); }}
                              className="p-2 bg-white text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                              title="Tolak"
                            >
                              <XCircle size={16} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onQCApprove(item.id); }}
                              className="bg-red-600 text-white font-black px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700 transition-colors uppercase text-[9px] shadow-lg shadow-red-100"
                            >
                              <ShieldCheck size={14} /> APPROVE
                            </button>
                          </div>
                        ) : (
                          <div className="px-3 py-2 bg-amber-50 text-amber-600 font-black text-[8px] rounded-lg flex items-center gap-1.5 border border-amber-200 uppercase">
                            <ShieldAlert size={12} /> PENDING QC
                          </div>
                        )
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedItemForSingleOut(item); }}
                          className="w-full md:w-auto bg-red-600 text-white font-black px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-all active:scale-95 uppercase text-[10px] shadow-lg shadow-red-200 group-hover:shadow-red-300"
                        >
                          <ArrowUpFromLine size={14} /> KELUAR
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(isBatchOutModalOpen || selectedItemForSingleOut) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase">Proses Pengeluaran</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{isBatchOutModalOpen ? `${selectedItemIds.length} Batch terpilih` : `BATCH: ${selectedItemForSingleOut?.batchId}`}</p>
                </div>
                <button onClick={() => { setIsBatchOutModalOpen(false); setSelectedItemForSingleOut(null); setShowAdminCondemConfirm(false); }} className="p-1 hover:bg-gray-100 rounded-lg transition-colors"><X size={20} className="text-gray-400" /></button>
              </div>

              {!showAdminCondemConfirm ? (
                <>
                  <div className="bg-gray-50 p-4 rounded-xl mb-6 border border-gray-100">
                    {selectedItemForSingleOut && (
                      <div className="space-y-3">
                        <p className="text-base font-black text-red-600 uppercase leading-tight">{selectedItemForSingleOut.itemCode}</p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase">{selectedItemForSingleOut.itemName}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Qty Keluar</label>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setActiveCalculator('pcs')}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-1 hover:bg-gray-100 rounded-md transition-all cursor-pointer outline-none"
                                title="Buka kalkulator Qty Keluar"
                              >
                                <Calculator size={13} />
                              </button>
                              <input
                                type="number"
                                className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-xs font-black outline-none focus:border-red-600 focus:bg-white"
                                value={outPcs || ''}
                                onChange={(e) => setOutPcs(parseInt(e.target.value) || 0)}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Berat Keluar</label>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setActiveCalculator('kgs')}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 p-1 hover:bg-gray-100 rounded-md transition-all cursor-pointer outline-none"
                                title="Buka kalkulator Berat Keluar"
                              >
                                <Scale size={13} />
                              </button>
                              <input
                                type="number"
                                step="0.01"
                                className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-xs font-black outline-none focus:border-red-600 focus:bg-white"
                                value={outKgs || ''}
                                onChange={(e) => setOutKgs(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {isBatchOutModalOpen && <p className="text-base font-black text-red-600 uppercase">Grup Mutasi Keluar ({selectedItemIds.length} Batch)</p>}
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Pilih Tujuan Keluar</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {OUTFLOW_DESTINATIONS.map(dest => (
                        <button key={dest} onClick={() => setDestination(dest)} className={`py-2 px-1 rounded-lg border-2 text-[8px] font-black transition-all uppercase ${destination === dest ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-50 hover:border-gray-200 text-gray-400'}`}>{dest}</button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-red-50 border-2 border-red-200 p-6 rounded-2xl text-center space-y-4 animate-in zoom-in">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-red-600">
                    <ShieldAlert size={32} />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-red-700 uppercase">Konfirmasi Admin (Kondem)</h4>
                    <p className="text-xs font-bold text-red-600/70 mt-1">Anda akan mengeluarkan barang ke Kondem. Tindakan ini bersifat final. Lanjutkan?</p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 flex gap-3">
              <button onClick={() => { if (showAdminCondemConfirm) setShowAdminCondemConfirm(false); else { setIsBatchOutModalOpen(false); setSelectedItemForSingleOut(null); } }} className="flex-1 py-3 font-black text-gray-400 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all uppercase text-xs">Batal</button>
              <button disabled={isInvalidPartial} onClick={executeConfirm} className={`flex-1 py-3 font-black text-white rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase text-xs ${isInvalidPartial ? 'bg-gray-300 cursor-not-allowed grayscale' : 'bg-red-600 shadow-red-100 hover:bg-red-700 active:scale-95'}`}>
                {destination === 'Condem' && (user?.role?.toUpperCase() === 'USER' || user?.role?.toUpperCase() === 'ADMIN') ? (
                  <><ShieldAlert className="w-4 h-4" /> Minta Persetujuan QC</>
                ) : (
                  <><Check className="w-4 h-4" /> {showAdminCondemConfirm ? 'Ya, Konfirmasi' : 'Konfirmasi'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCalculator && (
        <CalculatorPopup
          initialValue={activeCalculator === 'pcs' ? outPcs : outKgs}
          title={`Hitung ${activeCalculator === 'pcs' ? 'Qty Keluar (Pcs)' : 'Berat Keluar (Kg)'}`}
          onApply={(val) => {
            if (activeCalculator === 'pcs') {
              setOutPcs(val);
            } else {
              setOutKgs(val);
            }
          }}
          onClose={() => setActiveCalculator(null)}
        />
      )}
    </div>
  );
};

export default InventoryList;
