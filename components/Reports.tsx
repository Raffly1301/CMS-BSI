
import React, { useState, useMemo, useEffect } from 'react';
import { ChillerItem, Transaction, SystemLog, User } from '../types';
import { formatNumber, getTodayString } from '@/utils';
import { supabase } from '../lib/supabase';
import { getMasterUsers } from '../lib/masterCache';
import {
  History,
  Search,
  ArrowRight,
  User as UserIcon,
  Activity,
  Package,
  Filter,
  RotateCcw,
  Calendar,
  FileText
} from 'lucide-react';

declare const html2pdf: any;
declare const XLSX: any;

interface ReportsProps {
  items: ChillerItem[];
  transactions: Transaction[];
  logs: SystemLog[];
  users: User[];
  user?: User | null;
}

const Reports: React.FC<ReportsProps> = ({ items, transactions, logs, users, user }) => {
  const [tab, setTab] = useState<'TRANSACTIONS' | 'LOGS' | 'STOCK_CARD' | 'ALLOCATION'>('TRANSACTIONS');
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<Transaction['type'] | 'ALL'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState(getTodayString());
  const [filterEndDate, setFilterEndDate] = useState(getTodayString());
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');
  const [filterDestination, setFilterDestination] = useState<string>('ALL');
  const [filterSource, setFilterSource] = useState<string>('ALL');
  const [filterPD, setFilterPD] = useState<string>('');
  const [trxViewMode, setTrxViewMode] = useState<'BATCH' | 'ITEM'>('BATCH');

  // Master users lookup map for UUID -> Name conversion
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  useEffect(() => {
    getMasterUsers().then(({ map }) => {
      if (map) setUsersMap(map);
    }).catch(() => {});
  }, []);

  const usersById = useMemo(() => {
    const map: Record<string, string> = { ...usersMap };
    (users || []).forEach(u => {
      const name = u.fullName || u.username || u.id;
      if (u.id) map[u.id] = name;
      if (u.username) map[u.username] = name;
    });
    return map;
  }, [users, usersMap]);

  const getUserDisplayName = (userId: string) => {
    if (!userId) return 'N/A';
    return usersById[userId] || userId;
  };

  // Server-filtered state
  const [serverTransactions, setServerTransactions] = useState<Transaction[] | null>(null);
  const [isLoadingServerTrx, setIsLoadingServerTrx] = useState<boolean>(false);

  // Slicing/Pagination states for faster rendering of massive lists
  const [trxPage, setTrxPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    let isMounted = true;
    const fetchFilteredTransactions = async () => {
      try {
        setIsLoadingServerTrx(true);
        let query = supabase
          .from('transactions')
          .select('id,batch_id,note,quantity_pcs,quantity_kgs,transaction_type,destination,user_id,transaction_time')
          .order('transaction_time', { ascending: false });

        if (filterStartDate) {
          query = query.gte('transaction_time', new Date(`${filterStartDate}T00:00:00.000`).toISOString());
        }
        if (filterEndDate) {
          query = query.lte('transaction_time', new Date(`${filterEndDate}T23:59:59.999`).toISOString());
        }
        if (filterType !== 'ALL') {
          query = query.eq('transaction_type', filterType.toLowerCase());
        }
        if (filterDestination !== 'ALL') {
          query = query.eq('destination', filterDestination);
        }

        const { data, error } = await query;
        if (!error && data && isMounted) {
          const mapped: Transaction[] = data.map((item: any) => ({
            id: String(item.id),
            chillerId: String(item.batch_id || 'N/A'),
            itemCode: item.note || undefined,
            userId: item.user_id,
            type: (item.transaction_type || '').toUpperCase() as any,
            destination: item.destination,
            pcs: Number(item.quantity_pcs || 0),
            kgs: Number(item.quantity_kgs || 0),
            timestamp: item.transaction_time ? new Date(item.transaction_time).getTime() : Date.now(),
            note: item.note
          }));
          setServerTransactions(mapped);
        }
      } catch (err) {
        console.warn('Failed to fetch filtered transactions for Reports:', err);
      } finally {
        if (isMounted) setIsLoadingServerTrx(false);
      }
    };

    fetchFilteredTransactions();
    return () => {
      isMounted = false;
    };
  }, [filterStartDate, filterEndDate, filterType, filterDestination, tab]);

  const activeTransactions = useMemo(() => {
    return serverTransactions !== null ? serverTransactions : transactions;
  }, [serverTransactions, transactions]);

  const activeLogs = useMemo(() => {
    if (serverTransactions !== null) {
      return activeTransactions.map((t, idx) => ({
        id: `LOG-${t.id}-${idx}`,
        userId: t.userId,
        action: t.type,
        details: `${t.type} untuk Batch ${t.chillerId} (${t.pcs} Pcs / ${t.kgs.toFixed(2)} Kg)${t.destination ? ` -> ${t.destination}` : ''}`,
        timestamp: t.timestamp
      }));
    }
    return logs;
  }, [serverTransactions, activeTransactions, logs]);

  // Reset page when filters or tab change
  React.useEffect(() => {
    setTrxPage(1);
    setLogsPage(1);
  }, [searchTerm, filterType, filterStartDate, filterEndDate, filterDestination, filterSource, filterPD, tab, trxViewMode]);

  // Fast O(1) item lookup by batchId/chillerId to avoid nested O(N*T) array scans
  const itemsByBatchId = useMemo(() => {
    const map: Record<string, ChillerItem> = {};
    items.forEach(i => {
      map[i.batchId] = i;
    });
    return map;
  }, [items]);

  const itemCodes = useMemo(() => {
    return Array.from(new Set(items.map(i => i.itemCode))).sort();
  }, [items]);

  const allocationData = useMemo(() => {
    if (tab !== 'ALLOCATION') return [];

    const startOfDay = filterStartDate ? new Date(`${filterStartDate}T00:00:00`).getTime() : 0;
    const endOfDay = filterEndDate ? new Date(`${filterEndDate}T23:59:59.999`).getTime() : Infinity;

    // Group items by allocation
    const allocations = Array.from(new Set(items.map(i => i.allocation)));

    return allocations.map(alloc => {
      const batchesInAlloc = items.filter(i => i.allocation === alloc);
      const batchIds = new Set(batchesInAlloc.map(b => b.batchId));

      // Find all OUT transactions for these batches within date range
      const outTrx = activeTransactions.filter(t =>
        t.type === 'OUT' &&
        batchIds.has(t.chillerId) &&
        t.timestamp >= startOfDay &&
        t.timestamp <= endOfDay
      );

      // Group by destination
      const destBreakdown: Record<string, { kgs: number, pcs: number }> = {};
      outTrx.forEach(t => {
        const dest = t.destination || 'Unknown';
        if (!destBreakdown[dest]) destBreakdown[dest] = { kgs: 0, pcs: 0 };
        destBreakdown[dest].kgs += t.kgs;
        destBreakdown[dest].pcs += t.pcs;
      });

      return {
        allocation: alloc,
        totalKgs: outTrx.reduce((sum, t) => sum + t.kgs, 0),
        totalPcs: outTrx.reduce((sum, t) => sum + t.pcs, 0),
        destinations: Object.entries(destBreakdown).map(([name, val]) => ({ name, ...val }))
      };
    }).filter(a => a.totalKgs > 0);
  }, [tab, items, activeTransactions, filterStartDate, filterEndDate]);

  const stockCardData = useMemo(() => {
    if (tab !== 'STOCK_CARD' || !selectedItemCode) return [];

    // Get all transactions for this item code
    // Note: Some transactions might not have itemCode if they were from old batches, 
    // but we can try to find them via chillerId -> item batch mapping
    const batchIdsForItem = new Set(items.filter(i => i.itemCode === selectedItemCode).map(i => i.batchId));

    const relevantTrx = activeTransactions.filter(t =>
      t.itemCode === selectedItemCode || batchIdsForItem.has(t.chillerId)
    ).sort((a, b) => a.timestamp - b.timestamp);

    let runningKgs = 0;
    let runningPcs = 0;

    return relevantTrx.map(t => {
      if (t.type === 'IN' || t.type === 'QC_REJECTED') {
        runningKgs += t.kgs;
        runningPcs += t.pcs;
      } else if (t.type === 'OUT') {
        runningKgs -= t.kgs;
        runningPcs -= t.pcs;
      }

      return {
        ...t,
        balanceKgs: runningKgs,
        balancePcs: runningPcs
      };
    });
  }, [tab, selectedItemCode, activeTransactions, items]);

  const filteredTrx = useMemo(() => {
    return activeTransactions.filter(t => {
      const item = itemsByBatchId[t.chillerId];

      const searchStr = searchTerm.toLowerCase();
      const matchesSearch =
        (item?.itemName || '').toLowerCase().includes(searchStr) ||
        (item?.itemCode || t.itemCode || '').toLowerCase().includes(searchStr) ||
        t.id.toLowerCase().includes(searchStr) ||
        t.chillerId.toLowerCase().includes(searchStr);

      const trxDate = new Date(t.timestamp).toISOString().split('T')[0];
      const matchesStart = !filterStartDate || trxDate >= filterStartDate;
      const matchesEnd = !filterEndDate || trxDate <= filterEndDate;
      const matchesType = filterType === 'ALL' || t.type === filterType;

      const matchesDestination =
        filterDestination === 'ALL' ||
        (t.type === 'OUT' && t.destination === filterDestination);

      const matchesSource =
        filterSource === 'ALL' ||
        (item?.source?.toUpperCase() === filterSource.toUpperCase());

      const matchesPD =
        !filterPD ||
        (item?.productionDate === filterPD);

      return matchesSearch && matchesStart && matchesEnd && matchesType && matchesDestination && matchesSource && matchesPD;
    });
  }, [activeTransactions, itemsByBatchId, searchTerm, filterType, filterStartDate, filterEndDate, filterDestination, filterSource, filterPD]);

  const trxSummary = useMemo(() => {
    let inPcs = 0;
    let inKgs = 0;
    let outPcs = 0;
    let outKgs = 0;
    let qcApprovePcs = 0;
    let qcApproveKgs = 0;
    let qcRejectPcs = 0;
    let qcRejectKgs = 0;

    filteredTrx.forEach(t => {
      if (t.type === 'IN') {
        inPcs += t.pcs || 0;
        inKgs += t.kgs || 0;
      } else if (t.type === 'OUT') {
        outPcs += t.pcs || 0;
        outKgs += t.kgs || 0;
      } else if (t.type === 'QC_APPROVED') {
        qcApprovePcs += t.pcs || 0;
        qcApproveKgs += t.kgs || 0;
      } else if (t.type === 'QC_REJECTED') {
        qcRejectPcs += t.pcs || 0;
        qcRejectKgs += t.kgs || 0;
      }
    });

    return {
      inPcs,
      inKgs,
      outPcs,
      outKgs,
      qcApprovePcs,
      qcApproveKgs,
      qcRejectPcs,
      qcRejectKgs,
      totalCount: filteredTrx.length
    };
  }, [filteredTrx]);

  const itemRecap = useMemo(() => {
    const recap: {
      [itemCode: string]: {
        itemCode: string;
        itemName: string;
        inPcs: number;
        inKgs: number;
        outPcs: number;
        outKgs: number;
        qcApprovePcs: number;
        qcApproveKgs: number;
        qcRejectPcs: number;
        qcRejectKgs: number;
      }
    } = {};

    filteredTrx.forEach(t => {
      const item = itemsByBatchId[t.chillerId];
      const code = t.itemCode || item?.itemCode || 'UNKNOWN';
      const name = item?.itemName || 'Batch Selesai/Keluar';
      if (!recap[code]) {
        recap[code] = {
          itemCode: code,
          itemName: name,
          inPcs: 0,
          inKgs: 0,
          outPcs: 0,
          outKgs: 0,
          qcApprovePcs: 0,
          qcApproveKgs: 0,
          qcRejectPcs: 0,
          qcRejectKgs: 0,
        };
      }
      if (t.type === 'IN') {
        recap[code].inPcs += t.pcs || 0;
        recap[code].inKgs += t.kgs || 0;
      } else if (t.type === 'OUT') {
        recap[code].outPcs += t.pcs || 0;
        recap[code].outKgs += t.kgs || 0;
      } else if (t.type === 'QC_APPROVED') {
        recap[code].qcApprovePcs += t.pcs || 0;
        recap[code].qcApproveKgs += t.kgs || 0;
      } else if (t.type === 'QC_REJECTED') {
        recap[code].qcRejectPcs += t.pcs || 0;
        recap[code].qcRejectKgs += t.kgs || 0;
      }
    });

    return Object.values(recap).sort((a, b) => a.itemCode.localeCompare(b.itemCode));
  }, [filteredTrx, itemsByBatchId]);

  const filteredLogs = useMemo(() => {
    return activeLogs.filter(l =>
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.details.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [activeLogs, searchTerm]);

  // Client-side paginate lists to keep performance ultra-high even with massive counts
  const visibleTrx = useMemo(() => {
    return filteredTrx.slice(0, trxPage * ITEMS_PER_PAGE);
  }, [filteredTrx, trxPage]);

  const visibleLogs = useMemo(() => {
    return filteredLogs.slice(0, logsPage * ITEMS_PER_PAGE);
  }, [filteredLogs, logsPage]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterType('ALL');
    setFilterStartDate(getTodayString());
    setFilterEndDate(getTodayString());
    setFilterDestination('ALL');
    setFilterSource('ALL');
    setFilterPD('');
  };

  const downloadPDF = () => {
    setIsExporting(true);
    // Give state change a tiny tick to render
    setTimeout(() => {
      const element = document.getElementById('reports-print-template');
      if (!element) {
        setIsExporting(false);
        return;
      }

      let titleLabel = 'LAPORAN';
      if (tab === 'TRANSACTIONS') titleLabel = 'MUTASI_TRANSAKSI';
      else if (tab === 'STOCK_CARD') titleLabel = `KARTU_STOK_${selectedItemCode || 'SEMUA'}`;
      else if (tab === 'ALLOCATION') titleLabel = 'DISTRIBUSI_ALOKASI';
      else if (tab === 'LOGS') titleLabel = 'LOG_AKTIVITAS';

      const dateLabel = filterStartDate && filterEndDate
        ? `${filterStartDate}_to_${filterEndDate}`
        : filterStartDate
          ? `dari_${filterStartDate}`
          : filterEndDate
            ? `sampai_${filterEndDate}`
            : 'Semua_Waktu';

      const opt = {
        margin: [12, 12, 12, 12],
        filename: `BSI_CMS_Laporan_${titleLabel}_${dateLabel}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      html2pdf().set(opt).from(element).save().then(() => {
        setIsExporting(false);
      }).catch((err: any) => {
        console.error(err);
        setIsExporting(false);
      });
    }, 150);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Audit Trail & Mutasi</h2>
          <p className="text-sm text-gray-500 font-medium">Rekaman riwayat pergerakan chiller</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto">
            <button onClick={() => setTab('TRANSACTIONS')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'TRANSACTIONS' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>TRANSAKSI</button>
            <button onClick={() => setTab('STOCK_CARD')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'STOCK_CARD' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>KARTU STOK</button>
            <button onClick={() => setTab('ALLOCATION')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'ALLOCATION' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>LAP. ALOKASI</button>
            <button onClick={() => setTab('LOGS')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'LOGS' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>LOG SISTEM</button>
          </div>
          <button
            type="button"
            onClick={downloadPDF}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer outline-none shrink-0"
            title="Download PDF Laporan"
          >
            <FileText size={14} />
            <span>Download PDF</span>
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        {tab === 'TRANSACTIONS' ? (
          <div className="space-y-4">
            {/* Row 1: Search, Type, Start Date, End Date */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4 relative flex items-center">
                <Search className="absolute left-3 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Cari Batch ID atau Produk..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <select
                  className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600 h-10"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                >
                  <option value="ALL">SEMUA TIPE</option>
                  <option value="IN">MASUK (IN)</option>
                  <option value="OUT">KELUAR (OUT)</option>
                  <option value="QC_APPROVED">QC APPROVED</option>
                  <option value="QC_REJECTED">QC REJECTED</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <div className="relative">
                  <input
                    type="date"
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600 h-10"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    title="Tanggal Awal Transaksi"
                  />
                  <span className="absolute -top-2.5 left-2.5 bg-white px-1 text-[7px] font-extrabold text-gray-400 uppercase tracking-widest scale-90">Mulai Waktu</span>
                </div>
              </div>
              <div className="md:col-span-3">
                <div className="relative">
                  <input
                    type="date"
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600 h-10"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    title="Tanggal Akhir Transaksi"
                  />
                  <span className="absolute -top-2.5 left-2.5 bg-white px-1 text-[7px] font-extrabold text-gray-400 uppercase tracking-widest scale-90">Sampai Waktu</span>
                </div>
              </div>
            </div>

            {/* Row 2: Filter Source, Filter PD, Filter Tujuan Keluar, Reset */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-gray-100">
              <div className="md:col-span-3">
                <div className="relative">
                  <select
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600 h-10"
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                  >
                    <option value="ALL">SEMUA SUMBER</option>
                    <option value="PDS">PDS</option>
                    <option value="FPS">FPS</option>
                    <option value="PARTING">PARTING</option>
                    <option value="MARINASI">MARINASI</option>
                    <option value="BONELESS">BONELESS</option>
                    <option value="SO FRESH">SO FRESH</option>
                    <option value="IQF">IQF</option>
                    <option value="RETUR">RETUR</option>
                    <option value="SMS">SMS</option>
                    <option value="CS">CS</option>
                  </select>
                  <span className="absolute -top-2.5 left-2.5 bg-white px-1 text-[7px] font-extrabold text-gray-400 uppercase tracking-widest scale-90">Sumber (Source)</span>
                </div>
              </div>
              <div className="md:col-span-3">
                <div className="relative">
                  <input
                    type="date"
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600 h-10"
                    value={filterPD}
                    onChange={(e) => setFilterPD(e.target.value)}
                    title="Filter berdasarkan Tanggal Produksi"
                  />
                  <span className="absolute -top-2.5 left-2.5 bg-white px-1 text-[7px] font-extrabold text-gray-400 uppercase tracking-widest scale-90">Filter PD (Tgl Produksi)</span>
                </div>
              </div>
              <div className="md:col-span-3">
                <div className="relative">
                  <select
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600 h-10"
                    value={filterDestination}
                    onChange={(e) => setFilterDestination(e.target.value)}
                  >
                    <option value="ALL">SEMUA TUJUAN KELUAR</option>
                    <option value="Boneless">BONELESS</option>
                    <option value="Parting">PARTING</option>
                    <option value="Marinasi">MARINASI</option>
                    <option value="Thowing">THOWING</option>
                    <option value="FPS">FPS</option>
                    <option value="Condem">CONDEM / AFKIR</option>
                    <option value="CS">COLD STORAGE (CS)</option>
                    <option value="Delive">DELIVERY / KIRIM</option>
                    <option value="SMS">SMS</option>
                    <option value="IQF">IQF</option>
                    <option value="Retur">RETUR</option>
                  </select>
                  <span className="absolute -top-2.5 left-2.5 bg-white px-1 text-[7px] font-extrabold text-gray-400 uppercase tracking-widest scale-90">Tujuan Keluar (OUT)</span>
                </div>
              </div>
              <div className="md:col-span-3 flex items-end">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="w-full h-10 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl text-[10px] font-black uppercase transition-all tracking-wider active:scale-95 cursor-pointer flex items-center justify-center"
                >
                  RESET SARINGAN
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {tab === 'LOGS' ? (
              <div className="md:col-span-8 relative flex items-center">
                <Search className="absolute left-3 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Cari Log Aktivitas..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            ) : tab === 'STOCK_CARD' ? (
              <div className="md:col-span-8">
                <select
                  className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600 h-10"
                  value={selectedItemCode}
                  onChange={(e) => setSelectedItemCode(e.target.value)}
                >
                  <option value="">PILIH KODE ITEM UNTUK LIHAT RIWAYAT...</option>
                  {itemCodes.map(code => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="md:col-span-4 flex items-center">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filter Tanggal Alokasi:</span>
              </div>
            )}

            {tab === 'ALLOCATION' && (
              <>
                <div className="md:col-span-3">
                  <input
                    type="date"
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600 h-10"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </div>
                <div className="md:col-span-3">
                  <input
                    type="date"
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600 h-10"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className={tab === 'ALLOCATION' ? "md:col-span-2" : "md:col-span-4"}>
              <button
                type="button"
                onClick={resetFilters}
                className="w-full h-10 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl text-[10px] font-black uppercase transition-all tracking-wider active:scale-95 cursor-pointer flex items-center justify-center"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      <div id="reports-export-area" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-0">
        {isExporting && (
          <div className="border-b-2 border-red-600 pb-4 mb-6 px-6 pt-6 animate-in fade-in">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-black text-gray-900 tracking-tight">BOUNTY SEGAR INDONESIA (BSI)</h1>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Chiller Management System (CMS)</p>
                <p className="text-[9px] text-gray-400">Gudang Penyimpanan Dingin & Logistik</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-full uppercase tracking-wider border border-red-100">
                  LAPORAN RESMI
                </span>
                <p className="text-[9px] text-gray-400 mt-2 font-medium">Tanggal Cetak: {new Date().toLocaleString('id-ID')}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
              <div>
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Jenis Laporan</span>
                <p className="text-[11px] font-bold text-gray-800 uppercase">
                  {tab === 'TRANSACTIONS' ? 'Laporan Mutasi Transaksi Masuk/Keluar' :
                    tab === 'STOCK_CARD' ? `Kartu Riwayat Stok Item: ${selectedItemCode || 'Semua'}` :
                      tab === 'ALLOCATION' ? 'Laporan Distribusi Alokasi' : 'Log Audit Aktivitas Sistem'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Periode Saringan</span>
                <p className="text-[11px] font-bold text-gray-800">
                  {filterStartDate && filterEndDate ? `${filterStartDate} s/d ${filterEndDate}` :
                    filterStartDate ? `Dari ${filterStartDate}` :
                      filterEndDate ? `Sampai ${filterEndDate}` : 'Seluruh Waktu Database'}
                </p>
              </div>
            </div>
          </div>
        )}
        {tab === 'TRANSACTIONS' ? (
          <div>
            {/* SUM TOTALS PANEL FOR FILTERED TRANSACTIONS */}
            <div className="p-4 bg-gray-50/50 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center font-bold text-xs border border-green-100">
                  IN
                </div>
                <div>
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total Masuk (IN)</p>
                  <p className="text-xs font-black text-gray-800">{formatNumber(trxSummary.inPcs, 0)} <span className="text-[10px] text-gray-400 font-bold">Pcs</span></p>
                  <p className="text-[11px] font-extrabold text-green-600">{formatNumber(trxSummary.inKgs, 2)} <span className="text-[9px] text-gray-400 font-bold">Kg</span></p>
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100">
                  OUT
                </div>
                <div>
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total Keluar (OUT)</p>
                  <p className="text-xs font-black text-gray-800">{formatNumber(trxSummary.outPcs, 0)} <span className="text-[10px] text-gray-400 font-bold">Pcs</span></p>
                  <p className="text-[11px] font-extrabold text-blue-600">{formatNumber(trxSummary.outKgs, 2)} <span className="text-[9px] text-gray-400 font-bold">Kg</span></p>
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs border border-emerald-100">
                  QC
                </div>
                <div>
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">QC APPROVED</p>
                  <p className="text-xs font-black text-gray-800">{formatNumber(trxSummary.qcApprovePcs, 0)} <span className="text-[10px] text-gray-400 font-bold">Pcs</span></p>
                  <p className="text-[11px] font-extrabold text-emerald-600">{formatNumber(trxSummary.qcApproveKgs, 2)} <span className="text-[9px] text-gray-400 font-bold">Kg</span></p>
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold text-xs border border-red-100">
                  REJ
                </div>
                <div>
                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">QC REJECTED</p>
                  <p className="text-xs font-black text-gray-800">{formatNumber(trxSummary.qcRejectPcs, 0)} <span className="text-[10px] text-gray-400 font-bold">Pcs</span></p>
                  <p className="text-[11px] font-extrabold text-red-600">{formatNumber(trxSummary.qcRejectKgs, 2)} <span className="text-[9px] text-gray-400 font-bold">Kg</span></p>
                </div>
              </div>
            </div>

            {/* VIEW MODE SWITCHER */}
            <div data-html2canvas-ignore="true" className="p-4 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setTrxViewMode('BATCH')}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer ${trxViewMode === 'BATCH'
                    ? 'bg-white text-red-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                  Rekap Per Batch
                </button>
                <button
                  type="button"
                  onClick={() => setTrxViewMode('ITEM')}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer ${trxViewMode === 'ITEM'
                    ? 'bg-white text-red-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                  Rekap Per Item
                </button>
              </div>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                {trxViewMode === 'BATCH' ? `${filteredTrx.length} Transaksi Batch` : `${itemRecap.length} Item Terkait`}
              </span>
            </div>

            {trxViewMode === 'BATCH' ? (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Batch ID</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Aktivitas</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">User</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Volume</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Waktu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {visibleTrx.length > 0 ? (
                        visibleTrx.map((trx, idx) => {
                          const item = itemsByBatchId[trx.chillerId];
                          return (
                            <tr key={`${trx.id}-${idx}`} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="text-[10px] font-black text-red-600 uppercase tracking-tighter">{trx.chillerId}</div>
                                <div className="text-[11px] font-bold text-gray-800 uppercase">{trx.itemCode || item?.itemCode || 'Batch Selesai/Keluar'}</div>
                                {item?.source && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    <span className="bg-red-50 text-red-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-red-100">
                                      S: {item.source}
                                    </span>
                                    {item.allocation && (
                                      <span className="bg-blue-50 text-blue-600 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-blue-100">
                                        A: {item.allocation}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${trx.type === 'IN' ? 'bg-green-100 text-green-700' :
                                  trx.type === 'OUT' ? 'bg-blue-100 text-blue-700' :
                                    trx.type.includes('APPROVED') ? 'bg-emerald-100 text-emerald-700' :
                                      'bg-red-100 text-red-700'
                                  }`}>
                                  {trx.type.replace('_', ' ')} {trx.destination && `→ ${trx.destination}`}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <UserIcon size={12} className="text-gray-400" />
                                  <span className="text-xs font-bold text-gray-600 uppercase">{getUserDisplayName(trx.userId)}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="text-xs font-black text-gray-800">{formatNumber(trx.pcs, 0)} Pcs</div>
                                <div className="text-[10px] font-bold text-gray-400">{formatNumber(trx.kgs, 2)} Kg</div>
                              </td>
                              <td className="px-6 py-4 text-right text-[10px] font-bold text-gray-400">
                                {new Date(trx.timestamp).toLocaleString('id-ID', { hour12: false })}
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-black uppercase text-[10px]">Data tidak ditemukan</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredTrx.length > visibleTrx.length && (
                  <div data-html2canvas-ignore="true" className="p-4 flex justify-center border-t border-gray-100 bg-gray-50/50">
                    <button
                      type="button"
                      onClick={() => setTrxPage(prev => prev + 1)}
                      className="px-6 py-2 bg-white hover:bg-gray-100 text-red-600 font-black text-xs uppercase tracking-wider rounded-xl border-2 border-red-50 hover:border-red-100 transition-all shadow-md flex items-center gap-2 active:scale-95 cursor-pointer outline-none"
                    >
                      Lihat Lebih Banyak ({filteredTrx.length - visibleTrx.length} sisa)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Produk / Item</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Masuk (IN)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Keluar (OUT)</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">QC Approved</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">QC Rejected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {itemRecap.length > 0 ? (
                        itemRecap.map(recap => (
                          <tr key={recap.itemCode} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="text-[10px] font-black text-gray-900 uppercase tracking-tight">{recap.itemCode}</div>
                              <div className="text-xs font-bold text-gray-500">{recap.itemName}</div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {recap.inPcs > 0 || recap.inKgs > 0 ? (
                                <>
                                  <div className="text-xs font-black text-green-600">{formatNumber(recap.inPcs, 0)} Pcs</div>
                                  <div className="text-[10px] font-bold text-green-500/80">{formatNumber(recap.inKgs, 2)} Kg</div>
                                </>
                              ) : (
                                <span className="text-[10px] text-gray-300 font-extrabold">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {recap.outPcs > 0 || recap.outKgs > 0 ? (
                                <>
                                  <div className="text-xs font-black text-blue-600">{formatNumber(recap.outPcs, 0)} Pcs</div>
                                  <div className="text-[10px] font-bold text-blue-500/80">{formatNumber(recap.outKgs, 2)} Kg</div>
                                </>
                              ) : (
                                <span className="text-[10px] text-gray-300 font-extrabold">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {recap.qcApprovePcs > 0 || recap.qcApproveKgs > 0 ? (
                                <>
                                  <div className="text-xs font-black text-emerald-600">{formatNumber(recap.qcApprovePcs, 0)} Pcs</div>
                                  <div className="text-[10px] font-bold text-emerald-500/80">{formatNumber(recap.qcApproveKgs, 2)} Kg</div>
                                </>
                              ) : (
                                <span className="text-[10px] text-gray-300 font-extrabold">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              {recap.qcRejectPcs > 0 || recap.qcRejectKgs > 0 ? (
                                <>
                                  <div className="text-xs font-black text-red-600">{formatNumber(recap.qcRejectPcs, 0)} Pcs</div>
                                  <div className="text-[10px] font-bold text-red-500/80">{formatNumber(recap.qcRejectKgs, 2)} Kg</div>
                                </>
                              ) : (
                                <span className="text-[10px] text-gray-300 font-extrabold">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-black uppercase text-[10px]">Data tidak ditemukan</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : tab === 'ALLOCATION' ? (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allocationData.length > 0 ? (
                allocationData.map((alloc, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
                    <div className="bg-red-600 p-4 text-white">
                      <h4 className="text-sm font-black uppercase tracking-widest">{alloc.allocation}</h4>
                      <p className="text-[10px] font-bold opacity-70 mt-1">Total Distribusi</p>
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 pb-4">
                        <div>
                          <p className="text-[8px] font-black text-gray-400 uppercase">Total Berat</p>
                          <p className="text-sm font-black text-gray-800">{formatNumber(alloc.totalKgs, 2)} Kg</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-gray-400 uppercase">Total Qty</p>
                          <p className="text-sm font-black text-gray-800">{formatNumber(alloc.totalPcs, 0)} Pcs</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Breakdown Tujuan:</p>
                        <div className="space-y-2">
                          {alloc.destinations.map((dest, dIdx) => (
                            <div key={dIdx} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-gray-100">
                              <span className="text-[10px] font-black text-gray-700 uppercase">{dest.name}</span>
                              <div className="text-right">
                                <div className="text-[10px] font-black text-red-600">{formatNumber(dest.kgs, 2)} Kg</div>
                                <div className="text-[8px] font-bold text-gray-400">{formatNumber(dest.pcs, 0)} Pcs</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-20 text-center text-gray-400">
                  <Activity size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest">Tidak ada data distribusi untuk periode ini</p>
                </div>
              )}
            </div>
          </div>
        ) : tab === 'STOCK_CARD' ? (
          <div className="overflow-x-auto">
            {!selectedItemCode ? (
              <div className="px-6 py-20 text-center text-gray-400">
                <Package size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest">Pilih Kode Item untuk melihat riwayat pergerakan</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Batch ID</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipe</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Masuk</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Keluar</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right bg-gray-100/50">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stockCardData.length > 0 ? (
                    stockCardData.map((trx, idx) => (
                      <tr key={trx.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-[10px] font-bold text-gray-500">
                          {new Date(trx.timestamp).toLocaleString('id-ID', { hour12: false })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[10px] font-black text-red-600 uppercase tracking-tighter">{trx.chillerId}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${trx.type === 'IN' ? 'bg-green-100 text-green-700' :
                            trx.type === 'OUT' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                            {trx.type} {trx.destination && `→ ${trx.destination}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {(trx.type === 'IN' || trx.type === 'QC_REJECTED') ? (
                            <div className="text-xs font-black text-green-600">+{formatNumber(trx.kgs, 2)} <span className="text-[8px] text-gray-400">Kg</span></div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {trx.type === 'OUT' ? (
                            <div className="text-xs font-black text-blue-600">-{formatNumber(trx.kgs, 2)} <span className="text-[8px] text-gray-400">Kg</span></div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right bg-gray-50/30">
                          <div className="text-xs font-black text-gray-900">{formatNumber(trx.balanceKgs, 2)} <span className="text-[8px] text-gray-400">Kg</span></div>
                          <div className="text-[9px] font-bold text-gray-400">{formatNumber(trx.balancePcs, 0)} Pcs</div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-black uppercase text-[10px]">Tidak ada riwayat untuk item ini</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div>
            <div className="divide-y divide-gray-100">
              {visibleLogs.length > 0 ? (
                visibleLogs.map((log, idx) => (
                  <div key={`${log.id}-${idx}`} className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Activity size={16} /></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-red-600 uppercase">{log.action}</span>
                        <span className="text-[10px] font-bold text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-sm font-bold text-gray-700">{log.details}</p>
                      <span className="text-[9px] font-bold text-gray-400 uppercase">User: {getUserDisplayName(log.userId)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-12 text-center text-gray-400 font-black uppercase text-[10px]">Log tidak ditemukan</div>
              )}
            </div>

            {filteredLogs.length > visibleLogs.length && (
              <div data-html2canvas-ignore="true" className="p-4 flex justify-center border-t border-gray-100 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => setLogsPage(prev => prev + 1)}
                  className="px-6 py-2 bg-white hover:bg-gray-100 text-red-600 font-black text-xs uppercase tracking-wider rounded-xl border-2 border-red-50 hover:border-red-100 transition-all shadow-md flex items-center gap-2 active:scale-95 cursor-pointer outline-none"
                >
                  Lihat Lebih Banyak ({filteredLogs.length - visibleLogs.length} sisa)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* PRO-GRADE CORPORATION PRINT-OPTIMIZED DOCUMENT TEMPLATE    */}
      {/* ========================================================= */}
      <div style={{ position: 'absolute', left: '-9999px', top: -9999, width: '800px', zIndex: -50 }} className="bg-white">
        <div id="reports-print-template" className="p-10 bg-white text-slate-800 space-y-8 font-sans">

          {/* Header & Letterhead Block */}
          <div className="border-b-4 border-red-600 pb-5">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">BOUNTY SEGAR INDONESIA</h1>
                <p className="text-[11px] font-bold text-gray-500 tracking-widest uppercase mt-0.5">Chiller Management System (CMS)</p>
                <p className="text-[9px] text-gray-400 mt-1">Gudang Logistik & Penyimpanan Rantai Dingin (Cold-Chain Warehouse & Logistics)</p>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-extrabold text-red-600 bg-red-50 px-3 py-1 rounded-full uppercase tracking-widest border border-red-100">
                  {tab === 'TRANSACTIONS' ? 'LAPORAN MUTASI' :
                    tab === 'ALLOCATION' ? 'RESUME DISTRIBUSI' :
                      tab === 'STOCK_CARD' ? 'KARTU STOK' : 'LOG AUDIT AKTIVITAS'}
                </span>
                <p className="text-[9px] text-gray-400 mt-3 font-medium">No Dokumen: BSI/CMS/RPT/{Date.now().toString().slice(-6)}</p>
                <p className="text-[9px] text-gray-400 font-medium">Tanggal Cetak: {new Date().toLocaleString('id-ID', { hour12: false })}</p>
              </div>
            </div>

            {/* Document Meta Information */}
            <div className="mt-5 grid grid-cols-2 gap-4 text-[10px] bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div>
                <span className="font-extrabold text-gray-400 uppercase tracking-wider block text-[8px]">Kategori Dokumen Resmi</span>
                <span className="font-bold text-gray-800 uppercase">
                  {tab === 'TRANSACTIONS' ? 'Laporan Riwayat Mutasi Transaksi Barang Masuk & Keluar' :
                    tab === 'STOCK_CARD' ? `Kartu Riwayat Stok Material: ${selectedItemCode || 'Semua Item'}` :
                      tab === 'ALLOCATION' ? 'Detail Laporan Distribusi Alokasi Kategori' : 'Log Audit Sistem & Rekam Jejak Operator'}
                </span>
              </div>
              <div className="text-right">
                <span className="font-extrabold text-gray-400 uppercase tracking-wider block text-[8px]">Periode Laporan Aktif</span>
                <span className="font-bold text-red-600">
                  {filterStartDate && filterEndDate ? `${filterStartDate} s/d ${filterEndDate}` :
                    filterStartDate ? `Dari ${filterStartDate}` :
                      filterEndDate ? `Sampai ${filterEndDate}` : 'Seluruh Database Riwayat'}
                </span>
              </div>
            </div>
          </div>

          {/* Conditional Sections based on Tab states */}
          {tab === 'TRANSACTIONS' && (
            <div className="space-y-4">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between">
                <span>RIWAYAT TRANSAKSI MUTASI LENGKAP (MAX 50 TRANSAKSI TERAKHIR)</span>
                <span className="text-[9px] text-gray-400 font-bold lowercase">Urut Kronologis</span>
              </h2>

              <table className="w-full text-left text-[9px] border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 uppercase tracking-wider">
                    <th className="p-2 border-r border-slate-200">Batch ID</th>
                    <th className="p-2 border-r border-slate-200">Kode Item</th>
                    <th className="p-2 border-r border-slate-200">Aktivitas</th>
                    <th className="p-2 border-r border-slate-200 text-right">Volume (Pcs)</th>
                    <th className="p-2 border-r border-slate-200 text-right">Berat (Kgs)</th>
                    <th className="p-2 border-r border-slate-200">Operator</th>
                    <th className="p-2">Waktu Transaksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTrx.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400 uppercase font-bold">Tidak ada data transaksi mutasi</td>
                    </tr>
                  ) : (
                    filteredTrx.slice(0, 50).map((t) => {
                      const item = itemsByBatchId[t.chillerId];
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/50">
                          <td className="p-2 font-mono font-bold text-red-600 border-r border-slate-200">{t.chillerId}</td>
                          <td className="p-2 font-sans font-bold text-slate-700 border-r border-slate-200">
                            <div>{t.itemCode || item?.itemCode || 'N/A'}</div>
                            {item?.source && (
                              <div className="text-[7px] text-slate-400 mt-1 font-semibold">
                                S: {item.source} | A: {item.allocation}
                              </div>
                            )}
                          </td>
                          <td className="p-2 border-r border-slate-200">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${t.type === 'IN' ? 'bg-green-100 text-green-700' :
                              t.type === 'OUT' ? 'bg-blue-100 text-blue-700' :
                                'bg-orange-100 text-orange-700'
                              }`}>
                              {t.type} {t.destination ? `→ ${t.destination}` : ''}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono text-slate-800 border-r border-slate-200">{formatNumber(t.pcs, 0)}</td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900 border-r border-slate-200">{formatNumber(t.kgs, 2)}</td>
                          <td className="p-2 font-bold text-slate-600 border-r border-slate-200 uppercase">{getUserDisplayName(t.userId)}</td>
                          <td className="p-2 text-slate-400 font-mono">{new Date(t.timestamp).toLocaleString('id-ID', { hour12: false })}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {filteredTrx.length > 50 && (
                <p className="text-[8px] text-gray-400 italic text-right">* Data dibatasi pada 50 transaksi mutasi terbaru untuk estetika layout cetak.</p>
              )}
            </div>
          )}

          {tab === 'ALLOCATION' && (
            <div className="space-y-4">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5">
                TABEL RESUME DISTRIBUSI ALOKASI
              </h2>

              <table className="w-full text-left text-[9px] border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 uppercase tracking-wider">
                    <th className="p-2 border-r border-slate-200">Kategori Alokasi</th>
                    <th className="p-2 border-r border-slate-200">Destinasi Detail</th>
                    <th className="p-2 border-r border-slate-200 text-right">Volume (Pcs)</th>
                    <th className="p-2 text-right font-bold">Total Berat (Kgs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allocationData.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400 uppercase font-bold">Tidak ada data alokasi distribusi</td>
                    </tr>
                  ) : (
                    allocationData.map((alloc) => (
                      <React.Fragment key={alloc.allocation}>
                        {alloc.destinations.map((dest, dIdx) => (
                          <tr key={dIdx} className="hover:bg-slate-50/50">
                            {dIdx === 0 ? (
                              <td rowSpan={alloc.destinations.length} className="p-2 font-bold text-red-700 border-r border-slate-200 bg-red-50/10 align-middle">
                                <div className="uppercase">{alloc.allocation}</div>
                                <div className="text-[8px] text-gray-400 mt-1 font-medium">Accum: {formatNumber(alloc.totalKgs, 2)} Kg</div>
                              </td>
                            ) : null}
                            <td className="p-2 border-r border-slate-200 uppercase font-bold text-slate-600">{dest.name}</td>
                            <td className="p-2 text-right font-mono text-slate-800 border-r border-slate-200">{formatNumber(dest.pcs, 0)}</td>
                            <td className="p-2 text-right font-mono font-black text-red-600">{formatNumber(dest.kgs, 2)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'STOCK_CARD' && (
            <div className="space-y-4">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between">
                <span>RIWAYAT KARTU STOK INDIVIDUAL (MAX 50 BARIS TERAKHIR)</span>
                <span className="text-[9px] text-gray-400 font-bold uppercase font-mono">Bahan: {selectedItemCode || 'Belum Dipilih'}</span>
              </h2>

              <table className="w-full text-left text-[9px] border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 uppercase tracking-wider">
                    <th className="p-2 border-r border-slate-200">Waktu Kejadian</th>
                    <th className="p-2 border-r border-slate-200">ID Batch (Uraian)</th>
                    <th className="p-2 border-r border-slate-200">Tipe Mutasi</th>
                    <th className="p-2 border-r border-slate-200 text-right">Debit Masuk (Kg)</th>
                    <th className="p-2 border-r border-slate-200 text-right">Kredit Keluar (Kg)</th>
                    <th className="p-2 bg-slate-100 text-slate-800 text-right font-bold">Saldo Akhir (Kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {!selectedItemCode ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400 uppercase font-bold">Pilih item material secara dinamis pada aplikasi web untuk merender kartu stok</td>
                    </tr>
                  ) : stockCardData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-400 uppercase font-bold">Tidak ada riwayat untuk material ini</td>
                    </tr>
                  ) : (
                    stockCardData.slice(0, 50).map((trx) => (
                      <tr key={trx.id} className="hover:bg-slate-50/50">
                        <td className="p-2 text-slate-400 font-mono border-r border-slate-200">{new Date(trx.timestamp).toLocaleString('id-ID', { hour12: false })}</td>
                        <td className="p-2 font-mono font-bold text-red-600 border-r border-slate-200">{trx.chillerId}</td>
                        <td className="p-2 border-r border-slate-200">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${trx.type === 'IN' ? 'bg-green-100 text-green-700' :
                            trx.type === 'OUT' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                            {trx.type} {trx.destination ? `→ ${trx.destination}` : ''}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono text-green-700 font-bold border-r border-slate-200">
                          {(trx.type === 'IN' || trx.type === 'QC_REJECTED') ? `+${formatNumber(trx.kgs, 2)}` : '-'}
                        </td>
                        <td className="p-2 text-right font-mono text-blue-700 font-bold border-r border-slate-200">
                          {trx.type === 'OUT' ? `-${formatNumber(trx.kgs, 2)}` : '-'}
                        </td>
                        <td className="p-2 text-right font-mono font-black text-slate-900 bg-slate-50/40">
                          {formatNumber(trx.balanceKgs, 2)} Kg / <span className="text-[8px] text-gray-400">{formatNumber(trx.balancePcs, 0)} Pcs</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {stockCardData.length > 50 && (
                <p className="text-[8px] text-gray-400 italic text-right">* Data stock card dibatasi pada 50 records terbaru.</p>
              )}
            </div>
          )}

          {tab === 'LOGS' && (
            <div className="space-y-4">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between">
                <span>RIWAYAT AUDIT LOGS AKTIVITAS OPERASIONAL (MAX 40 BARIS TERAKHIR)</span>
                <span className="text-[9px] text-gray-400 font-bold lowercase">Keamanan Portal</span>
              </h2>

              <table className="w-full text-left text-[9px] border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 uppercase tracking-wider">
                    <th className="p-2 border-r border-slate-200">Waktu Kejadian</th>
                    <th className="p-2 border-r border-slate-200">Tipe Modul</th>
                    <th className="p-2 border-r border-slate-200">Uraian Kasus Log</th>
                    <th className="p-2">Identitas User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400 uppercase font-bold">Tidak ada log sistem terekam</td>
                    </tr>
                  ) : (
                    filteredLogs.slice(0, 40).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="p-2 text-slate-400 font-mono border-r border-slate-200">{new Date(log.timestamp).toLocaleString('id-ID', { hour12: false })}</td>
                        <td className="p-2 font-black text-red-600 border-r border-slate-200 uppercase tracking-tighter">{log.action}</td>
                        <td className="p-2 font-bold text-slate-700 border-r border-slate-200">{log.details}</td>
                        <td className="p-2 font-extrabold text-slate-600 uppercase">{getUserDisplayName(log.userId)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {filteredLogs.length > 40 && (
                <p className="text-[8px] text-gray-400 italic text-right">* Logs dibatasi pada 40 record terbaru.</p>
              )}
            </div>
          )}


          {/* Professional Footer Notice */}
          <div className="pt-6 border-t border-slate-200 flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase tracking-wider">
            <span>BOUNTY SEGAR INDONESIA (BSI) CMS REGISTERED OFFICIAL AUDIT SHEET</span>
            <span>Halaman 1 dari 1</span>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Reports;
