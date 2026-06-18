
import React, { useState, useMemo } from 'react';
import { ChillerItem, Transaction, SystemLog, User } from '../types';
import { formatNumber } from '@/utils';
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
  Scale,
  TrendingDown,
  Edit,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface ReportsProps {
  items: ChillerItem[];
  transactions: Transaction[];
  logs: SystemLog[];
  users: User[];
  currentUser?: User | null;
  onUpdateHarvest?: (transactionId: string, harvestPcs: number, harvestKgs: number) => Promise<void>;
  onUpdateHarvestBulk?: (updates: { transactionId: string, harvestPcs: number, harvestKgs: number, itemCode: string }[]) => Promise<void>;
  itemsMaster?: { code: string; name: string }[];
}

declare const XLSX: any;

const Reports: React.FC<ReportsProps> = ({
  items,
  transactions,
  logs,
  users,
  currentUser,
  onUpdateHarvest,
  onUpdateHarvestBulk,
  itemsMaster = []
}) => {
  const [tab, setTab] = useState<'TRANSACTIONS' | 'LOGS' | 'STOCK_CARD' | 'ALLOCATION' | 'PEMBANDING_IQF'>('TRANSACTIONS');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<Transaction['type'] | 'ALL'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');

  const [harvestTrxId, setHarvestTrxId] = useState<string | null>(null);
  const [harvestInputPcs, setHarvestInputPcs] = useState<string>('');
  const [harvestInputKgs, setHarvestInputKgs] = useState<string>('');

  // Excel Import States for IQF Comparison
  const [importedData, setImportedData] = useState<{
    no: any;
    excelItemName: string;
    excelPD: string;
    excelPcs: number;
    excelKgs: number;
    matchedTransactions: {
      transactionId: string;
      chillerId: string;
      itemCode: string;
      itemName: string;
      sendPcs: number;
      sendKgs: number;
      productionDate: string;
    }[];
    status: 'MATCHED' | 'NOT_FOUND';
  }[]>([]);
  const [excelFileName, setExcelFileName] = useState<string>('');
  const [showImportSection, setShowImportSection] = useState<boolean>(false);
  const [expandedTrxBatchIds, setExpandedTrxBatchIds] = useState<Record<string, boolean>>({});

  const parseExcelDate = (val: any): string => {
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      const userTimezoneOffset = date.getTimezoneOffset() * 60000;
      const localDate = new Date(date.getTime() + userTimezoneOffset);
      const yr = localDate.getFullYear();
      const mo = String(localDate.getMonth() + 1).padStart(2, '0');
      const dy = String(localDate.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${dy}`;
    }
    if (typeof val === 'string') {
      const cleaned = val.trim();
      let m = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) {
        let day = parseInt(m[1], 10);
        let month = parseInt(m[2], 10);
        let year = parseInt(m[3], 10);
        if (year < 100) year += 2000;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      m = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
      if (m) {
        let year = parseInt(m[1], 10);
        let month = parseInt(m[2], 10);
        let day = parseInt(m[3], 10);
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    return String(val || '').trim();
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[];

        if (rawRows.length < 2) {
          alert("File Excel kosong atau tidak memiliki data baris.");
          return;
        }

        const headers = (rawRows[0] as any[]).map(h => String(h || '').trim().toUpperCase());

        const itemColIdx = headers.findIndex(h => h.includes('ITEM') || h.includes('PRODUK') || h.includes('NAMA'));
        const pdColIdx = headers.findIndex(h => h.includes('PD') || h.includes('PROD') || h.includes('TANGGAL') || h.includes('DATE') || h.includes('TGL'));
        const pcsColIdx = headers.findIndex(h => h.includes('PCS') || h.includes('QTY') || h.includes('JUMLAH'));
        const kgsColIdx = headers.findIndex(h => h.includes('KG') || h.includes('BERAT') || h.includes('WEIGHT') || h.includes('KILOGRAM'));

        if (itemColIdx === -1 || pdColIdx === -1 || pcsColIdx === -1 || kgsColIdx === -1) {
          alert("Gagal mendeteksi kolom yang diperlukan. Pastikan file Excel Anda memiliki header: NAMA ITEM, PD, PCS, KGS");
          return;
        }

        // First group rows by (itemVal lowercased + normalizedPD) and aggregate pcs and kgs
        const groupedMap = new Map<string, {
          itemVal: string;
          normalizedPD: string;
          pcsVal: number;
          kgsVal: number;
          rowIndices: number[];
        }>();

        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;

          const itemVal = String(row[itemColIdx] || '').trim();
          const pdRaw = row[pdColIdx];
          const pcsVal = parseInt(row[pcsColIdx]) || 0;
          const kgsVal = parseFloat(row[kgsColIdx]) || 0;

          if (!itemVal) continue;

          const normalizedPD = parseExcelDate(pdRaw);
          const key = `${itemVal.toLowerCase().trim()}||${normalizedPD.trim()}`;

          if (groupedMap.has(key)) {
            const existing = groupedMap.get(key)!;
            existing.pcsVal += pcsVal;
            existing.kgsVal = parseFloat((existing.kgsVal + kgsVal).toFixed(2));
            existing.rowIndices.push(i + 1);
          } else {
            groupedMap.set(key, {
              itemVal,
              normalizedPD,
              pcsVal,
              kgsVal,
              rowIndices: [i + 1]
            });
          }
        }

        const parsed: typeof importedData = [];

        for (const group of groupedMap.values()) {
          const matchingStockItems = items.filter(stock => {
            const codeMatch = stock.itemCode.toLowerCase().trim() === group.itemVal.toLowerCase().trim();
            const nameMatch = stock.itemName.toLowerCase().trim() === group.itemVal.toLowerCase().trim();
            const pdMatch = (stock.productionDate || '').trim() === group.normalizedPD.trim();
            return (codeMatch || nameMatch) && pdMatch;
          });

          const matchingBatchIds = new Set(matchingStockItems.map(s => s.batchId));

          const matchedTrxs = transactions.filter(t => {
            const isMatchBatch = matchingBatchIds.has(t.chillerId);
            const isIqfOut = t.type === 'OUT' && t.destination === 'IQF';
            return isMatchBatch && isIqfOut;
          }).map(t => {
            const stock = items.find(s => s.batchId === t.chillerId);
            return {
              transactionId: t.id,
              chillerId: t.chillerId,
              itemCode: t.itemCode || stock?.itemCode || 'N/A',
              itemName: stock?.itemName || 'N/A',
              sendPcs: t.pcs,
              sendKgs: t.kgs,
              productionDate: stock?.productionDate || 'N/A'
            };
          });

          parsed.push({
            no: group.rowIndices.join(', '),
            excelItemName: group.itemVal,
            excelPD: group.normalizedPD,
            excelPcs: group.pcsVal,
            excelKgs: group.kgsVal,
            matchedTransactions: matchedTrxs,
            status: matchedTrxs.length > 0 ? 'MATCHED' : 'NOT_FOUND'
          });
        }

        setImportedData(parsed);
      } catch (err: any) {
        console.error("error parsing excel", err);
        alert(`Gagal menganalisis file Excel: ${err?.message || err}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveImportedData = async () => {
    if (!onUpdateHarvestBulk) {
      alert("Fungsi pembaruan massal tidak siap.");
      return;
    }

    const updates: { transactionId: string, harvestPcs: number, harvestKgs: number, itemCode: string }[] = [];

    importedData.forEach(item => {
      if (item.status === 'MATCHED' && item.matchedTransactions.length > 0) {
        const totalSendPcs = item.matchedTransactions.reduce((sum, t) => sum + t.sendPcs, 0);
        const totalSendKgs = item.matchedTransactions.reduce((sum, t) => sum + t.sendKgs, 0);

        item.matchedTransactions.forEach(t => {
          let sharePcs = 0;
          let shareKgs = 0;

          if (item.matchedTransactions.length === 1) {
            sharePcs = item.excelPcs;
            shareKgs = item.excelKgs;
          } else {
            const weightRatio = totalSendKgs > 0 ? (t.sendKgs / totalSendKgs) : (1 / item.matchedTransactions.length);
            const pcsRatio = totalSendPcs > 0 ? (t.sendPcs / totalSendPcs) : (1 / item.matchedTransactions.length);

            sharePcs = Math.round(item.excelPcs * pcsRatio);
            shareKgs = parseFloat((item.excelKgs * weightRatio).toFixed(2));
          }

          updates.push({
            transactionId: t.transactionId,
            harvestPcs: sharePcs,
            harvestKgs: shareKgs,
            itemCode: t.itemCode
          });
        });
      } else {
        // If there is no matched transaction/batch, we still include and insert it!
        // Generate a synthetic transaction identifier starting with NEW-
        const syntheticTrxId = `NEW-${item.excelItemName.trim()}||${item.excelPD.trim()}`;
        updates.push({
          transactionId: syntheticTrxId,
          harvestPcs: item.excelPcs,
          harvestKgs: item.excelKgs,
          itemCode: item.excelItemName.trim()
        });
      }
    });

    if (updates.length === 0) {
      alert("Tidak ada transaksi untuk disimpan.");
      return;
    }

    try {
      await onUpdateHarvestBulk(updates);
      setImportedData([]);
      setExcelFileName('');
    } catch (err) {
      // handled
    }
  };

  const downloadTemplate = () => {
    const wsData = [
      ["NAMA ITEM", "PD", "PCS", "KGS"],
      ["BONELESS DADA", "2026-06-04", 120, 110.5],
      ["BS01", "2026-06-05", 80, 75.2]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Harvest IQF");
    XLSX.writeFile(wb, "Template_Import_Hasil_Harvest_IQF.xlsx");
  };

  const comparativeIqfData = useMemo(() => {
    const list = transactions.filter(t => t.type === 'OUT' && t.destination === 'IQF');

    // 1. Map item reference details to each transaction
    const mapped = list.map(t => {
      const stockItem = items.find(stock => stock.batchId === t.chillerId);
      const resolvedCode = t.itemCode || stockItem?.itemCode || 'N/A';

      // Let's find the matching master item to get the itemName, if stockItem doesn't exist or is N/A
      let resolvedName = stockItem?.itemName || 'N/A';
      if (resolvedName === 'N/A' && resolvedCode !== 'N/A') {
        const masterItem = itemsMaster?.find(m => m.code.toLowerCase().trim() === resolvedCode.toLowerCase().trim() || m.name.toLowerCase().trim() === resolvedCode.toLowerCase().trim());
        if (masterItem) {
          resolvedName = masterItem.name;
        } else {
          // Fallback: search in items list for any item with same itemCode
          const altItem = items.find(i => i.itemCode.toLowerCase().trim() === resolvedCode.toLowerCase().trim());
          if (altItem) {
            resolvedName = altItem.itemName;
          }
        }
      }

      let resolvedPD = stockItem?.productionDate || 'N/A';
      if (resolvedPD === 'N/A' && t.timestamp) {
        resolvedPD = new Date(t.timestamp).toISOString().split('T')[0];
      }

      return {
        ...t,
        itemCode: resolvedCode,
        itemName: resolvedName,
        productionDate: resolvedPD
      };
    });

    // 2. Filter based on modern search preferences and dates
    const filtered = mapped.filter(t => {
      const searchStr = searchTerm.toLowerCase();
      const matchesSearch =
        t.chillerId.toLowerCase().includes(searchStr) ||
        t.itemCode.toLowerCase().includes(searchStr) ||
        t.itemName.toLowerCase().includes(searchStr);

      const trxDate = new Date(t.timestamp).toISOString().split('T')[0];
      const matchesStart = !filterStartDate || trxDate >= filterStartDate;
      const matchesEnd = !filterEndDate || trxDate <= filterEndDate;

      return matchesSearch && matchesStart && matchesEnd;
    });

    // 3. Group by unique key of itemCode and productionDate
    const groups: {
      [key: string]: {
        id: string;
        itemCode: string;
        itemName: string;
        productionDate: string;
        kgs: number;
        pcs: number;
        harvestKgs: number;
        harvestPcs: number;
        batchIds: string[];
        transactionIds: string[];
      }
    } = {};

    filtered.forEach(t => {
      const key = `${t.itemCode.trim()}||${t.productionDate.trim()}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          itemCode: t.itemCode,
          itemName: t.itemName,
          productionDate: t.productionDate,
          kgs: 0,
          pcs: 0,
          harvestKgs: 0,
          harvestPcs: 0,
          batchIds: [],
          transactionIds: []
        };
      }
      const g = groups[key];
      g.kgs += t.kgs;
      g.pcs += t.pcs;
      g.harvestKgs += (t.harvestKgs || 0);
      g.harvestPcs += (t.harvestPcs || 0);
      if (!g.batchIds.includes(t.chillerId)) {
        g.batchIds.push(t.chillerId);
      }
      g.transactionIds.push(t.id);
    });

    // 4. Return sorted by productionDate descending
    return Object.values(groups).sort((a, b) => b.productionDate.localeCompare(a.productionDate));
  }, [transactions, items, itemsMaster, searchTerm, filterStartDate, filterEndDate]);

  const itemCodes = useMemo(() => {
    return Array.from(new Set(items.map(i => i.itemCode))).sort();
  }, [items]);

  const allocationData = useMemo(() => {
    if (tab !== 'ALLOCATION') return [];

    const startOfDay = filterStartDate ? new Date(filterStartDate).setHours(0, 0, 0, 0) : 0;
    const endOfDay = filterEndDate ? new Date(filterEndDate).setHours(23, 59, 59, 999) : Infinity;

    // Group items by allocation
    const allocations = Array.from(new Set(items.map(i => i.allocation)));

    return allocations.map(alloc => {
      const batchesInAlloc = items.filter(i => i.allocation === alloc);
      const batchIds = new Set(batchesInAlloc.map(b => b.batchId));

      // Find all OUT transactions for these batches within date range
      const outTrx = transactions.filter(t =>
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
  }, [tab, items, transactions, filterStartDate, filterEndDate]);

  const stockCardData = useMemo(() => {
    if (tab !== 'STOCK_CARD' || !selectedItemCode) return [];

    // Get all transactions for this item code
    // Note: Some transactions might not have itemCode if they were from old batches, 
    // but we can try to find them via chillerId -> item batch mapping
    const batchIdsForItem = new Set(items.filter(i => i.itemCode === selectedItemCode).map(i => i.batchId));

    const relevantTrx = transactions.filter(t =>
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
  }, [tab, selectedItemCode, transactions, items]);

  const filteredTrx = useMemo(() => {
    return transactions.filter(t => {
      const item = items.find(i => i.batchId === t.chillerId);

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

      return matchesSearch && matchesStart && matchesEnd && matchesType;
    });
  }, [transactions, items, searchTerm, filterType, filterStartDate, filterEndDate]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l =>
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.details.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [logs, searchTerm]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterType('ALL');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Audit Trail & Mutasi</h2>
          <p className="text-sm text-gray-500 font-medium">Rekaman riwayat pergerakan chiller</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto gap-1">
          <button onClick={() => setTab('TRANSACTIONS')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'TRANSACTIONS' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>TRANSAKSI</button>
          <button onClick={() => setTab('PEMBANDING_IQF')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'PEMBANDING_IQF' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>PEMBANDING IQF</button>
          <button onClick={() => setTab('STOCK_CARD')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'STOCK_CARD' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>KARTU STOK</button>
          <button onClick={() => setTab('ALLOCATION')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'ALLOCATION' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>LAP. ALOKASI</button>
          <button onClick={() => setTab('LOGS')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'LOGS' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>LOG SISTEM</button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {tab === 'TRANSACTIONS' || tab === 'LOGS' || tab === 'PEMBANDING_IQF' ? (
            <div className="md:col-span-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder={tab === 'PEMBANDING_IQF' ? "Cari Batch, Kode atau Nama Item..." : "Cari Batch ID atau Produk..."}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          ) : tab === 'STOCK_CARD' ? (
            <div className="md:col-span-6">
              <select
                className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600"
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

          {(tab === 'TRANSACTIONS' || tab === 'ALLOCATION' || tab === 'PEMBANDING_IQF') && (
            <>
              {tab === 'TRANSACTIONS' && (
                <div className="md:col-span-2">
                  <select
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600"
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
              )}
              {tab === 'PEMBANDING_IQF' && (
                <div className="md:col-span-2 flex items-center pr-2">
                  <span className="text-[9px] font-extrabold text-blue-600 uppercase tracking-wide bg-blue-50 px-2 py-1 rounded">Tanggal Kirim:</span>
                </div>
              )}
              <div className={(tab === 'ALLOCATION' || tab === 'PEMBANDING_IQF') ? "md:col-span-3" : "md:col-span-2"}>
                <input
                  type="date"
                  className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>
              <div className={(tab === 'ALLOCATION' || tab === 'PEMBANDING_IQF') ? "md:col-span-3" : "md:col-span-2"}>
                <input
                  type="date"
                  className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <button onClick={resetFilters} className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl text-[10px] font-black uppercase">Reset</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {tab === 'TRANSACTIONS' ? (
          <div className="overflow-x-auto font-sans">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Batch ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Aktivitas</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">User</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Volume Kirim</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Hasil Harvest & Penyusutan</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTrx.length > 0 ? (
                  filteredTrx.map(trx => {
                    const item = items.find(i => i.batchId === trx.chillerId);
                    return (
                      <tr key={trx.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-[10px] font-black text-red-600 uppercase tracking-tighter">{trx.chillerId}</div>
                          <div className="text-[11px] font-bold text-gray-800 uppercase">{trx.itemCode || item?.itemCode || 'Batch Selesai/Keluar'}</div>
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
                            <span className="text-xs font-bold text-gray-600 uppercase">{trx.userId}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="text-xs font-black text-gray-800">{formatNumber(trx.pcs, 0)} Pcs</div>
                          <div className="text-[10px] font-bold text-gray-400">{formatNumber(trx.kgs, 2)} Kg</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {trx.type === 'OUT' && trx.destination === 'IQF' ? (
                            <div className="flex flex-col items-end gap-1">
                              {trx.harvestKgs !== undefined ? (
                                <>
                                  <div className="text-xs font-black text-purple-700">{formatNumber(trx.harvestPcs ?? 0, 0)} Pcs</div>
                                  <div className="text-[10px] font-black text-purple-700">{formatNumber(trx.harvestKgs, 2)} Kg</div>

                                  {(() => {
                                    const shrinkPcs = trx.pcs - (trx.harvestPcs ?? 0);
                                    const shrinkKgs = trx.kgs - trx.harvestKgs;
                                    const shrinkPct = trx.kgs > 0 ? (shrinkKgs / trx.kgs) * 100 : 0;
                                    return (
                                      <div className="flex items-center gap-1 text-[9px] font-semibold text-rose-600 mt-0.5 bg-rose-50 px-2 py-0.5 rounded">
                                        <TrendingDown size={10} />
                                        <span>Susut {shrinkPct.toFixed(2)}% ({formatNumber(shrinkKgs, 2)} Kg)</span>
                                      </div>
                                    );
                                  })()}

                                  {(currentUser?.role?.toUpperCase() === 'ADMIN' || currentUser?.role?.toUpperCase() === 'SUPERADMIN') && (
                                    <button
                                      onClick={() => {
                                        setHarvestTrxId(trx.id);
                                        setHarvestInputPcs(String(trx.harvestPcs ?? ''));
                                        setHarvestInputKgs(String(trx.harvestKgs ?? ''));
                                      }}
                                      className="text-[9px] font-bold text-red-600 hover:text-red-700 flex items-center gap-0.5 mt-1 underline cursor-pointer"
                                    >
                                      <Edit size={8} /> Edit Hasil
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded">Belum Diinput</span>

                                  {(currentUser?.role?.toUpperCase() === 'ADMIN' || currentUser?.role?.toUpperCase() === 'SUPERADMIN') ? (
                                    <button
                                      onClick={() => {
                                        setHarvestTrxId(trx.id);
                                        setHarvestInputPcs(String(trx.pcs));
                                        setHarvestInputKgs(String(trx.kgs));
                                      }}
                                      className="text-[9px] font-bold bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-md transition-colors mt-1 cursor-pointer flex items-center gap-1"
                                    >
                                      <Edit size={10} /> Input Pembanding
                                    </button>
                                  ) : (
                                    <span className="text-[8px] font-medium text-gray-400">Menunggu Admin</span>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 whitespace-nowrap">
                          {new Date(trx.timestamp).toLocaleString('id-ID', { hour12: false })}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-black uppercase text-[10px]">Data tidak ditemukan</td></tr>
                )}
              </tbody>
            </table>
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
        ) : tab === 'PEMBANDING_IQF' ? (
          <div className="p-6 space-y-6">
            {/* Import & Info Header Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {!showImportSection ? (
                <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-red-50/50 border border-red-100/50 p-4 rounded-xl flex flex-col justify-between">
                    <span className="text-[8px] font-black text-red-700 uppercase tracking-widest block font-sans">Total Kirim IQF</span>
                    <div className="mt-1 flex items-baseline justify-between">
                      <div>
                        <span className="text-lg font-black text-gray-950 block font-sans">
                          {formatNumber(comparativeIqfData.reduce((sum, t) => sum + t.kgs, 0), 2)} Kg
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase font-sans">
                          {formatNumber(comparativeIqfData.reduce((sum, t) => sum + t.pcs, 0), 0)} Pcs dikirim
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-50/50 border border-emerald-100/50 p-4 rounded-xl flex flex-col justify-between">
                    <span className="text-[8px] font-black text-emerald-700 uppercase tracking-widest block font-sans">Total Hasil Harvest</span>
                    <div className="mt-1">
                      {(() => {
                        let totalHarvestKgs = 0;
                        let totalHarvestPcs = 0;
                        let evaluatedCount = 0;

                        comparativeIqfData.forEach(t => {
                          const hKgs = t.harvestKgs || 0;
                          const hPcs = t.harvestPcs || 0;
                          if (hKgs > 0) {
                            totalHarvestKgs += hKgs;
                            totalHarvestPcs += hPcs;
                            evaluatedCount++;
                          }
                        });

                        return (
                          <>
                            <span className="text-lg font-black text-gray-950 block font-sans">
                              {formatNumber(totalHarvestKgs, 2)} Kg
                            </span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase font-sans">
                              {evaluatedCount} dari {comparativeIqfData.length} Item terkomparasi
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <button
                    onClick={() => setShowImportSection(true)}
                    className="bg-gray-50/40 hover:bg-red-50/30 border border-gray-100 hover:border-red-200 p-4 rounded-xl flex items-center justify-between transition-all group duration-200 cursor-pointer text-left focus:outline-none"
                  >
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-black text-red-600 uppercase tracking-widest block font-sans">Alat Bantu</span>
                      <span className="text-xs font-black text-gray-950 block font-sans uppercase">Import Excel</span>
                      <span className="text-[8px] font-bold text-gray-400 uppercase font-sans">Klik untuk buka panel</span>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-650 group-hover:scale-105 transition-transform">
                      <Upload size={14} />
                    </div>
                  </button>
                </div>
              ) : (
                <>
                  <div className="lg:col-span-8 bg-gray-50 border border-gray-100 p-6 rounded-2xl space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                          <Upload size={16} className="text-red-600" /> IMPORT EXCEL KOMPARASI HARVEST
                        </h3>
                        <p className="text-xs text-gray-500 font-medium mt-1">
                          Unggah dokumen laporan hasil harvest untuk dicocokkan secara otomatis berdasarkan <span className="font-bold text-red-600">NAMA ITEM</span> & <span className="font-bold text-red-600">PRODUCTION DATE (PD)</span>.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={downloadTemplate}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase transition-all tracking-wide cursor-pointer shrink-0 shadow-sm"
                        >
                          <Download size={12} /> Unduh Template
                        </button>
                        <button
                          onClick={() => setShowImportSection(false)}
                          className="px-2.5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer shadow-sm"
                        >
                          Sembunyikan
                        </button>
                      </div>
                    </div>

                    {(currentUser?.role?.toUpperCase() === 'ADMIN' || currentUser?.role?.toUpperCase() === 'SUPERADMIN') ? (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        <div className="md:col-span-8 relative">
                          <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-red-600 bg-white px-6 py-6 rounded-2xl cursor-pointer group transition-all">
                            <div className="flex flex-col items-center text-center space-y-1">
                              <Upload className="text-gray-400 group-hover:text-red-600 transition-colors" size={24} />
                              <span className="text-[10px] font-black text-gray-700 uppercase">
                                {excelFileName ? excelFileName : "Pilih atau Seret File Excel (.xlsx / .xls)"}
                              </span>
                              <span className="text-[9px] text-gray-400 font-semibold uppercase">
                                Kolom wajib: NAMA ITEM, PD, PCS, KGS
                              </span>
                            </div>
                            <input
                              type="file"
                              accept=".xlsx,.xls"
                              className="hidden"
                              onChange={handleExcelImport}
                            />
                          </label>
                        </div>

                        <div className="md:col-span-4 flex flex-col gap-2">
                          {importedData.length > 0 && (
                            <>
                              <button
                                onClick={handleSaveImportedData}
                                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-red-600/10 cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <CheckCircle2 size={13} /> Simpan Hasil Impor
                              </button>
                              <button
                                onClick={() => {
                                  setImportedData([]);
                                  setExcelFileName('');
                                }}
                                className="w-full py-3 bg-white hover:bg-gray-50 text-gray-500 border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer"
                              >
                                Batalkan
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-2 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                        <AlertCircle size={14} className="shrink-0" />
                        Hanya pengguna dengan wewenang Admin / Superadmin yang dapat melakukan penimporan data Excel hasil harvest.
                      </div>
                    )}
                  </div>

                  {/* Statistics Panel */}
                  <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-4">
                    <div className="bg-red-50/50 border border-red-100/50 p-4 rounded-2xl flex flex-col justify-between">
                      <span className="text-[8px] font-black text-red-700 uppercase tracking-widest block font-sans">Total Kirim IQF</span>
                      <div className="mt-2">
                        <span className="text-xl font-black text-gray-950 block font-sans">
                          {formatNumber(comparativeIqfData.reduce((sum, t) => sum + t.kgs, 0), 2)} Kg
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 uppercase font-sans">
                          {formatNumber(comparativeIqfData.reduce((sum, t) => sum + t.pcs, 0), 0)} Pcs dikirim
                        </span>
                      </div>
                    </div>

                    <div className="bg-emerald-50/50 border border-emerald-100/50 p-4 rounded-2xl flex flex-col justify-between">
                      <span className="text-[8px] font-black text-emerald-700 uppercase tracking-widest block font-sans">Total Hasil Harvest</span>
                      <div className="mt-2">
                        {(() => {
                          let totalHarvestKgs = 0;
                          let totalHarvestPcs = 0;
                          let evaluatedCount = 0;

                          comparativeIqfData.forEach(t => {
                            const hKgs = t.harvestKgs || 0;
                            const hPcs = t.harvestPcs || 0;
                            if (hKgs > 0) {
                              totalHarvestKgs += hKgs;
                              totalHarvestPcs += hPcs;
                              evaluatedCount++;
                            }
                          });

                          return (
                            <>
                              <span className="text-xl font-black text-gray-950 block font-sans">
                                {formatNumber(totalHarvestKgs, 2)} Kg
                              </span>
                              <span className="text-[9px] font-bold text-gray-400 uppercase font-sans">
                                {evaluatedCount} dari {comparativeIqfData.length} Item terkomparasi
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Excel Row Preview list if there's imported data */}
            {importedData.length > 0 && (
              <div className="border border-amber-200 bg-amber-50/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                  <span className="text-[10px] font-black text-amber-850 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                    ⚠️ REVIEW DATA IMPORT EXCEL (PREVIEW COCOK)
                  </span>
                  <span className="text-[9px] font-bold text-amber-700 uppercase bg-amber-100 px-2 py-0.5 rounded-full">
                    Total {importedData.length} baris dianalisis
                  </span>
                </div>

                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-amber-100/50 text-amber-900 border-b border-amber-200">
                      <tr>
                        <th className="px-3 py-2 font-black uppercase">No Excel</th>
                        <th className="px-3 py-2 font-black uppercase">Nama Item (Excel)</th>
                        <th className="px-3 py-2 font-black uppercase">PD tanggal (Excel)</th>
                        <th className="px-3 py-2 text-right font-black uppercase">Qty Harvest (Pcs/Kg)</th>
                        <th className="px-3 py-2 font-black uppercase text-center">Status Pencocokan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {importedData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-amber-100/20">
                          <td className="px-3 py-2.5 font-bold text-amber-850">Baris #{row.no}</td>
                          <td className="px-3 py-2.5 font-extrabold text-gray-950 uppercase">{row.excelItemName}</td>
                          <td className="px-3 py-2.5 font-bold text-gray-600">{row.excelPD}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-gray-950">
                            {formatNumber(row.excelPcs, 0)} Pcs / {formatNumber(row.excelKgs, 2)} Kg
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {row.status === 'MATCHED' ? (
                              <div className="space-y-1 text-center">
                                <span className="inline-block bg-green-100 text-green-700 text-[8px] font-black uppercase px-2 py-0.5 rounded-full">
                                  Cocok ({row.matchedTransactions.length} Batch)
                                </span>
                                {row.matchedTransactions.map((trx, tIdx) => (
                                  <div key={tIdx} className="text-[8px] text-gray-500 font-medium whitespace-nowrap">
                                    Batch ID: {trx.chillerId} ({formatNumber(trx.sendPcs, 0)} Pcs / {formatNumber(trx.sendKgs, 2)} Kg Kirim)
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="inline-block bg-red-100 text-red-700 text-[8px] font-black uppercase px-2 py-0.5 rounded-full">
                                Batch Tidak Ditemukan
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Main Comparative Report Database */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black text-gray-950 uppercase tracking-widest font-sans">
                    TABEL PEMBANDING HARVEST OUT IQF
                  </h3>
                  <p className="text-[10px] text-gray-400 font-semibold mt-0.5 uppercase font-sans">
                    Membandingkan volume kirim chiller dengan pencatatan hasil harvest
                  </p>
                </div>

                <button
                  onClick={() => {
                    const headerRow = ["Batch(es)", "Nama Item", "Production Date (PD)", "Qty Kirim Pcs", "Kirim Chiller (Kgs)", "Qty Harvest Pcs", "Hasil Harvest (Kgs)", "Susut (Kgs)", "Susut (%)", "Status"];
                    const logsData = comparativeIqfData.map(t => {
                      const hPcs = t.harvestPcs || 0;
                      const hKgs = t.harvestKgs || 0;
                      const sKgs = t.kgs - hKgs;
                      const sPct = t.kgs > 0 ? (sKgs / t.kgs) * 100 : 0;
                      const status = hKgs > 0 ? "Sudah Dibandingkan" : "Belum Ada Data";

                      return [
                        t.batchIds.join(', '),
                        t.itemName,
                        t.productionDate,
                        t.pcs,
                        t.kgs,
                        hKgs > 0 ? hPcs : 0,
                        hKgs > 0 ? hKgs : 0,
                        hKgs > 0 ? parseFloat(sKgs.toFixed(2)) : 0,
                        hKgs > 0 ? parseFloat(sPct.toFixed(2)) : 0,
                        status
                      ];
                    });

                    const worksheetComp = XLSX.utils.aoa_to_sheet([
                      ["LAPORAN PERBANDINGAN HARVEST IQF", `Periode Filter: ${filterStartDate || 'Semua'} s.d ${filterEndDate || 'Semua'}`],
                      [],
                      headerRow,
                      ...logsData
                    ]);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, worksheetComp, "Perbandingan IQF");
                    XLSX.writeFile(wb, `Laporan_Perbandingan_IQF_${new Date().toISOString().split('T')[0]}.xlsx`);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase transition-colors shadow-sm cursor-pointer"
                >
                  <Download size={13} /> Export Laporan Pembanding
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-100 rounded-2xl overflow-hidden font-sans">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Detail Item & Batch</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">PD (Prod Date)</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right bg-blue-50/20">Kirim Chiller</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right bg-emerald-50/20">Hasil Harvest IQF</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Penyusutan</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status / Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {comparativeIqfData.length > 0 ? (
                      comparativeIqfData.map((trx) => {
                        const hPcs = trx.harvestPcs || 0;
                        const hKgs = trx.harvestKgs || 0;

                        const sKgs = trx.kgs - hKgs;
                        const sPct = trx.kgs > 0 ? (sKgs / trx.kgs) * 100 : 0;

                        return (
                          <tr key={trx.id} className="hover:bg-gray-50/40 transition-colors">
                            <td className="px-6 py-4">
                              <button
                                type="button"
                                onClick={() => setExpandedTrxBatchIds(prev => ({ ...prev, [trx.id]: !prev[trx.id] }))}
                                className="text-left focus:outline-none block select-none cursor-pointer mb-1.5"
                              >
                                <div className="text-[9px] font-black text-red-650 bg-red-50 hover:bg-red-100/80 border border-red-200/40 px-2 py-0.5 rounded inline-flex items-center gap-1 uppercase transition-all">
                                  <span>{trx.batchIds.length} Batch</span>
                                  <span className="text-[8px] font-bold text-gray-400 normal-case">
                                    ({expandedTrxBatchIds[trx.id] ? 'Sembunyikan' : 'Klik untuk Detail'})
                                  </span>
                                </div>
                              </button>
                              {expandedTrxBatchIds[trx.id] && (
                                <div className="text-[9px] font-mono leading-tight text-red-700 bg-red-50/30 p-2 rounded-xl border border-red-100/50 my-1.5 max-w-xs break-all">
                                  <span className="font-black block text-[8px] text-red-400 uppercase mb-0.5">Daftar Batch:</span>
                                  {trx.batchIds.join(', ')}
                                </div>
                              )}
                              <div className="text-[11px] font-black text-gray-900 uppercase leading-tight">
                                {trx.itemName}
                              </div>
                              {trx.itemCode && trx.itemCode !== 'N/A' && !trx.itemCode.startsWith('SYS-') && (
                                <div className="text-[8px] font-black text-gray-400 mt-0.5 uppercase tracking-wide">
                                  {trx.itemCode}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="text-[10px] font-black text-gray-600 bg-gray-100 px-2 py-1 rounded">
                                {trx.productionDate}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right bg-blue-50/10">
                              <div className="text-xs font-black text-gray-900">{formatNumber(trx.kgs, 2)} <span className="text-[8px] text-gray-400 font-bold">Kg</span></div>
                              <div className="text-[9px] font-bold text-blue-600 uppercase">{formatNumber(trx.pcs, 0)} Pcs</div>
                            </td>
                            <td className="px-6 py-4 text-right bg-emerald-50/10">
                              {hKgs > 0 ? (
                                <>
                                  <div className="text-xs font-black text-emerald-700">{formatNumber(hKgs, 2)} <span className="text-[8px] text-emerald-400 font-bold">Kg</span></div>
                                  <div className="text-[9px] font-bold text-emerald-600 uppercase">{formatNumber(hPcs, 0)} Pcs</div>
                                </>
                              ) : (
                                <span className="text-[8px] font-black text-gray-400 uppercase bg-gray-100 px-1.5 py-0.5 rounded leading-none">Belum Diinput</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {hKgs > 0 ? (
                                <>
                                  <div className={`text-xs font-black flex items-center justify-end gap-1 ${sKgs >= 0 ? 'text-amber-700' : 'text-green-700'}`}>
                                    {sKgs >= 0 ? `+${formatNumber(sKgs, 2)}` : formatNumber(sKgs, 2)}
                                    <span className="text-[8px] font-bold text-gray-400">Kg</span>
                                  </div>
                                  <div className={`text-[9px] font-bold ${sPct >= 0 ? 'text-amber-500' : 'text-green-500'}`}>
                                    {sPct.toFixed(2)}% Susut
                                  </div>
                                </>
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                {hKgs > 0 ? (
                                  <span className="text-[8px] font-black text-green-700 bg-green-50 px-2.5 py-1 rounded border border-green-100 flex items-center gap-1 uppercase">
                                    ✓ Lengkap
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-2.5 py-1 rounded border border-amber-100 flex items-center gap-1 uppercase">
                                    ⚠ Pending
                                  </span>
                                )}

                                {(currentUser?.role?.toUpperCase() === 'ADMIN' || currentUser?.role?.toUpperCase() === 'SUPERADMIN') && (
                                  <button
                                    onClick={() => {
                                      setHarvestTrxId(trx.id);
                                      setHarvestInputPcs(hPcs > 0 ? String(hPcs) : String(trx.pcs));
                                      setHarvestInputKgs(hKgs > 0 ? String(hKgs) : String(trx.kgs));
                                    }}
                                    className="text-[8px] font-black bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-2 py-0.5 rounded transition-all mt-0.5 cursor-pointer flex items-center gap-0.5"
                                  >
                                    <Edit size={8} /> {hKgs > 0 ? 'Koreksi' : 'Isi Manual'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                          Tidak ada data pengiriman OUT ke IQF ditemukan untuk filter periode ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
          <div className="divide-y divide-gray-100">
            {filteredLogs.map(log => (
              <div key={log.id} className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Activity size={16} /></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-red-600 uppercase">{log.action}</span>
                    <span className="text-[10px] font-bold text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-700">{log.details}</p>
                  <span className="text-[9px] font-bold text-gray-400 uppercase">User: {log.userId}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* IQF Harvest Comparison Input Modal */}
      {harvestTrxId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200">
            {(() => {
              if (!harvestTrxId) return null;
              const parts = harvestTrxId.split('||');
              if (parts.length < 2) return null;
              const itemCode = parts[0];
              const productionDate = parts[1];

              // Find all corresponding transactions in this group
              const groupTransactions = transactions.filter(t => {
                if (t.type !== 'OUT' || t.destination !== 'IQF') return false;
                const stockItem = items.find(stock => stock.batchId === t.chillerId);
                const tCode = t.itemCode || stockItem?.itemCode || 'N/A';
                const tPD = stockItem?.productionDate || 'N/A';
                return tCode.trim() === itemCode.trim() && tPD.trim() === productionDate.trim();
              });

              if (groupTransactions.length === 0) return null;

              // Compute aggregated metrics
              const totalSendPcs = groupTransactions.reduce((sum, t) => sum + t.pcs, 0);
              const totalSendKgs = groupTransactions.reduce((sum, t) => sum + t.kgs, 0);
              const itemName = items.find(i => i.itemCode === itemCode)?.itemName || groupTransactions[0]?.itemCode || itemCode;

              return (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Input Hasil IQF</h3>
                    <button
                      onClick={() => setHarvestTrxId(null)}
                      className="text-gray-400 hover:text-gray-600 font-bold text-xs p-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl space-y-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Detail Kirim Chiller</p>
                    <p className="text-xs font-black text-red-600 uppercase">{itemName} ({itemCode})</p>
                    <p className="text-xs font-bold text-gray-600">
                      PD: <span className="font-extrabold">{productionDate}</span>
                    </p>
                    <p className="text-xs font-bold text-gray-600">
                      Volume: {formatNumber(totalSendPcs, 0)} Pcs / {formatNumber(totalSendKgs, 2)} Kg ({groupTransactions.length} Batch)
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                        <Package size={10} /> Qty Hasil Harvest (Pcs)
                      </label>
                      <input
                        type="number"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-black outline-none focus:border-red-600"
                        value={harvestInputPcs}
                        onChange={(e) => setHarvestInputPcs(e.target.value)}
                        placeholder="Contoh: 120"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                        <Scale size={10} /> Berat Hasil Harvest (Kg)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-black outline-none focus:border-red-600"
                        value={harvestInputKgs}
                        onChange={(e) => setHarvestInputKgs(e.target.value)}
                        placeholder="Contoh: 110.5"
                      />
                    </div>

                    {/* Shrinkage Preview */}
                    {(() => {
                      const inputKgsVal = parseFloat(harvestInputKgs) || 0;
                      if (inputKgsVal > 0) {
                        const sKgs = totalSendKgs - inputKgsVal;
                        const sPct = totalSendKgs > 0 ? (sKgs / totalSendKgs) * 100 : 0;
                        return (
                          <div className={`p-2.5 rounded-xl text-[10px] font-bold ${sPct >= 0 ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                            <div className="flex items-center gap-1 justify-between">
                              <span className="uppercase tracking-widest text-[8px] font-black">Estimasi Penyusutan:</span>
                              <span className="font-extrabold">{sPct.toFixed(2)}% ({sKgs.toFixed(2)} Kg)</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setHarvestTrxId(null)}
                      className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-xl text-[10px] font-black uppercase cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      onClick={async () => {
                        const pcsVal = parseInt(harvestInputPcs);
                        const kgsVal = parseFloat(harvestInputKgs);
                        if (isNaN(pcsVal) || isNaN(kgsVal) || pcsVal < 0 || kgsVal < 0) {
                          alert("Mohon masukkan angka Qty dan Berat harvest yang valid.");
                          return;
                        }

                        // Dynamically split/allocate the entered harvest values among the transactions making up the group.
                        const updates = groupTransactions.map(t => {
                          let sharePcs = 0;
                          let shareKgs = 0;

                          if (groupTransactions.length === 1) {
                            sharePcs = pcsVal;
                            shareKgs = kgsVal;
                          } else {
                            const weightRatio = totalSendKgs > 0 ? (t.kgs / totalSendKgs) : (1 / groupTransactions.length);
                            const pcsRatio = totalSendPcs > 0 ? (t.pcs / totalSendPcs) : (1 / groupTransactions.length);

                            sharePcs = Math.round(pcsVal * pcsRatio);
                            shareKgs = parseFloat((kgsVal * weightRatio).toFixed(2));
                          }

                          return {
                            transactionId: t.id,
                            harvestPcs: sharePcs,
                            harvestKgs: shareKgs,
                            itemCode: t.itemCode || itemCode
                          };
                        });

                        if (onUpdateHarvestBulk) {
                          await onUpdateHarvestBulk(updates);
                          setHarvestTrxId(null);
                        }
                      }}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-600/20 cursor-pointer"
                    >
                      Simpan
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
