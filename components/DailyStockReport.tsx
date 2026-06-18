
import React, { useState, useMemo, useRef } from 'react';
import { ChillerItem, Transaction } from '../types';
import { formatNumber } from '@/utils';
import {
  Calendar,
  FileText,
  Table as TableIcon,
  Info,
  Search,
  Hash
} from 'lucide-react';

interface DailyStockReportProps {
  items: ChillerItem[];
  transactions: Transaction[];
}

// Access global libraries from index.html
declare const XLSX: any;
declare const html2pdf: any;

const ALL_CATEGORIES = ['PDS', 'FPS', 'PARTING', 'BONELESS', 'MARINASI', 'RETUR', 'SMS', 'CS', 'IQF', 'SO FRESH'];

const normalizeCategory = (name: string): string => {
  const n = name.trim().toUpperCase();
  if (n === 'PDS') return 'PDS';
  if (n === 'FPS') return 'FPS';
  if (n === 'PARTING') return 'PARTING';
  if (n === 'BONELESS') return 'BONELESS';
  if (n.startsWith('MARINA') || n.startsWith('MARINATI')) return 'MARINASI';
  if (n.startsWith('RETUR') || n.startsWith('RETURN')) return 'RETUR';
  if (n === 'SMS') return 'SMS';
  if (n === 'CS' || n === 'COLD STORAGE') return 'CS';
  if (n === 'IQF') return 'IQF';
  if (n.includes('SO FRESH') || n.includes('SOFRESH')) return 'SO FRESH';
  return n;
};

interface StockRow {
  name: string;
  openingKgs: number;
  openingPcs: number;
  inKgs: number;
  inPcs: number;
  outKgs: number;
  outPcs: number;
  endingKgs: number;
  endingPcs: number;
  isWIPGroup?: boolean;
}

const DailyStockReport: React.FC<DailyStockReportProps> = ({ items, transactions }) => {
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [unit, setUnit] = useState<'KGS' | 'PCS'>('KGS');
  const [searchTerm, setSearchTerm] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  // Pre-group transactions by chillerId for faster performance (avoids O(N*T) loop)
  const transactionsByChillerId = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    transactions.forEach(t => {
      if (!map[t.chillerId]) {
        map[t.chillerId] = [];
      }
      map[t.chillerId].push(t);
    });
    return map;
  }, [transactions]);

  // Find active categories for IN and OUT in the selected date range
  const { activeInCats, activeOutCats, hasOtherIn, hasOtherOut } = useMemo(() => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const activeInSet = new Set<string>();
    const activeOutSet = new Set<string>();
    let otherInCount = 0;
    let otherOutCount = 0;

    transactions.forEach(t => {
      if (t.timestamp >= startRange && t.timestamp <= endRange) {
        if (t.type === 'IN') {
          const item = items.find(i => i.batchId === t.chillerId);
          const src = (item?.source || 'INFLOW').toUpperCase();
          const norm = normalizeCategory(src);
          if (ALL_CATEGORIES.includes(norm)) {
            activeInSet.add(norm);
          } else {
            otherInCount++;
          }
        } else if (t.type === 'OUT') {
          const dest = (t.destination || 'OUTFLOW').toUpperCase();
          const norm = normalizeCategory(dest);
          if (ALL_CATEGORIES.includes(norm)) {
            activeOutSet.add(norm);
          } else {
            otherOutCount++;
          }
        }
      }
    });

    const activeIn = ALL_CATEGORIES.filter(cat => activeInSet.has(cat));
    const activeOut = ALL_CATEGORIES.filter(cat => activeOutSet.has(cat));

    return {
      activeInCats: activeIn,
      activeOutCats: activeOut,
      hasOtherIn: otherInCount > 0,
      hasOtherOut: otherOutCount > 0
    };
  }, [startDate, endDate, transactions, items]);

  const reportData = useMemo(() => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const itemCodes: string[] = Array.from(new Set(items.map(i => i.itemCode)));
    const rows: StockRow[] = [];

    const processGroup = (filterFn: (item: ChillerItem) => boolean, label: string, isWIPGroup = false) => {
      const groupItems = items.filter(filterFn);

      // Look up transactions from precomputed map instead of filtering entire transactions array
      const groupTrx: Transaction[] = [];
      groupItems.forEach(i => {
        const batchTrxs = transactionsByChillerId[i.batchId];
        if (batchTrxs) {
          groupTrx.push(...batchTrxs);
        }
      });

      const sumT = (arr: Transaction[], key: 'kgs' | 'pcs') => arr.reduce((acc, curr) => acc + (curr[key] || 0), 0);

      // Opening Stock: (Total IN before range) - (Total OUT before range)
      const beforeInK = sumT(groupTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'kgs');
      const beforeOutK = sumT(groupTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'kgs');
      const openingKgs = beforeInK - beforeOutK;

      const beforeInP = sumT(groupTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'pcs');
      const beforeOutP = sumT(groupTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'pcs');
      const openingPcs = beforeInP - beforeOutP;

      // Movements during the range
      const dayInTrx = groupTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange);
      const dayOutTrx = groupTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange);

      const inKgs = sumT(dayInTrx, 'kgs');
      const inPcs = sumT(dayInTrx, 'pcs');
      const outKgs = sumT(dayOutTrx, 'kgs');
      const outPcs = sumT(dayOutTrx, 'pcs');

      // Ending Stock
      const endingKgs = openingKgs + inKgs - outKgs;
      const endingPcs = openingPcs + inPcs - outPcs;

      return {
        name: label,
        openingKgs,
        openingPcs,
        inKgs,
        inPcs,
        outKgs,
        outPcs,
        endingKgs,
        endingPcs,
        isWIPGroup
      };
    };

    // Add WIP Overall Row
    const wipRow = processGroup(i => !!i.isWIP, 'TOTAL WIP', true);
    if (wipRow.openingKgs > 0 || wipRow.inKgs > 0 || wipRow.outKgs > 0 || wipRow.openingPcs > 0 || wipRow.inPcs > 0 || wipRow.outPcs > 0) {
      rows.push(wipRow);
    }

    // Add Individual Items Row (Non-WIP)
    itemCodes.forEach((code: string) => {
      const row = processGroup(i => i.itemCode === code && !i.isWIP, code);
      if (row.openingKgs > 0 || row.inKgs > 0 || row.outKgs > 0 || row.openingPcs > 0 || row.inPcs > 0 || row.outPcs > 0) {
        rows.push(row);
      }
    });

    return rows;
  }, [items, startDate, endDate, transactionsByChillerId]);

  // Secondary useMemo to get WIP batch breakdown when expanded
  const wipBreakdown = useMemo(() => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const wipItems = items.filter(i => !!i.isWIP);

    return wipItems.filter(i => {
      const batchTrx = transactionsByChillerId[i.batchId] || [];
      const sumT = (arr: Transaction[], key: 'kgs' | 'pcs') => arr.reduce((acc, curr) => acc + (curr[key] || 0), 0);

      const beforeIn = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'kgs');
      const beforeOut = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'kgs');
      const opening = beforeIn - beforeOut;

      const dayIn = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange), 'kgs');
      const dayOut = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange), 'kgs');

      return opening > 0 || dayIn > 0 || dayOut > 0;
    });
  }, [items, transactionsByChillerId, startDate, endDate]);

  const getRowTableBreakdown = (rowName: string, isWIPRow: boolean = false) => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const groupItems = isWIPRow
      ? items.filter(i => !!i.isWIP)
      : items.filter(i => i.itemCode === rowName && !i.isWIP);

    const groupTrx: Transaction[] = [];
    groupItems.forEach(i => {
      const trxList = transactionsByChillerId[i.batchId];
      if (trxList) {
        groupTrx.push(...trxList);
      }
    });

    const dayInTrx = groupTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange);
    const dayOutTrx = groupTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange);

    const sumT = (arr: Transaction[], key: 'kgs' | 'pcs') => arr.reduce((acc, curr) => acc + (curr[key] || 0), 0);

    // Opening Stock
    const beforeInK = sumT(groupTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'kgs');
    const beforeOutK = sumT(groupTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'kgs');
    const openingKgs = beforeInK - beforeOutK;

    const beforeInP = sumT(groupTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'pcs');
    const beforeOutP = sumT(groupTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'pcs');
    const openingPcs = beforeInP - beforeOutP;

    // Map through sources
    const inMap: Record<string, number> = {};
    dayInTrx.forEach(t => {
      const item = groupItems.find(i => i.batchId === t.chillerId) || items.find(i => i.batchId === t.chillerId);
      const src = (item?.source || 'INFLOW').toUpperCase();
      const norm = normalizeCategory(src);
      const val = unit === 'KGS' ? t.kgs : t.pcs;
      inMap[norm] = (inMap[norm] || 0) + val;
    });

    // Map through destinations
    const outMap: Record<string, number> = {};
    dayOutTrx.forEach(t => {
      const dest = (t.destination || 'OUTFLOW').toUpperCase();
      const norm = normalizeCategory(dest);
      const val = unit === 'KGS' ? t.kgs : t.pcs;
      outMap[norm] = (outMap[norm] || 0) + val;
    });

    const totalIn = unit === 'KGS' ? sumT(dayInTrx, 'kgs') : sumT(dayInTrx, 'pcs');
    const totalOut = unit === 'KGS' ? sumT(dayOutTrx, 'kgs') : sumT(dayOutTrx, 'pcs');
    const opening = unit === 'KGS' ? openingKgs : openingPcs;
    const endingStock = opening + totalIn - totalOut;

    // Split category map and other
    const categorizedInMap: Record<string, number> = {};
    let otherIn = 0;
    Object.entries(inMap).forEach(([cat, val]) => {
      if (ALL_CATEGORIES.includes(cat)) {
        categorizedInMap[cat] = val;
      } else {
        otherIn += val;
      }
    });

    const categorizedOutMap: Record<string, number> = {};
    let otherOut = 0;
    Object.entries(outMap).forEach(([cat, val]) => {
      if (ALL_CATEGORIES.includes(cat)) {
        categorizedOutMap[cat] = val;
      } else {
        otherOut += val;
      }
    });

    return {
      opening,
      categorizedInMap,
      otherIn,
      totalIn,
      categorizedOutMap,
      otherOut,
      totalOut,
      endingStock
    };
  };

  const getBatchTableBreakdown = (batch: ChillerItem) => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const batchTrx = transactionsByChillerId[batch.batchId] || [];
    const dayInTrx = batchTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange);
    const dayOutTrx = batchTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange);

    const sumT = (arr: Transaction[], key: 'kgs' | 'pcs') => arr.reduce((acc, curr) => acc + (curr[key] || 0), 0);

    // Opening Stock
    const beforeInK = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'kgs');
    const beforeOutK = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'kgs');
    const openingKgs = beforeInK - beforeOutK;

    const beforeInP = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'pcs');
    const beforeOutP = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'pcs');
    const openingPcs = beforeInP - beforeOutP;

    // Map through sources
    const inMap: Record<string, number> = {};
    dayInTrx.forEach(t => {
      const val = unit === 'KGS' ? t.kgs : t.pcs;
      const src = (batch.source || 'INFLOW').toUpperCase();
      const norm = normalizeCategory(src);
      inMap[norm] = (inMap[norm] || 0) + val;
    });

    // Map through destinations
    const outMap: Record<string, number> = {};
    dayOutTrx.forEach(t => {
      const val = unit === 'KGS' ? t.kgs : t.pcs;
      const dest = (t.destination || 'OUTFLOW').toUpperCase();
      const norm = normalizeCategory(dest);
      outMap[norm] = (outMap[norm] || 0) + val;
    });

    const totalIn = unit === 'KGS' ? sumT(dayInTrx, 'kgs') : sumT(dayInTrx, 'pcs');
    const totalOut = unit === 'KGS' ? sumT(dayOutTrx, 'kgs') : sumT(dayOutTrx, 'pcs');
    const opening = unit === 'KGS' ? openingKgs : openingPcs;
    const endingStock = opening + totalIn - totalOut;

    // Split category map and other
    const categorizedInMap: Record<string, number> = {};
    let otherIn = 0;
    Object.entries(inMap).forEach(([cat, val]) => {
      if (ALL_CATEGORIES.includes(cat)) {
        categorizedInMap[cat] = val;
      } else {
        otherIn += val;
      }
    });

    const categorizedOutMap: Record<string, number> = {};
    let otherOut = 0;
    Object.entries(outMap).forEach(([cat, val]) => {
      if (ALL_CATEGORIES.includes(cat)) {
        categorizedOutMap[cat] = val;
      } else {
        otherOut += val;
      }
    });

    return {
      opening,
      categorizedInMap,
      otherIn,
      totalIn,
      categorizedOutMap,
      otherOut,
      totalOut,
      endingStock
    };
  };

  const filteredData = reportData.filter(row =>
    row.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const downloadExcel = () => {
    const headers = ["Item", `Opening Stock (${unit})`, `In (${unit})`, `Out (${unit})`, `Ending Stock (${unit})`];
    const rows = filteredData.map(r => [
      r.name,
      unit === 'KGS' ? r.openingKgs.toFixed(2) : r.openingPcs,
      unit === 'KGS' ? r.inKgs.toFixed(2) : r.inPcs,
      unit === 'KGS' ? r.outKgs.toFixed(2) : r.outPcs,
      unit === 'KGS' ? r.endingKgs.toFixed(2) : r.endingPcs,
    ]);

    const dateLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
    const worksheet = XLSX.utils.aoa_to_sheet([["LAPORAN STOK HARIAN", dateLabel], [], headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Stock");

    // Menampilkan log transaksi harian di tab kedua
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);
    const dayTrx = transactions.filter(t => t.timestamp >= startRange && t.timestamp <= endRange);

    const logHeaders = ["Waktu", "Tipe", "No Batch", "Kode Item", "Nama Item", "Kg", "Pcs", "Keterangan (Sumber/Destinasi)"];
    const logRows = dayTrx.sort((a, b) => b.timestamp - a.timestamp).map(t => {
      const item = items.find(i => i.batchId === t.chillerId);
      const timeStr = new Date(t.timestamp).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      const extraInfo = t.type === 'IN'
        ? (item?.source || 'Inflow')
        : t.type === 'OUT'
          ? (t.destination || 'Outflow')
          : t.type;

      return [
        timeStr,
        t.type,
        t.chillerId,
        item?.itemCode || t.itemCode || '-',
        item?.itemName || '-',
        t.kgs,
        t.pcs,
        extraInfo
      ];
    });

    const worksheetLogs = XLSX.utils.aoa_to_sheet([
      ["LOG TRANSAKSI HARIAN", dateLabel],
      [],
      logHeaders,
      ...logRows
    ]);

    XLSX.utils.book_append_sheet(workbook, worksheetLogs, "Log Transaksi");
    XLSX.writeFile(workbook, `laporan_stok_${dateLabel}.xlsx`);
  };

  const downloadPDF = () => {
    const element = document.getElementById('report-export-area');
    if (!element) return;

    const dateLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
    const opt = {
      margin: 10,
      filename: `laporan_stok_harian_${dateLabel}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Laporan Stok Harian</h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            Rekapitulasi Pergerakan Barang
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 action-buttons">
          <div className="flex items-center gap-1 bg-white border border-gray-200 p-1 rounded-xl shadow-sm">
            <button onClick={downloadPDF} className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-red-600" title="Download PDF">
              <FileText size={18} />
            </button>
            <div className="w-px h-4 bg-gray-100 mx-1"></div>
            <button onClick={downloadExcel} className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-green-600" title="Download Excel">
              <TableIcon size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5 lg:col-span-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
            <Calendar size={12} className="text-red-600" /> Tanggal Laporan
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              className="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none transition-all font-bold text-[10px] text-gray-700"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Dari Tanggal"
            />
            <input
              type="date"
              className="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none transition-all font-bold text-[10px] text-gray-700"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="Sampai Tanggal"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
            <Search size={12} className="text-red-600" /> Cari Item
          </label>
          <div className="relative group">
            <input
              type="text"
              placeholder="Cari deskripsi item..."
              className="w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none transition-all font-bold text-xs text-gray-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Hash size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
            <Info size={12} className="text-red-600" /> Satuan Tampilan
          </label>
          <div className="flex bg-gray-100 p-1 rounded-xl h-[42px]">
            {(['KGS', 'PCS'] as const).map(u => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`flex-1 rounded-lg text-[10px] font-black transition-all ${unit === u ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden" ref={reportRef}>
        <div className="p-4 border-b border-gray-50 flex items-center justify-between gap-4 print:hidden bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
              Periode: {startDate === endDate
                ? new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                : `${new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
              }
            </span>
          </div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:block">
            Menampilkan <span className="text-red-600">{filteredData.length}</span> Baris
          </div>
        </div>

        <div id="report-export-area" className="p-2 md:p-4 bg-white">
          <div className="hidden print:block mb-6 border-b-2 border-red-600 pb-4">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-xl font-black text-gray-900 uppercase">Laporan Stok Harian Chiller</h1>
                <p className="text-xs font-bold text-gray-500 uppercase">Bounty Segar Indonesia</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-gray-400 uppercase">Periode Laporan</p>
                <p className="text-xs font-bold text-gray-900">
                  {startDate === endDate
                    ? new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                    : `${new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-2 py-1.5 text-[8.5px] font-black text-gray-500 uppercase tracking-tight text-left min-w-[120px]">Kode Item</th>
                  <th className="px-1.5 py-1.5 text-[8.5px] font-black text-gray-500 uppercase tracking-tight text-right min-w-[70px]">Opening</th>

                  {activeInCats.map(cat => (
                    <th key={`in-${cat}`} className="px-1.5 py-1.5 text-[8.5px] font-black text-gray-400 uppercase tracking-tight text-right min-w-[55px]">{cat} (IN)</th>
                  ))}
                  {hasOtherIn && (
                    <th className="px-1.5 py-1.5 text-[8.5px] font-black text-gray-400 uppercase tracking-tight text-right min-w-[55px]">OTHER (IN)</th>
                  )}
                  <th className="px-1.5 py-1.5 text-[8.5px] font-black text-green-700 bg-green-50/50 uppercase tracking-tight text-right min-w-[70px]">TOTAL IN</th>

                  {activeOutCats.map(cat => (
                    <th key={`out-${cat}`} className="px-1.5 py-1.5 text-[8.5px] font-black text-gray-400 uppercase tracking-tight text-right min-w-[55px]">{cat} (OUT)</th>
                  ))}
                  {hasOtherOut && (
                    <th className="px-1.5 py-1.5 text-[8.5px] font-black text-gray-400 uppercase tracking-tight text-right min-w-[55px]">OTHER (OUT)</th>
                  )}
                  <th className="px-1.5 py-1.5 text-[8.5px] font-black text-blue-700 bg-blue-50/50 uppercase tracking-tight text-right min-w-[70px]">TOTAL OUT</th>

                  <th className="px-2 py-1.5 text-[8.5px] font-black text-red-700 bg-red-50/50 uppercase tracking-tight text-right min-w-[85px]">Ending Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredData.map((row, idx) => {
                  const isWIPRow = row.isWIPGroup;
                  const tbl = getRowTableBreakdown(row.name, isWIPRow);

                  return (
                    <React.Fragment key={idx}>
                      <tr className={`
                        hover:bg-gray-50 transition-colors border-b border-gray-100
                        ${isWIPRow ? 'bg-amber-50/40 font-black' : ''}
                      `}>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-6 rounded-full shrink-0 ${isWIPRow ? 'bg-amber-500' : 'bg-red-500'}`} />
                            <div className="leading-tight">
                              <span className={`text-[10px] font-black uppercase ${isWIPRow ? 'text-amber-800' : 'text-gray-900'}`}>
                                {row.name}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-1.5 py-1.5 text-right font-mono text-[12px] text-black">
                          {tbl.opening > 0 ? formatNumber(tbl.opening, unit === 'KGS' ? 2 : 0) : '0'}
                        </td>
                        {activeInCats.map(cat => {
                          const val = tbl.categorizedInMap[cat] || 0;
                          return (
                            <td key={`val-in-${cat}`} className="px-1.5 py-1.5 text-right font-mono text-[12px] text-black">
                              {val > 0 ? formatNumber(val, unit === 'KGS' ? 2 : 0) : ''}
                            </td>
                          );
                        })}
                        {hasOtherIn && (
                          <td className="px-1.5 py-1.5 text-right font-mono text-[12px] text-black">
                            {tbl.otherIn > 0 ? formatNumber(tbl.otherIn, unit === 'KGS' ? 2 : 0) : ''}
                          </td>
                        )}
                        <td className="px-1.5 py-1.5 text-right font-mono font-black text-green-700 bg-green-50/10 text-[12px]">
                          {tbl.totalIn > 0 ? formatNumber(tbl.totalIn, unit === 'KGS' ? 2 : 0) : '0'}
                        </td>

                        {activeOutCats.map(cat => {
                          const val = tbl.categorizedOutMap[cat] || 0;
                          return (
                            <td key={`val-out-${cat}`} className="px-1.5 py-1.5 text-right font-mono text-[12px] text-black">
                              {val > 0 ? formatNumber(val, unit === 'KGS' ? 2 : 0) : ''}
                            </td>
                          );
                        })}
                        {hasOtherOut && (
                          <td className="px-1.5 py-1.5 text-right font-mono text-[12px] text-black">
                            {tbl.otherOut > 0 ? formatNumber(tbl.otherOut, unit === 'KGS' ? 2 : 0) : ''}
                          </td>
                        )}
                        <td className="px-1.5 py-1.5 text-right font-mono font-black text-blue-700 bg-blue-50/10 text-[12px]">
                          {tbl.totalOut > 0 ? formatNumber(tbl.totalOut, unit === 'KGS' ? 2 : 0) : '0'}
                        </td>

                        <td className="px-2 py-1.5 text-right font-mono font-black text-red-700 bg-red-50/10 text-[12px]">
                          {formatNumber(tbl.endingStock, unit === 'KGS' ? 2 : 0)}
                        </td>
                      </tr>

                      {isWIPRow && wipBreakdown.map((batch, bIdx) => {
                        const batchTbl = getBatchTableBreakdown(batch);
                        return (
                          <tr key={`wip-batch-${bIdx}`} className="bg-amber-50/10 border-b border-gray-100 hover:bg-amber-50/20 transition-colors">
                            <td className="px-2 py-1 pl-6">
                              <div className="flex flex-col ml-3">
                                <span className="text-[8.5px] font-black text-amber-800 uppercase flex items-center gap-1">
                                  <Hash size={10} /> {batch.batchId}
                                </span>
                                <span className="text-[7.5px] font-bold text-gray-500 uppercase leading-none mt-0.5">
                                  {batch.itemCode}
                                </span>
                              </div>
                            </td>
                            <td className="px-1.5 py-1 text-right font-mono text-[12px] text-black">
                              {batchTbl.opening > 0 ? formatNumber(batchTbl.opening, unit === 'KGS' ? 2 : 0) : '0'}
                            </td>
                            {activeInCats.map(cat => {
                              const val = batchTbl.categorizedInMap[cat] || 0;
                              return (
                                <td key={`batch-in-${cat}`} className="px-1.5 py-1 text-right font-mono text-[12px] text-black">
                                  {val > 0 ? formatNumber(val, unit === 'KGS' ? 2 : 0) : ''}
                                </td>
                              );
                            })}
                            {hasOtherIn && (
                              <td className="px-1.5 py-1 text-right font-mono text-[12px] text-black">
                                {batchTbl.otherIn > 0 ? formatNumber(batchTbl.otherIn, unit === 'KGS' ? 2 : 0) : ''}
                              </td>
                            )}
                            <td className="px-1.5 py-1 text-right font-mono font-bold text-green-600 bg-green-50/5 text-[12px]">
                              {batchTbl.totalIn > 0 ? formatNumber(batchTbl.totalIn, unit === 'KGS' ? 2 : 0) : '0'}
                            </td>

                            {activeOutCats.map(cat => {
                              const val = batchTbl.categorizedOutMap[cat] || 0;
                              return (
                                <td key={`batch-out-${cat}`} className="px-1.5 py-1 text-right font-mono text-[12px] text-black">
                                  {val > 0 ? formatNumber(val, unit === 'KGS' ? 2 : 0) : ''}
                                </td>
                              );
                            })}
                            {hasOtherOut && (
                              <td className="px-1.5 py-1 text-right font-mono text-[12px] text-black">
                                {batchTbl.otherOut > 0 ? formatNumber(batchTbl.otherOut, unit === 'KGS' ? 2 : 0) : ''}
                              </td>
                            )}
                            <td className="px-1.5 py-1 text-right font-mono font-bold text-blue-600 bg-blue-50/5 text-[12px]">
                              {batchTbl.totalOut > 0 ? formatNumber(batchTbl.totalOut, unit === 'KGS' ? 2 : 0) : '0'}
                            </td>

                            <td className="px-2 py-1 text-right font-mono font-bold text-red-600 bg-red-50/5 text-[12px]">
                              {formatNumber(batchTbl.endingStock, unit === 'KGS' ? 2 : 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {filteredData.length > 0 && (() => {
                const totalOpening = filteredData.reduce((acc, r) => acc + getRowTableBreakdown(r.name, r.isWIPGroup).opening, 0);
                const totalTotalIn = filteredData.reduce((acc, r) => acc + getRowTableBreakdown(r.name, r.isWIPGroup).totalIn, 0);
                const totalTotalOut = filteredData.reduce((acc, r) => acc + getRowTableBreakdown(r.name, r.isWIPGroup).totalOut, 0);
                const totalEndingStock = filteredData.reduce((acc, r) => acc + getRowTableBreakdown(r.name, r.isWIPGroup).endingStock, 0);

                return (
                  <tfoot className="bg-gray-900 text-white font-black">
                    <tr>
                      <td className="px-2 py-2 text-[9.5px]/none font-black uppercase">Grand Total ({unit})</td>
                      <td className="px-1.5 py-2 text-right text-[10px] font-mono font-black">
                        {formatNumber(totalOpening, unit === 'KGS' ? 2 : 0)}
                      </td>

                      {activeInCats.map(cat => {
                        const totalCatIn = filteredData.reduce((acc, r) => acc + (getRowTableBreakdown(r.name, r.isWIPGroup).categorizedInMap[cat] || 0), 0);
                        return (
                          <td key={`total-in-${cat}`} className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-green-400">
                            {totalCatIn > 0 ? formatNumber(totalCatIn, unit === 'KGS' ? 2 : 0) : ''}
                          </td>
                        );
                      })}
                      {hasOtherIn && (() => {
                        const totalOtherIn = filteredData.reduce((acc, r) => acc + getRowTableBreakdown(r.name, r.isWIPGroup).otherIn, 0);
                        return (
                          <td className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-green-400">
                            {totalOtherIn > 0 ? formatNumber(totalOtherIn, unit === 'KGS' ? 2 : 0) : ''}
                          </td>
                        );
                      })()}
                      <td className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-green-400 bg-gray-800">
                        {formatNumber(totalTotalIn, unit === 'KGS' ? 2 : 0)}
                      </td>

                      {activeOutCats.map(cat => {
                        const totalCatOut = filteredData.reduce((acc, r) => acc + (getRowTableBreakdown(r.name, r.isWIPGroup).categorizedOutMap[cat] || 0), 0);
                        return (
                          <td key={`total-out-${cat}`} className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-blue-400">
                            {totalCatOut > 0 ? formatNumber(totalCatOut, unit === 'KGS' ? 2 : 0) : ''}
                          </td>
                        );
                      })}
                      {hasOtherOut && (() => {
                        const totalOtherOut = filteredData.reduce((acc, r) => acc + getRowTableBreakdown(r.name, r.isWIPGroup).otherOut, 0);
                        return (
                          <td className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-blue-400">
                            {totalOtherOut > 0 ? formatNumber(totalOtherOut, unit === 'KGS' ? 2 : 0) : ''}
                          </td>
                        );
                      })()}
                      <td className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-blue-400 bg-gray-800">
                        {formatNumber(totalTotalOut, unit === 'KGS' ? 2 : 0)}
                      </td>

                      <td className="px-2 py-2 text-right text-[10px] font-mono font-black text-red-400 bg-gray-800/50">
                        {formatNumber(totalEndingStock, unit === 'KGS' ? 2 : 0)}
                      </td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>

          <div className="hidden print:block mt-12">
            <div className="flex justify-between">
              <div className="text-center w-40 border-t border-gray-300 pt-2">
                <p className="text-[10px] font-black uppercase text-gray-400">Dibuat Oleh</p>
                <div className="h-16"></div>
                <p className="text-xs font-bold text-gray-900">( .................... )</p>
              </div>
              <div className="text-center w-40 border-t border-gray-300 pt-2">
                <p className="text-[10px] font-black uppercase text-gray-400">Disetujui Oleh</p>
                <div className="h-16"></div>
                <p className="text-xs font-bold text-gray-900">( .................... )</p>
              </div>
            </div>
          </div>
        </div>

        {filteredData.length === 0 && (
          <div className="p-20 text-center">
            <Info className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Tidak Ada Data Untuk Tanggal Ini</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyStockReport;
