import React, { useState, useMemo } from 'react';
import { ChillerItem, ViewState, Transaction } from '../types';
import { formatNumber } from '../utils';
import {
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertCircle,
  Clock,
  ChevronRight,
  ThermometerSnowflake,
  Calendar,
  Filter,
  Layers,
  TrendingDown,
  TrendingUp,
  Tag,
  Boxes,
  Activity,
  ChevronLast,
  ArrowRightLeft,
  FileText,
  X,
  Search
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

declare const html2pdf: any;

interface DashboardProps {
  items: ChillerItem[];
  transactions: Transaction[];
  onNavigate: (view: ViewState) => void;
}

type FilterPeriod = 'TODAY' | 'SINGLE_DATE' | 'RANGE' | 'GLOBAL';

const Dashboard: React.FC<DashboardProps> = ({ items, transactions, onNavigate }) => {
  // Filter States
  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('TODAY');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [isExporting, setIsExporting] = useState(false);
  const [activeDetailsModal, setActiveDetailsModal] = useState<'STOK_CHILLER' | 'BARANG_MASUK' | 'BARANG_KELUAR' | 'NET_FLOW' | null>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [chillerModalTab, setChillerModalTab] = useState<'PRODUCTS' | 'BATCHES'>('PRODUCTS');

  const downloadPDF = () => {
    setIsExporting(true);
    // Give state change a tiny tick to render
    setTimeout(() => {
      const element = document.getElementById('dashboard-print-template');
      if (!element) {
        setIsExporting(false);
        return;
      }

      const dateLabel = filterPeriod === 'TODAY' ? 'Hari_Ini' :
        filterPeriod === 'SINGLE_DATE' ? `Tanggal_${selectedDate}` :
          filterPeriod === 'RANGE' ? `Rentang_${startDate}_ke_${endDate}` : 'Global';

      const opt = {
        margin: [12, 12, 12, 12],
        filename: `BSI_CMS_Laporan_Eksekutif_${dateLabel}.pdf`,
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

  // Calculate current database timestamp ranges
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const tDate = new Date(t.timestamp);
      const tYr = tDate.getFullYear();
      const tMon = tDate.getMonth();
      const tDay = tDate.getDate();

      if (filterPeriod === 'TODAY') {
        const today = new Date();
        return (
          tYr === today.getFullYear() &&
          tMon === today.getMonth() &&
          tDay === today.getDate()
        );
      } else if (filterPeriod === 'SINGLE_DATE') {
        if (!selectedDate) return true;
        const target = new Date(selectedDate);
        return (
          tYr === target.getFullYear() &&
          tMon === target.getMonth() &&
          tDay === target.getDate()
        );
      } else if (filterPeriod === 'RANGE') {
        if (!startDate || !endDate) return true;
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        return t.timestamp >= start.getTime() && t.timestamp <= end.getTime();
      }
      return true; // GLOBAL
    });
  }, [transactions, filterPeriod, selectedDate, startDate, endDate]);

  // Current Realtime Stocks inside Chiller
  const inChiller = useMemo(() => {
    return items.filter(i => i.status === 'IN_CHILLER');
  }, [items]);

  const totalStockWeight = useMemo(() => {
    return inChiller.reduce((sum, i) => sum + i.kgs, 0);
  }, [inChiller]);

  const totalStockPcs = useMemo(() => {
    return inChiller.reduce((sum, i) => sum + i.pcs, 0);
  }, [inChiller]);

  // Unique item codes on stock
  const uniqueItemsInStock = useMemo(() => {
    return new Set(inChiller.map(i => i.itemCode || 'N/A')).size;
  }, [inChiller]);

  // Calculations under the active filter period
  const loadingMetrics = useMemo(() => {
    let inflowPcs = 0;
    let inflowKgs = 0;
    const inflowUniqueCodes = new Set<string>();

    let outflowPcs = 0;
    let outflowKgs = 0;
    const outflowUniqueCodes = new Set<string>();

    filteredTransactions.forEach(t => {
      const code = t.itemCode || 'UNKNOWN';
      if (t.type === 'IN') {
        inflowPcs += t.pcs;
        inflowKgs += t.kgs;
        inflowUniqueCodes.add(code);
      } else if (t.type === 'OUT') {
        outflowPcs += t.pcs;
        outflowKgs += t.kgs;
        outflowUniqueCodes.add(code);
      }
    });

    return {
      inflowPcs,
      inflowKgs,
      inflowUniqueCount: inflowUniqueCodes.size,
      outflowPcs,
      outflowKgs,
      outflowUniqueCount: outflowUniqueCodes.size,
    };
  }, [filteredTransactions]);

  // Grouping data for dynamic trend chart based on the chosen period
  const chartData = useMemo(() => {
    const result = [];

    if (filterPeriod === 'TODAY' || filterPeriod === 'SINGLE_DATE') {
      // 7 days leading up to selected date or today
      const finalDay = filterPeriod === 'TODAY' ? new Date() : new Date(selectedDate);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(finalDay);
        d.setDate(d.getDate() - i);
        const dateStr = d.toDateString();
        const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });

        const dayInKgs = transactions
          .filter(t => t.type === 'IN' && new Date(t.timestamp).toDateString() === dateStr)
          .reduce((sum, t) => sum + t.kgs, 0);

        const dayOutKgs = transactions
          .filter(t => t.type === 'OUT' && new Date(t.timestamp).toDateString() === dateStr)
          .reduce((sum, t) => sum + t.kgs, 0);

        result.push({ name: label, 'Masuk (Kg)': dayInKgs, 'Keluar (Kg)': dayOutKgs });
      }
    } else if (filterPeriod === 'RANGE') {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

      // Group dynamically (day-by-day if within 14 days, otherwise group into blocks)
      const maxTicks = Math.min(diffDays, 12);
      for (let i = 0; i < maxTicks; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + Math.round((i * diffDays) / maxTicks));
        const dateStr = d.toDateString();
        const label = d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });

        const dayInKgs = transactions
          .filter(t => t.type === 'IN' && new Date(t.timestamp).toDateString() === dateStr)
          .reduce((sum, t) => sum + t.kgs, 0);

        const dayOutKgs = transactions
          .filter(t => t.type === 'OUT' && new Date(t.timestamp).toDateString() === dateStr)
          .reduce((sum, t) => sum + t.kgs, 0);

        result.push({ name: label, 'Masuk (Kg)': dayInKgs, 'Keluar (Kg)': dayOutKgs });
      }
    } else {
      // GLOBAL: show last 10 days of transactions activity
      for (let i = 9; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toDateString();
        const label = d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });

        const dayInKgs = transactions
          .filter(t => t.type === 'IN' && new Date(t.timestamp).toDateString() === dateStr)
          .reduce((sum, t) => sum + t.kgs, 0);

        const dayOutKgs = transactions
          .filter(t => t.type === 'OUT' && new Date(t.timestamp).toDateString() === dateStr)
          .reduce((sum, t) => sum + t.kgs, 0);

        result.push({ name: label, 'Masuk (Kg)': dayInKgs, 'Keluar (Kg)': dayOutKgs });
      }
    }

    return result;
  }, [transactions, filterPeriod, selectedDate, startDate, endDate]);

  // Breakdown of unique items currently inside the Chiller
  const stockBreakdownList = useMemo(() => {
    const map: Record<string, { code: string; name: string; batchCount: number; pcs: number; kgs: number }> = {};

    inChiller.forEach(item => {
      const code = item.itemCode || 'N/A';
      if (!map[code]) {
        map[code] = {
          code,
          name: item.itemName || 'Tanpa Nama',
          batchCount: 0,
          pcs: 0,
          kgs: 0
        };
      }
      map[code].batchCount += 1;
      map[code].pcs += item.pcs;
      map[code].kgs += item.kgs;
    });

    return Object.values(map).sort((a, b) => b.kgs - a.kgs);
  }, [inChiller]);

  const netPcs = loadingMetrics.inflowPcs - loadingMetrics.outflowPcs;
  const netKgs = loadingMetrics.inflowKgs - loadingMetrics.outflowKgs;

  const filteredProducts = useMemo(() => {
    return stockBreakdownList.filter(p =>
      p.code.toLowerCase().includes(modalSearch.toLowerCase()) ||
      p.name.toLowerCase().includes(modalSearch.toLowerCase())
    );
  }, [stockBreakdownList, modalSearch]);

  const filteredBatches = useMemo(() => {
    return inChiller.filter(b =>
      b.batchId.toLowerCase().includes(modalSearch.toLowerCase()) ||
      (b.itemCode || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      (b.itemName || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      (b.allocation || '').toLowerCase().includes(modalSearch.toLowerCase())
    );
  }, [inChiller, modalSearch]);

  const filteredInbound = useMemo(() => {
    return filteredTransactions.filter(t => t.type === 'IN').filter(t =>
      t.chillerId.toLowerCase().includes(modalSearch.toLowerCase()) ||
      (t.itemCode || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      (t.userId || '').toLowerCase().includes(modalSearch.toLowerCase())
    );
  }, [filteredTransactions, modalSearch]);

  const filteredOutbound = useMemo(() => {
    return filteredTransactions.filter(t => t.type === 'OUT').filter(t =>
      t.chillerId.toLowerCase().includes(modalSearch.toLowerCase()) ||
      (t.itemCode || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      (t.destination || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      (t.userId || '').toLowerCase().includes(modalSearch.toLowerCase())
    );
  }, [filteredTransactions, modalSearch]);

  const filteredNetTransactions = useMemo(() => {
    return filteredTransactions.filter(t =>
      t.chillerId.toLowerCase().includes(modalSearch.toLowerCase()) ||
      (t.itemCode || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      (t.userId || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
      (t.destination || '').toLowerCase().includes(modalSearch.toLowerCase())
    );
  }, [filteredTransactions, modalSearch]);

  // Render Helper for Filter Tag Label
  const getFilterTagLabel = () => {
    switch (filterPeriod) {
      case 'TODAY':
        return 'Hari Ini';
      case 'SINGLE_DATE':
        return selectedDate ? `Tanggal: ${new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Per Tanggal';
      case 'RANGE':
        return `Rentang: ${startDate} s/d ${endDate}`;
      case 'GLOBAL':
        return 'Global (Semua Waktu)';
    }
  };

  return (
    <div id="dashboard-export-area" className="space-y-6 md:space-y-8 animate-in fade-in duration-500 bg-slate-50/50 p-1 rounded-3xl">

      {/* Official PDF Letterhead */}
      {isExporting && (
        <div className="border-b-2 border-red-600 pb-4 mb-6 px-6 pt-6 bg-white rounded-3xl border border-gray-100 shadow-sm animate-in fade-in">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight">BOUNTY SEGAR INDONESIA (BSI)</h1>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Chiller Management System (CMS)</p>
              <p className="text-[9px] text-gray-400">Gudang Penyimpanan Dingin & Logistik</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-full uppercase tracking-wider border border-red-100">
                LAPORAN RINGKASAN DASHBOARD (EKSEKUTIF)
              </span>
              <p className="text-[9px] text-gray-400 mt-2 font-medium">Tanggal Cetak: {new Date().toLocaleString('id-ID')}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Uraian Laporan</span>
              <p className="text-[11px] font-bold text-gray-800">Visualisasi Metrik Sediaan & Logistik Chiller</p>
            </div>
            <div className="text-right">
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Saringan Operasional</span>
              <p className="text-[11px] font-bold text-red-600">
                {getFilterTagLabel()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header and Filter Selector */}
      <div className="bg-white p-3.5 md:p-6 rounded-2xl md:rounded-3xl border border-gray-100 shadow-sm space-y-3 md:space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 md:gap-4">
          <div>
            <span className="text-[10px] md:text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full uppercase tracking-wider">Layanan Real-time</span>
            <h2 id="dashboard-title" className="text-xl md:text-3xl font-black text-gray-900 tracking-tight mt-1">
              Dashboard Ringkasan Chiller
            </h2>
            <p className="text-[11px] md:text-xs text-gray-400 mt-1">Gunakan saringan di bawah untuk menyaring data pergerakan barang secara dinamis.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="bg-gray-100 p-1 rounded-xl md:rounded-2xl flex flex-wrap gap-1" data-html2canvas-ignore="true">
              <button
                type="button"
                onClick={() => setFilterPeriod('TODAY')}
                className={`px-2.5 md:px-4 py-1.5 md:py-2 text-[11px] md:text-sm font-bold rounded-lg md:rounded-xl transition-all ${filterPeriod === 'TODAY'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => setFilterPeriod('SINGLE_DATE')}
                className={`px-2.5 md:px-4 py-1.5 md:py-2 text-[11px] md:text-sm font-bold rounded-lg md:rounded-xl transition-all ${filterPeriod === 'SINGLE_DATE'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                Per Tanggal
              </button>
              <button
                type="button"
                onClick={() => setFilterPeriod('RANGE')}
                className={`px-2.5 md:px-4 py-1.5 md:py-2 text-[11px] md:text-sm font-bold rounded-lg md:rounded-xl transition-all ${filterPeriod === 'RANGE'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                Rentang
              </button>
              <button
                type="button"
                onClick={() => setFilterPeriod('GLOBAL')}
                className={`px-2.5 md:px-4 py-1.5 md:py-2 text-[11px] md:text-sm font-bold rounded-lg md:rounded-xl transition-all ${filterPeriod === 'GLOBAL'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                Semua Waktu
              </button>
            </div>

            <button
              type="button"
              onClick={downloadPDF}
              className="flex items-center gap-1 px-3 md:px-4 py-2 md:py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-[10px] md:text-xs uppercase tracking-wider rounded-lg md:rounded-xl transition-all shadow-md active:scale-95 cursor-pointer outline-none shrink-0"
              title="Download PDF Dashboard"
            >
              <FileText size={12} className="md:w-3.5 md:h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* Conditional filter inputs */}
        {(filterPeriod === 'SINGLE_DATE' || filterPeriod === 'RANGE') && (
          <div data-html2canvas-ignore="true" className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-wrap items-center gap-4 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 text-slate-700">
              <Calendar className="w-4 h-4 text-red-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Pilih Periode:</span>
            </div>

            {filterPeriod === 'SINGLE_DATE' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-800"
                />
              </div>
            )}

            {filterPeriod === 'RANGE' && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Mulai:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-800"
                  />
                </div>
                <span className="text-gray-400 font-bold px-1">—</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Selesai:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-800"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Visual Analytics Info strip */}
      <div className="flex flex-wrap items-center justify-between px-1 gap-2">
        <div className="flex items-center gap-1.5 text-slate-700 text-xs md:text-sm">
          <Filter className="w-3.5 h-3.5 text-red-500" />
          <span className="font-semibold">Saringan:</span>
          <span className="font-extrabold bg-red-50 text-red-700 px-2.5 py-0.5 rounded-full border border-red-100 text-[11px] md:text-xs">
            {getFilterTagLabel()}
          </span>
        </div>
        <div className="text-[10px] md:text-xs text-gray-400 italic">
          Autosync Aktif
        </div>
      </div>

      {/* Stats Board Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">

        {/* Card 1: Chiller Stock Summary */}
        <div
          onClick={() => { setActiveDetailsModal('STOK_CHILLER'); setModalSearch(''); }}
          className="bg-white rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-sm border border-gray-100 hover:border-red-300 hover:shadow-md transition-all relative overflow-hidden group cursor-pointer active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-red-100 rounded-full mix-blend-multiply filter blur-2xl opacity-30 transform translate-x-8 -translate-y-8"></div>
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <span className="text-[9px] md:text-xs font-extrabold text-red-700 bg-red-50 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full uppercase tracking-wider">
              GUDANG CHILLER
            </span>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-red-50 text-red-600 rounded-lg md:rounded-xl flex items-center justify-center">
              <Package className="w-4 h-4 md:w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] md:text-sm font-bold text-gray-400 uppercase tracking-widest leading-none">Stok Chiller</p>
          <div className="mt-1.5 md:mt-2.5">
            <h3 className="text-xl md:text-3xl font-black text-gray-900 tracking-tight">
              {formatNumber(totalStockWeight, 2)}
              <span className="text-xs md:text-sm font-extrabold text-gray-400 ml-1">Kgs</span>
            </h3>
            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 md:mt-2 text-[10px] md:text-xs font-semibold text-gray-500">
              <span className="bg-gray-100 px-1.5 py-0.5 rounded-md">{formatNumber(totalStockPcs, 0)} Pcs</span>
              <span className="bg-slate-100 px-1.5 py-0.5 rounded-md">{inChiller.length} Batch</span>
            </div>
          </div>
          <div className="hidden md:flex mt-4 pt-3.5 border-t border-gray-100 items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Boxes className="w-3.5 h-3.5 text-red-500" />
              <span>Sediaan Item Unik:</span>
            </div>
            <span className="font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs">
              {uniqueItemsInStock} Produk
            </span>
          </div>
        </div>

        {/* Card 2: Inflow Activities */}
        <div
          onClick={() => { setActiveDetailsModal('BARANG_MASUK'); setModalSearch(''); }}
          className="bg-white rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-sm border border-gray-100 hover:border-emerald-300 hover:shadow-md transition-all relative overflow-hidden group cursor-pointer active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-emerald-100 rounded-full mix-blend-multiply filter blur-2xl opacity-30 transform translate-x-8 -translate-y-8"></div>
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <span className="text-[9px] md:text-xs font-extrabold text-emerald-700 bg-emerald-50 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full uppercase tracking-wider">
              BARANG MASUK
            </span>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-emerald-50 text-emerald-600 rounded-lg md:rounded-xl flex items-center justify-center">
              <ArrowDownToLine className="w-4 h-4 md:w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] md:text-sm font-bold text-gray-400 uppercase tracking-widest leading-none">Total Inbound</p>
          <div className="mt-1.5 md:mt-2.5">
            <h3 className="text-xl md:text-3xl font-black text-emerald-700 tracking-tight">
              {formatNumber(loadingMetrics.inflowKgs, 2)}
              <span className="text-xs md:text-sm font-extrabold text-gray-400 ml-1">Kgs</span>
            </h3>
            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 md:mt-2 text-[10px] md:text-xs font-semibold text-gray-500">
              <span className="bg-emerald-50/50 text-emerald-800 px-1.5 py-0.5 rounded-md">{formatNumber(loadingMetrics.inflowPcs, 0)} Pcs</span>
              <span className="bg-gray-100 px-1.5 py-0.5 rounded-md hidden sm:inline">Periode Ini</span>
            </div>
          </div>
          <div className="hidden md:flex mt-4 pt-3.5 border-t border-gray-100 items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-emerald-500" />
              <span>Model Item Unik:</span>
            </div>
            <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs">
              {loadingMetrics.inflowUniqueCount} Produk
            </span>
          </div>
        </div>

        {/* Card 3: Outflow Activities */}
        <div
          onClick={() => { setActiveDetailsModal('BARANG_KELUAR'); setModalSearch(''); }}
          className="bg-white rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all relative overflow-hidden group cursor-pointer active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-blue-100 rounded-full mix-blend-multiply filter blur-2xl opacity-30 transform translate-x-8 -translate-y-8"></div>
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <span className="text-[9px] md:text-xs font-extrabold text-blue-700 bg-blue-50 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full uppercase tracking-wider">
              BARANG KELUAR
            </span>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-50 text-blue-600 rounded-lg md:rounded-xl flex items-center justify-center">
              <ArrowUpFromLine className="w-4 h-4 md:w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] md:text-sm font-bold text-gray-400 uppercase tracking-widest leading-none">Total Outbound</p>
          <div className="mt-1.5 md:mt-2.5">
            <h3 className="text-xl md:text-3xl font-black text-blue-700 tracking-tight">
              {formatNumber(loadingMetrics.outflowKgs, 2)}
              <span className="text-xs md:text-sm font-extrabold text-gray-400 ml-1">Kgs</span>
            </h3>
            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 md:mt-2 text-[10px] md:text-xs font-semibold text-gray-500">
              <span className="bg-blue-50/50 text-blue-800 px-1.5 py-0.5 rounded-md">{formatNumber(loadingMetrics.outflowPcs, 0)} Pcs</span>
              <span className="bg-gray-100 px-1.5 py-0.5 rounded-md hidden sm:inline">Periode Ini</span>
            </div>
          </div>
          <div className="hidden md:flex mt-4 pt-3.5 border-t border-gray-100 items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-blue-500" />
              <span>Model Item Unik:</span>
            </div>
            <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">
              {loadingMetrics.outflowUniqueCount} Produk
            </span>
          </div>
        </div>

        {/* Card 4: Net Flow Difference */}
        <div
          onClick={() => { setActiveDetailsModal('NET_FLOW'); setModalSearch(''); }}
          className="bg-white rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-sm border border-gray-100 hover:border-violet-300 hover:shadow-md transition-all relative overflow-hidden group cursor-pointer active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-violet-100 rounded-full mix-blend-multiply filter blur-2xl opacity-30 transform translate-x-8 -translate-y-8"></div>
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <span className="text-[9px] md:text-xs font-extrabold text-violet-700 bg-violet-50 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-full uppercase tracking-wider">
              NET FLOW
            </span>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-violet-50 text-violet-600 rounded-lg md:rounded-xl flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4 md:w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] md:text-sm font-bold text-gray-400 uppercase tracking-widest leading-none">Net Selisih</p>
          <div className="mt-1.5 md:mt-2.5">
            <h3 className={`text-xl md:text-3xl font-black tracking-tight ${netKgs >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {netKgs >= 0 ? '+' : ''}
              {formatNumber(netKgs, 2)}
              <span className="text-xs md:text-sm font-extrabold text-gray-400 ml-1">Kgs</span>
            </h3>
            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 md:mt-2 text-[10px] md:text-xs font-semibold text-gray-500">
              <span className={`px-1.5 py-0.5 rounded-md ${netPcs >= 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                {netPcs >= 0 ? '+' : ''}{formatNumber(netPcs, 0)} Pcs
              </span>
            </div>
          </div>
          <div className="hidden md:flex mt-4 pt-3.5 border-t border-gray-100 items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-violet-500" />
              <span>Status Operasional:</span>
            </div>
            <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${netKgs > 0 ? 'bg-green-100 text-green-800' : netKgs < 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
              }`}>
              {netKgs > 0 ? 'Akumulasi Naik' : netKgs < 0 ? 'Akumulasi Turun' : 'Seimbang'}
            </span>
          </div>
        </div>

      </div>

      {/* Main Charts & Item Table Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">

        {/* Dynamic Recharts Trend Graphic */}
        <div className="lg:col-span-2 bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-6 gap-2">
            <div>
              <h3 className="text-base md:text-lg font-black text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 md:w-5 h-5 text-red-600" />
                Tren Aktivitas Pergerakan Barang
              </h3>
              <p className="text-[10px] md:text-xs text-gray-400">Analisis volume masuk vs keluar chiller berdasarkan rentang filter (Kg)</p>
            </div>
          </div>
          <div className="h-[224px] sm:h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'medium' }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  dx={-5}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc', radius: 4 }}
                  contentStyle={{
                    borderRadius: '16px',
                    border: '1px solid #f1f5f9',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                    backgroundColor: '#ffffff'
                  }}
                  itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '15px' }} />
                <Bar dataKey="Masuk (Kg)" fill="#e11d48" radius={[4, 4, 0, 0]} name="Masuk (Kg)" />
                <Bar dataKey="Keluar (Kg)" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Keluar (Kg)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Operations and Inventory Contribution Info */}
        <div className="space-y-4 md:space-y-6">

          {/* Quick Actions Card */}
          <div data-html2canvas-ignore="true" className="bg-gradient-to-br from-red-600 to-red-700 text-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-sm relative overflow-hidden">
            <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 text-white/5 pointer-events-none">
              <ThermometerSnowflake className="w-28 h-28 md:w-40 md:h-40" />
            </div>
            <h3 className="text-base md:text-lg font-black mb-1 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 md:w-5 h-5 text-red-100" />
              Aksi Cepat Logistik
            </h3>
            <p className="text-[11px] md:text-xs text-white/80 mb-4 md:mb-5">Pintasan navigasi untuk mengelola muat barang chiller.</p>

            <div className="space-y-2.5 md:space-y-3">
              <button
                onClick={() => onNavigate('INFLOW')}
                className="w-full flex items-center justify-between p-2.5 md:p-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl md:rounded-2xl group transition-all"
              >
                <div className="flex items-center gap-2.5 md:gap-3">
                  <div className="p-1.5 md:p-2 bg-white/20 rounded-lg">
                    <ArrowDownToLine className="w-3.5 h-3.5 md:w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-xs md:text-sm">Input Barang Baru</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 md:w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => onNavigate('INVENTORY')}
                className="w-full flex items-center justify-between p-2.5 md:p-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl md:rounded-2xl group transition-all"
              >
                <div className="flex items-center gap-2.5 md:gap-3">
                  <div className="p-1.5 md:p-2 bg-white/20 rounded-lg">
                    <ThermometerSnowflake className="w-3.5 h-3.5 md:w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-xs md:text-sm">Cek Stok Chiller</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 md:w-4 h-4 text-white/80 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Unique Items composition list inside the Chiller */}
          <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 space-y-3 md:space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs md:text-sm font-black text-gray-800">Komposisi Sediaan Terbesar</h3>
                <p className="text-[9px] md:text-[10px] text-gray-400">Total berat sediaan unik berurutan</p>
              </div>
              <span className="text-[9px] md:text-[10px] font-black text-gray-500 bg-gray-100 px-1.5 md:px-2 py-0.5 md:py-1 rounded">
                {stockBreakdownList.length} Item
              </span>
            </div>

            {stockBreakdownList.length === 0 ? (
              <div className="p-4 text-center rounded-xl md:rounded-2xl bg-gray-50 text-gray-400 text-xs">
                Chiller dalam keadaan kosong.
              </div>
            ) : (
              <div className="space-y-3.5 max-h-[220px] overflow-y-auto pr-1">
                {stockBreakdownList.slice(0, 5).map((item, index) => {
                  const contributionPercent = totalStockWeight > 0
                    ? Math.min(100, Math.max(0, (item.kgs / totalStockWeight) * 100))
                    : 0;

                  return (
                    <div key={item.code} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"></span>
                          <span className="font-bold text-gray-700 truncate" title={`${item.code} - ${item.name}`}>
                            {item.code}
                          </span>
                        </div>
                        <span className="text-gray-900 font-bold font-mono">
                          {formatNumber(item.kgs, 1)} Kg
                        </span>
                      </div>

                      {/* Percent contribution progress line */}
                      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-red-500 to-rose-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${contributionPercent}%` }}
                        ></div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-semibold px-0.5">
                        <span className="truncate max-w-[170px]">{item.name}</span>
                        <span>{formatNumber(item.pcs, 0)} Pcs ({formatNumber(contributionPercent, 1)}%)</span>
                      </div>
                    </div>
                  );
                })}

                {stockBreakdownList.length > 5 && (
                  <button
                    data-html2canvas-ignore="true"
                    onClick={() => onNavigate('INVENTORY')}
                    className="w-full text-center py-2 bg-slate-50 hover:bg-slate-100 text-[11px] font-extrabold text-blue-600 hover:text-blue-700 rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Lihat {stockBreakdownList.length - 5} item lainnya di persediaan</span>
                    <ChevronLast className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Unique Table: Detailed Composition of Items inside Chiller currently */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-6 space-y-3 md:space-y-4">
        <div>
          <h3 className="text-base md:text-lg font-black text-gray-800 flex items-center gap-2">
            <Layers className="w-4 h-4 md:w-5 h-5 text-red-600" />
            Daftar Uraian Sediaan Item Unik (Real-time)
          </h3>
          <p className="text-[10px] md:text-xs text-gray-400">Total berat sediaan dipecah berdasarkan kode unik material yang aktif di dalam chiller.</p>
        </div>

        <div className="overflow-x-auto rounded-xl md:rounded-2xl border border-gray-100">
          <table className="w-full text-left text-xs md:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-light text-slate-500 font-extrabold text-[10px] md:text-xs uppercase">
                <th className="p-2 md:p-3">Kode Item</th>
                <th className="p-2 md:p-3">Nama Material / Deskripsi</th>
                <th className="p-2 md:p-3 text-center hidden sm:table-cell">Jumlah Batch</th>
                <th className="p-2 md:p-3 text-right">Total Qty (Pcs)</th>
                <th className="p-2 md:p-3 text-right">Total Berat (Kgs)</th>
                <th className="p-2 md:p-3 text-center hidden md:table-cell">Kontribusi Stok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockBreakdownList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 md:p-8 text-center text-gray-400 font-medium whitespace-nowrap text-xs">
                    Tidak ada item tersisa di dalam chiller.
                  </td>
                </tr>
              ) : (
                stockBreakdownList.map((item) => {
                  const contributionPercent = totalStockWeight > 0 ? (item.kgs / totalStockWeight) * 100 : 0;
                  return (
                    <tr key={item.code} className="hover:bg-slate-50/50 transition-colors text-[11px] md:text-xs">
                      <td className="p-2 md:p-3 font-mono font-bold text-red-700">{item.code}</td>
                      <td className="p-2 md:p-3 font-semibold text-gray-700 max-w-[120px] md:max-w-none truncate" title={item.name}>{item.name}</td>
                      <td className="p-2 md:p-3 text-center font-bold text-gray-600 bg-gray-50/50 hidden sm:table-cell">{item.batchCount}</td>
                      <td className="p-2 md:p-3 text-right font-mono font-bold text-gray-900">{formatNumber(item.pcs, 0)}</td>
                      <td className="p-2 md:p-3 text-right font-mono font-black text-gray-900">{formatNumber(item.kgs, 2)}</td>
                      <td className="p-2 md:p-3 text-center hidden md:table-cell">
                        <span className="inline-block px-2.5 py-1 bg-red-50 text-red-700 text-xs font-black rounded-lg border border-red-100">
                          {formatNumber(contributionPercent, 1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* PRO-GRADE CORPORATION PRINT-OPTIMIZED DOCUMENT TEMPLATE    */}
      {/* ========================================================= */}
      <div style={{ position: 'absolute', left: '-9999px', top: -9999, width: '800px', zIndex: -50 }} className="bg-white">
        <div id="dashboard-print-template" className="p-10 bg-white text-slate-800 space-y-8 font-sans">

          {/* Header & Letterhead Block */}
          <div className="border-b-4 border-red-600 pb-5">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">BOUNTY SEGAR INDONESIA</h1>
                <p className="text-[11px] font-bold text-gray-500 tracking-widest uppercase mt-0.5">Chiller Management System (CMS) — Laporan Eksekutif</p>
                <p className="text-[9px] text-gray-400 mt-1">Gudang Logistik & Penyimpanan Rantai Dingin (Cold-Chain Warehouse & Logistics)</p>
              </div>
              <div className="text-right">
                <span className="text-[9px] font-extrabold text-red-600 bg-red-50 px-3 py-1 rounded-full uppercase tracking-widest border border-red-100">
                  DOKUMEN RESMI UTAMA
                </span>
                <p className="text-[9px] text-gray-400 mt-3 font-medium">ID Dokumen: BSI/CMS/DSB/{Date.now().toString().slice(-6)}</p>
                <p className="text-[9px] text-gray-400 font-medium">Tanggal Cetak: {new Date().toLocaleString('id-ID', { hour12: false })}</p>
              </div>
            </div>

            {/* Document Meta Information */}
            <div className="mt-5 grid grid-cols-2 gap-4 text-[10px] bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div>
                <span className="font-extrabold text-gray-400 uppercase tracking-wider block text-[8px]">Deskripsi Dokumen</span>
                <span className="font-bold text-gray-800">Visualisasi Metrik Sediaan & Logistik Chiller Real-time</span>
              </div>
              <div className="text-right">
                <span className="font-extrabold text-gray-400 uppercase tracking-wider block text-[8px]">Saringan Operasional Aktif</span>
                <span className="font-bold text-red-600 uppercase tracking-wide">{getFilterTagLabel()}</span>
              </div>
            </div>
          </div>

          {/* Section 1: Ringkasan Sediaan & Aktivitas */}
          <div className="space-y-4">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between">
              <span>I. RINGKASAN SEDIAAN & AKTIVITAS MUTASI</span>
              <span className="text-[9px] text-gray-400 font-bold lowercase">Unit Pengukuran: Pcs & Kgs</span>
            </h2>

            <div className="grid grid-cols-3 gap-4">
              <div className="border border-slate-200 p-4 rounded-lg bg-slate-50/30">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Total Sediaan Aktif saat ini</span>
                <p className="text-[16px] font-black text-slate-900 mt-1">{formatNumber(totalStockPcs, 0)} <span className="text-[10px] font-medium text-slate-500">Pcs</span></p>
                <p className="text-xs font-extrabold text-red-600 mt-0.5">{formatNumber(totalStockWeight, 2)} <span className="text-[10px] font-medium">Kgs</span></p>
                <span className="text-[9px] text-slate-400 block mt-2 font-semibold">Tersimpan dari {uniqueItemsInStock} kode jenis item</span>
              </div>

              <div className="border border-slate-200 p-4 rounded-lg bg-slate-50/30">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Mutasi Masuk (Incoming)</span>
                <p className="text-[16px] font-black text-slate-900 mt-1">+{formatNumber(loadingMetrics.inflowPcs, 0)} <span className="text-[10px] font-medium text-slate-500">Pcs</span></p>
                <p className="text-xs font-extrabold text-green-700 mt-0.5">+{formatNumber(loadingMetrics.inflowKgs, 2)} <span className="text-[10px] font-medium">Kgs</span></p>
                <span className="text-[9px] text-slate-400 block mt-2 font-semibold">Berdasarkan saringan aktif</span>
              </div>

              <div className="border border-slate-200 p-4 rounded-lg bg-slate-50/30">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Mutasi Keluar (Outgoing)</span>
                <p className="text-[16px] font-black text-slate-900 mt-1">-{formatNumber(loadingMetrics.outflowPcs, 0)} <span className="text-[10px] font-medium text-slate-500">Pcs</span></p>
                <p className="text-xs font-extrabold text-blue-700 mt-0.5">-{formatNumber(loadingMetrics.outflowKgs, 2)} <span className="text-[10px] font-medium">Kgs</span></p>
                <span className="text-[9px] text-slate-400 block mt-2 font-semibold">Berdasarkan saringan aktif</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center text-[11px] font-bold">
              <span className="text-slate-500 uppercase tracking-wider text-[9px]">Perubahan Bersih Sisa (Netto):</span>
              <div className="space-x-4">
                <span className={netPcs >= 0 ? 'text-green-700' : 'text-red-600'}>
                  {netPcs >= 0 ? '+' : ''}{formatNumber(netPcs, 0)} Pcs
                </span>
                <span className={netKgs >= 0 ? 'text-green-700' : 'text-red-700'}>
                  {netKgs >= 0 ? '+' : ''}{formatNumber(netKgs, 2)} Kgs
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Komposisi Sediaan Detail */}
          <div className="space-y-4">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between">
              <span>II. RINCIAN KOMPOSISI SEDIAAN AKTIF (REAL-TIME STOCK COMPOSITION)</span>
              <span className="text-[9px] text-gray-400 font-bold uppercase">Keadaan Nyata</span>
            </h2>

            <table className="w-full text-left text-[10px] border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 text-[9px] uppercase tracking-wider">
                  <th className="p-2 border-r border-slate-200">Kode Item</th>
                  <th className="p-2 border-r border-slate-200">Nama Material / Deskripsi</th>
                  <th className="p-2 border-r border-slate-200 text-center">Jumlah Batch</th>
                  <th className="p-2 border-r border-slate-200 text-right">Qty (Pcs)</th>
                  <th className="p-2 border-r border-slate-200 text-right">Berat (Kgs)</th>
                  <th className="p-2 text-center">Kontribusi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stockBreakdownList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-400 uppercase font-bold">Tidak ada item di dalam Chiller</td>
                  </tr>
                ) : (
                  stockBreakdownList.map((item) => {
                    const contributionPercent = totalStockWeight > 0 ? (item.kgs / totalStockWeight) * 100 : 0;
                    return (
                      <tr key={item.code} className="hover:bg-slate-50/50">
                        <td className="p-2 font-mono font-bold text-red-700 border-r border-slate-200">{item.code}</td>
                        <td className="p-2 font-semibold text-slate-700 border-r border-slate-200">{item.name}</td>
                        <td className="p-2 text-center font-bold text-slate-600 border-r border-slate-200">{item.batchCount}</td>
                        <td className="p-2 text-right font-mono font-bold text-slate-800 border-r border-slate-200">{formatNumber(item.pcs, 0)}</td>
                        <td className="p-2 text-right font-mono font-black text-slate-900 border-r border-slate-200">{formatNumber(item.kgs, 2)}</td>
                        <td className="p-2 text-center font-bold text-red-600 bg-red-50/30">{formatNumber(contributionPercent, 1)}%</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Section 3: Transaksi Mutasi Terakhir */}
          <div className="space-y-4">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 flex justify-between">
              <span>III. RIWAYAT MUTASI TERBARU (SAMPEL 12 TRANSAKSI TERAKHIR)</span>
              <span className="text-[9px] text-gray-400 font-bold lowercase">Urut Kronologis</span>
            </h2>

            <table className="w-full text-left text-[9px] border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200 uppercase tracking-wider">
                  <th className="p-2 border-r border-slate-200">ID Batch (Uraian)</th>
                  <th className="p-2 border-r border-slate-200">Tipe Mutasi</th>
                  <th className="p-2 border-r border-slate-200">Kode Item</th>
                  <th className="p-2 border-r border-slate-200 text-right">Volume Pcs</th>
                  <th className="p-2 border-r border-slate-200 text-right">Berat Kgs</th>
                  <th className="p-2 border-r border-slate-200">Pelaksana</th>
                  <th className="p-2">Waktu Transaksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400 uppercase font-bold">Tidak ada transaksi mutasi dalam periode ini</td>
                  </tr>
                ) : (
                  filteredTransactions.slice(0, 12).map((t, index) => (
                    <tr key={index} className="hover:bg-slate-50/50">
                      <td className="p-2 font-mono font-bold text-red-600 border-r border-slate-200">{t.chillerId}</td>
                      <td className="p-2 border-r border-slate-200">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${t.type === 'IN' ? 'bg-green-100 text-green-700' :
                            t.type === 'OUT' ? 'bg-blue-100 text-blue-700' :
                              'bg-orange-100 text-orange-700'
                          }`}>
                          {t.type} {t.destination ? `→ ${t.destination}` : ''}
                        </span>
                      </td>
                      <td className="p-2 font-sans font-bold text-slate-700 border-r border-slate-200">{t.itemCode}</td>
                      <td className="p-2 text-right font-mono text-slate-800 border-r border-slate-200">{formatNumber(t.pcs, 0)}</td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900 border-r border-slate-200">{formatNumber(t.kgs, 2)}</td>
                      <td className="p-2 font-bold text-slate-600 border-r border-slate-200 uppercase">{t.userId}</td>
                      <td className="p-2 text-slate-400 font-mono">{new Date(t.timestamp).toLocaleString('id-ID', { hour12: false })}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>


          {/* Professional Footer Notice */}
          <div className="pt-6 border-t border-slate-200 flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase tracking-wider">
            <span>BOUNTY SEGAR INDONESIA (BSI) CMS OFFICIAL SUMMARY REPORT</span>
            <span>Halaman 1 dari 1</span>
          </div>

        </div>
      </div>

      {/* Interactive Detail Modals */}
      {activeDetailsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeDetailsModal === 'STOK_CHILLER' ? 'bg-red-50 text-red-600' :
                    activeDetailsModal === 'BARANG_MASUK' ? 'bg-emerald-50 text-emerald-600' :
                      activeDetailsModal === 'BARANG_KELUAR' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'
                  }`}>
                  {activeDetailsModal === 'STOK_CHILLER' && <Package className="w-5 h-5" />}
                  {activeDetailsModal === 'BARANG_MASUK' && <ArrowDownToLine className="w-5 h-5" />}
                  {activeDetailsModal === 'BARANG_KELUAR' && <ArrowUpFromLine className="w-5 h-5" />}
                  {activeDetailsModal === 'NET_FLOW' && <ArrowRightLeft className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">
                    {activeDetailsModal === 'STOK_CHILLER' && 'Detail Persediaan Chiller Saat Ini'}
                    {activeDetailsModal === 'BARANG_MASUK' && 'Detail Transaksi Masuk (Inbound)'}
                    {activeDetailsModal === 'BARANG_KELUAR' && 'Detail Transaksi Keluar (Outbound)'}
                    {activeDetailsModal === 'NET_FLOW' && 'Detail Arus Pergerakan Barang (Net Flow)'}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {activeDetailsModal === 'STOK_CHILLER' && 'Ringkasan sediaan material yang saat ini aktif di dalam chiller'}
                    {activeDetailsModal === 'BARANG_MASUK' && `Riwayat barang masuk periode ${getFilterTagLabel().toLowerCase()}`}
                    {activeDetailsModal === 'BARANG_KELUAR' && `Riwayat barang keluar periode ${getFilterTagLabel().toLowerCase()}`}
                    {activeDetailsModal === 'NET_FLOW' && `Neraca keseimbangan mutasi periode ${getFilterTagLabel().toLowerCase()}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setActiveDetailsModal(null); setModalSearch(''); }}
                className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex items-center justify-center transition-all cursor-pointer border border-transparent hover:border-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-[300px]">

              {/* STOK CHILLER MODAL */}
              {activeDetailsModal === 'STOK_CHILLER' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Total Berat</span>
                      <p className="text-xl font-black text-gray-800">{formatNumber(totalStockWeight, 2)} <span className="text-xs font-bold text-gray-500">Kgs</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Total Unit</span>
                      <p className="text-xl font-black text-gray-800">{formatNumber(totalStockPcs, 0)} <span className="text-xs font-bold text-gray-500">Pcs</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Jumlah Batch</span>
                      <p className="text-xl font-black text-gray-800">{inChiller.length} <span className="text-xs font-bold text-gray-500">Lot</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Item Unik</span>
                      <p className="text-xl font-black text-gray-800">{uniqueItemsInStock} <span className="text-xs font-bold text-gray-500">Jenis</span></p>
                    </div>
                  </div>

                  {/* Tabs & Search controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                      <button
                        onClick={() => { setChillerModalTab('PRODUCTS'); setModalSearch(''); }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${chillerModalTab === 'PRODUCTS' ? 'bg-white text-slate-800 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                      >
                        Ringkasan per Produk
                      </button>
                      <button
                        onClick={() => { setChillerModalTab('BATCHES'); setModalSearch(''); }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${chillerModalTab === 'BATCHES' ? 'bg-white text-slate-800 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
                      >
                        Daftar Batch Detail
                      </button>
                    </div>

                    <div className="relative max-w-xs w-full self-end">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder={chillerModalTab === 'PRODUCTS' ? 'Cari nama atau kode produk...' : 'Cari ID batch, kode, lokasi...'}
                        value={modalSearch}
                        onChange={(e) => setModalSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:outline-none placeholder-gray-400"
                      />
                    </div>
                  </div>

                  {/* Tab Contents: PRODUCTS */}
                  {chillerModalTab === 'PRODUCTS' && (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-gray-500 font-extrabold uppercase border-b border-gray-100">
                              <th className="p-3">Kode Item</th>
                              <th className="p-3">Nama Material</th>
                              <th className="p-3 text-center">Batch Count</th>
                              <th className="p-3 text-right">Pcs</th>
                              <th className="p-3 text-right">Kgs</th>
                              <th className="p-3 text-center">Kontribusi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {filteredProducts.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-400">Tidak ada produk sediaan yang cocok</td>
                              </tr>
                            ) : (
                              filteredProducts.map(p => {
                                const percent = totalStockWeight > 0 ? (p.kgs / totalStockWeight) * 100 : 0;
                                return (
                                  <tr key={p.code} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-3 font-mono font-bold text-red-600">{p.code}</td>
                                    <td className="p-3 text-slate-700">{p.name}</td>
                                    <td className="p-3 text-center text-slate-600">{p.batchCount}</td>
                                    <td className="p-3 text-right font-mono text-slate-800">{formatNumber(p.pcs, 0)}</td>
                                    <td className="p-3 text-right font-mono font-bold text-slate-900">{formatNumber(p.kgs, 2)}</td>
                                    <td className="p-3 text-center">
                                      <span className="bg-red-50 text-red-600 font-bold px-2 py-0.5 rounded text-[10px]">{formatNumber(percent, 1)}%</span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Tab Contents: BATCHES */}
                  {chillerModalTab === 'BATCHES' && (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-gray-500 font-extrabold uppercase border-b border-gray-100">
                              <th className="p-3">ID Batch Chiller</th>
                              <th className="p-3">Kode Item</th>
                              <th className="p-3">Nama Material</th>
                              <th className="p-3">Lokasi / Sektor</th>
                              <th className="p-3 text-right">Pcs</th>
                              <th className="p-3 text-right">Kgs</th>
                              <th className="p-3">Tanggal Masuk</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {filteredBatches.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-8 text-center text-gray-400">Tidak ada data batch yang cocok</td>
                              </tr>
                            ) : (
                              filteredBatches.map(b => (
                                <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-3 font-mono font-black text-red-700">{b.batchId}</td>
                                  <td className="p-3 font-mono text-slate-600">{b.itemCode}</td>
                                  <td className="p-3 text-slate-700 max-w-[150px] truncate" title={b.itemName}>{b.itemName}</td>
                                  <td className="p-3"><span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold text-[10px] uppercase">{b.allocation || 'DEFAULT'}</span></td>
                                  <td className="p-3 text-right font-mono text-slate-800">{formatNumber(b.pcs, 0)}</td>
                                  <td className="p-3 text-right font-mono font-bold text-slate-900">{formatNumber(b.kgs, 2)}</td>
                                  <td className="p-3 text-slate-400 text-[10px] font-mono">{new Date(b.entryTimestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}


              {/* BARANG MASUK MODAL */}
              {activeDetailsModal === 'BARANG_MASUK' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Total Kuantitas Masuk</span>
                      <p className="text-xl font-black text-emerald-800">{formatNumber(loadingMetrics.inflowKgs, 2)} <span className="text-xs font-bold text-gray-500">Kgs</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Total Volume Masuk</span>
                      <p className="text-xl font-black text-emerald-800">{formatNumber(loadingMetrics.inflowPcs, 0)} <span className="text-xs font-bold text-gray-500">Pcs</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Frekuensi Inbound</span>
                      <p className="text-xl font-black text-slate-800">{filteredInbound.length} <span className="text-xs font-bold text-gray-500">Kali</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Model Item Masuk</span>
                      <p className="text-xl font-black text-slate-800">{loadingMetrics.inflowUniqueCount} <span className="text-xs font-bold text-gray-500">Produk</span></p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Riwayat Penerimaan</div>
                    <div className="relative max-w-xs w-full">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Cari ID batch, kode item, operator..."
                        value={modalSearch}
                        onChange={(e) => setModalSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none placeholder-gray-400"
                      />
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-gray-500 font-extrabold uppercase border-b border-gray-100">
                            <th className="p-3">Waktu Masuk</th>
                            <th className="p-3">ID Batch</th>
                            <th className="p-3">Kode Item</th>
                            <th className="p-3 text-right">Pcs</th>
                            <th className="p-3 text-right">Kgs</th>
                            <th className="p-3">Operator</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium font-mono">
                          {filteredInbound.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-gray-400 font-sans">Tidak ada transaksi masuk yang cocok</td>
                            </tr>
                          ) : (
                            filteredInbound.map((t, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 text-slate-400 text-[10px]">{new Date(t.timestamp).toLocaleString('id-ID')}</td>
                                <td className="p-3 font-black text-red-700">{t.chillerId}</td>
                                <td className="p-3 font-bold text-slate-700 font-sans">{t.itemCode}</td>
                                <td className="p-3 text-right text-slate-800">{formatNumber(t.pcs, 0)}</td>
                                <td className="p-3 text-right font-black text-slate-900">{formatNumber(t.kgs, 2)}</td>
                                <td className="p-3 font-bold uppercase text-slate-600 font-sans">{t.userId || 'System'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}


              {/* BARANG KELUAR MODAL */}
              {activeDetailsModal === 'BARANG_KELUAR' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Total Berat Keluar</span>
                      <p className="text-xl font-black text-blue-800">{formatNumber(loadingMetrics.outflowKgs, 2)} <span className="text-xs font-bold text-gray-500">Kgs</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Total Volume Keluar</span>
                      <p className="text-xl font-black text-blue-800">{formatNumber(loadingMetrics.outflowPcs, 0)} <span className="text-xs font-bold text-gray-500">Pcs</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Frekuensi Outbound</span>
                      <p className="text-xl font-black text-slate-800">{filteredOutbound.length} <span className="text-xs font-bold text-gray-500">Kali</span></p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Model Item Keluar</span>
                      <p className="text-xl font-black text-slate-800">{loadingMetrics.outflowUniqueCount} <span className="text-xs font-bold text-gray-500">Produk</span></p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Riwayat Pengeluaran (Discharge)</div>
                    <div className="relative max-w-xs w-full">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Cari ID batch, kode, destinasi..."
                        value={modalSearch}
                        onChange={(e) => setModalSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none placeholder-gray-400"
                      />
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-gray-500 font-extrabold uppercase border-b border-gray-100">
                            <th className="p-3">Waktu Keluar</th>
                            <th className="p-3">ID Batch</th>
                            <th className="p-3">Kode Item</th>
                            <th className="p-3">Destinasi</th>
                            <th className="p-3 text-right">Pcs</th>
                            <th className="p-3 text-right">Kgs</th>
                            <th className="p-3">Operator</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium font-mono">
                          {filteredOutbound.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-gray-400 font-sans">Tidak ada transaksi keluar yang cocok</td>
                            </tr>
                          ) : (
                            filteredOutbound.map((t, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 text-slate-400 text-[10px]">{new Date(t.timestamp).toLocaleString('id-ID')}</td>
                                <td className="p-3 font-black text-red-700">{t.chillerId}</td>
                                <td className="p-3 font-bold text-slate-700 font-sans">{t.itemCode}</td>
                                <td className="p-3 font-sans">
                                  <span className="bg-blue-50 text-blue-800 font-extrabold text-[9px] uppercase px-2 py-0.5 rounded tracking-wide">{t.destination || 'UMUM'}</span>
                                </td>
                                <td className="p-3 text-right text-slate-800">{formatNumber(t.pcs, 0)}</td>
                                <td className="p-3 text-right font-black text-slate-900">{formatNumber(t.kgs, 2)}</td>
                                <td className="p-3 font-bold uppercase text-slate-600 font-sans">{t.userId || 'System'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}


              {/* NET FLOW MODAL */}
              {activeDetailsModal === 'NET_FLOW' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-5 rounded-2xl border border-emerald-100 bg-emerald-50/20">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-xs uppercase tracking-wider mb-2">
                        <ArrowDownToLine className="w-4 h-4" />
                        <span>Akumulasi Masuk (+)</span>
                      </div>
                      <p className="text-2xl font-black text-emerald-800 leading-none">{formatNumber(loadingMetrics.inflowKgs, 2)} <span className="text-xs font-bold text-gray-500">Kgs</span></p>
                      <p className="text-xs text-emerald-600 font-semibold mt-1">{formatNumber(loadingMetrics.inflowPcs, 0)} Pcs didaftarkan</p>
                    </div>

                    <div className="p-5 rounded-2xl border border-blue-100 bg-blue-50/20">
                      <div className="flex items-center gap-1.5 text-blue-800 font-extrabold text-xs uppercase tracking-wider mb-2">
                        <ArrowUpFromLine className="w-4 h-4" />
                        <span>Akumulasi Keluar (-)</span>
                      </div>
                      <p className="text-2xl font-black text-blue-800 leading-none">{formatNumber(loadingMetrics.outflowKgs, 2)} <span className="text-xs font-bold text-gray-500">Kgs</span></p>
                      <p className="text-xs text-blue-600 font-semibold mt-1">{formatNumber(loadingMetrics.outflowPcs, 0)} Pcs dikeluarkan</p>
                    </div>

                    <div className={`p-5 rounded-2xl border ${netKgs >= 0 ? 'border-green-100 bg-green-50/20' : 'border-amber-100 bg-amber-50/20'}`}>
                      <div className={`flex items-center gap-1.5 font-extrabold text-xs uppercase tracking-wider mb-2 ${netKgs >= 0 ? 'text-green-800' : 'text-amber-800'}`}>
                        <ArrowRightLeft className="w-4 h-4" />
                        <span>Keseimbangan Mutasi (=)</span>
                      </div>
                      <p className={`text-2xl font-black leading-none ${netKgs >= 0 ? 'text-green-800' : 'text-amber-800'}`}>
                        {netKgs >= 0 ? '+' : ''}{formatNumber(netKgs, 2)} <span className="text-xs font-bold text-gray-500">Kgs</span>
                      </p>
                      <p className={`text-xs font-semibold mt-1 ${netKgs >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                        {netPcs >= 0 ? '+' : ''}{formatNumber(netPcs, 0)} Pcs ({netKgs >= 0 ? 'Akumulasi Naik' : 'Akumulasi Turun'})
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Arus Transaksi Masuk & Keluar</div>
                    <div className="relative max-w-xs w-full">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Cari transaksi..."
                        value={modalSearch}
                        onChange={(e) => setModalSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:outline-none placeholder-gray-400"
                      />
                    </div>
                  </div>

                  <div className="border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-gray-500 font-extrabold uppercase border-b border-gray-100">
                            <th className="p-3">Waktu Transaksi</th>
                            <th className="p-3">Tipe/Mutasi</th>
                            <th className="p-3">ID Batch</th>
                            <th className="p-3">Kode Item</th>
                            <th className="p-3 text-right">Pcs</th>
                            <th className="p-3 text-right">Kgs</th>
                            <th className="p-3">Operator</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium font-mono">
                          {filteredNetTransactions.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-gray-400 font-sans">Tidak ada transaksi yang cocok</td>
                            </tr>
                          ) : (
                            filteredNetTransactions.map((t, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 text-slate-400 text-[10px]">{new Date(t.timestamp).toLocaleString('id-ID')}</td>
                                <td className="p-3 font-sans">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${t.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                    {t.type} {t.destination ? `→ ${t.destination}` : ''}
                                  </span>
                                </td>
                                <td className="p-3 font-black text-red-700">{t.chillerId}</td>
                                <td className="p-3 font-bold text-slate-700 font-sans">{t.itemCode}</td>
                                <td className="p-3 text-right text-slate-800">{formatNumber(t.pcs, 0)}</td>
                                <td className="p-3 text-right font-black text-slate-900">{formatNumber(t.kgs, 2)}</td>
                                <td className="p-3 font-bold uppercase text-slate-600 font-sans">{t.userId || 'System'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-gray-100 flex justify-end text-xs">
              <button
                onClick={() => { setActiveDetailsModal(null); setModalSearch(''); }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all active:scale-95 animate-none outline-none"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
