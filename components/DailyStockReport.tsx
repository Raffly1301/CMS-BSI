
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChillerItem, Transaction, User, ItemMaster, StockOpnameRecord } from '../types';
import { formatNumber } from '@/utils';
import {
  Calendar,
  FileText,
  Table as TableIcon,
  Info,
  Search,
  Hash,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  Save,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ClipboardCheck
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { StockOpnameTab } from './StockOpnameTab';
import { fetchStockOpnames } from '../lib/stockOpnameService';

interface DailyStockReportProps {
  items: ChillerItem[];
  transactions: Transaction[];
  user?: User | null;
  onRefresh?: () => void;
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

const DailyStockReport: React.FC<DailyStockReportProps> = ({ items, transactions, user, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'REPORT' | 'OPNAME'>('REPORT');
  const [opnameRecords, setOpnameRecords] = useState<StockOpnameRecord[]>([]);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [unit, setUnit] = useState<'KGS' | 'PCS'>('KGS');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetail, setShowDetail] = useState<boolean>(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Row expand toggle state
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Superadmin Edit/Delete states
  const [editingBatch, setEditingBatch] = useState<ChillerItem | null>(null);
  const [editingPcs, setEditingPcs] = useState<number>(0);
  const [editingKgs, setEditingKgs] = useState<number>(0);
  const [editingProductionDate, setEditingProductionDate] = useState<string>('');
  const [editingSlaughteringDate, setEditingSlaughteringDate] = useState<string>('');
  const [editingSource, setEditingSource] = useState<string>('');
  const [editingAllocation, setEditingAllocation] = useState<string>('');
  const [editingIsWIP, setEditingIsWIP] = useState<boolean>(false);
  const [editingStatus, setEditingStatus] = useState<string>('');
  const [editingItemsId, setEditingItemsId] = useState<string>('');

  const [deletingBatch, setDeletingBatch] = useState<ChillerItem | null>(null);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Master items list
  const [itemsList, setItemsList] = useState<ItemMaster[]>([]);

  const loadOpnames = async () => {
    try {
      const res = await fetchStockOpnames();
      setOpnameRecords(res.records);
    } catch (e) {
      console.warn('Could not load opnames in DailyStockReport:', e);
    }
  };

  useEffect(() => {
    loadOpnames();
  }, []);

  const activeOpnameRecord = useMemo(() => {
    return opnameRecords.find(r => r.opnameDate === startDate) || null;
  }, [opnameRecords, startDate]);

  const handleOpnameApplied = async (appliedDate: string) => {
    await loadOpnames();
    setStartDate(appliedDate);
    setEndDate(appliedDate);
    setActiveTab('REPORT');
    if (onRefresh) onRefresh();
  };

  useEffect(() => {
    const fetchMasterItems = async () => {
      let { data, error } = await supabase
        .from('items')
        .select('id, code, description')
        .eq('is_active', true)
        .order('code', { ascending: true });

      if (error) {
        const retry = await supabase.from('items').select('*');
        data = retry.data;
        error = retry.error;
      }

      if (!error && data) {
        setItemsList(data);
      }
    };
    fetchMasterItems();
  }, []);

  const isSuperAdmin = user?.role?.toUpperCase() === 'SUPERADMIN' || user?.username?.toLowerCase() === 'superadmin';

  useEffect(() => {
    if (!isSuperAdmin && activeTab === 'OPNAME') {
      setActiveTab('REPORT');
    }
  }, [isSuperAdmin, activeTab]);

  const toggleRowExpanded = (rowName: string) => {
    setExpandedRows(prev => ({ ...prev, [rowName]: !prev[rowName] }));
  };

  const handleEditBatchClick = (batch: ChillerItem) => {
    setEditingBatch(batch);
    setEditingPcs(batch.pcs);
    setEditingKgs(batch.kgs);
    setEditingProductionDate(batch.productionDate);
    setEditingSlaughteringDate(batch.slaughteringDate);
    setEditingSource(batch.source);
    setEditingAllocation(batch.allocation);
    setEditingIsWIP(!!batch.isWIP);
    setEditingItemsId(batch.itemsId);

    // Status can be: 'IN' ('IN_CHILLER' in UI), 'OUT' ('OUT_CHILLER'), or 'PENDING_QC'
    const dbStatus = batch.status === 'OUT_CHILLER' ? 'OUT' :
      batch.status === 'PENDING_QC' ? 'PENDING' : 'IN';
    setEditingStatus(dbStatus);
    setError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch) return;

    setIsMutating(true);
    setError(null);
    try {
      const selectedItemObj = itemsList.find(it => it.id === editingItemsId);
      const selectedItemCode = selectedItemObj?.code || 'N/A';

      // 1. Update chiller_stock
      const { error: stockErr } = await supabase
        .from('chiller_stock')
        .update({
          items_id: editingItemsId,
          quantity_pcs: editingPcs,
          quantity_kgs: editingKgs,
          production_date: editingProductionDate,
          slaughtering_date: editingSlaughteringDate,
          source: editingSource,
          allocation: editingAllocation,
          status_WIP: editingIsWIP,
          status: editingStatus
        })
        .eq('batch_id', editingBatch.batchId);

      if (stockErr) throw stockErr;

      // 2. Also update related initial transaction or IN transactions if quantities/item modified
      const { data: firstInTrx, error: trxFetchErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('batch_id', editingBatch.batchId)
        .eq('transaction_type', 'in')
        .limit(1);

      if (!trxFetchErr && firstInTrx && firstInTrx.length > 0) {
        await supabase
          .from('transactions')
          .update({
            quantity_pcs: editingPcs,
            quantity_kgs: editingKgs,
            note: selectedItemCode
          })
          .eq('id', firstInTrx[0].id);
      }

      setEditingBatch(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("Failed to edit batch:", err);
      setError(err?.message || String(err));
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteBatchClick = (batch: ChillerItem) => {
    setDeletingBatch(batch);
    setError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingBatch) return;

    setIsMutating(true);
    setError(null);
    try {
      // 1. Delete transactions related to this batch
      const { error: trxDelErr } = await supabase
        .from('transactions')
        .delete()
        .eq('batch_id', deletingBatch.batchId);

      if (trxDelErr) throw trxDelErr;

      // 2. Delete chiller_stock entry itself
      const { error: stockDelErr } = await supabase
        .from('chiller_stock')
        .delete()
        .eq('batch_id', deletingBatch.batchId);

      if (stockDelErr) throw stockDelErr;

      setDeletingBatch(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error("Failed to delete batch:", err);
      setError(err?.message || String(err));
    } finally {
      setIsMutating(false);
    }
  };

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
  const { activeInCats, activeOutCats } = useMemo(() => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const activeInSet = new Set<string>();
    const activeOutSet = new Set<string>();

    transactions.forEach(t => {
      if (t.timestamp >= startRange && t.timestamp <= endRange) {
        if (t.type === 'IN') {
          const item = items.find(i => i.batchId === t.chillerId);
          const src = (item?.source || 'INFLOW').toUpperCase();
          const norm = normalizeCategory(src);
          activeInSet.add(norm);
        } else if (t.type === 'OUT') {
          const dest = (t.destination || 'OUTFLOW').toUpperCase();
          const norm = normalizeCategory(dest);
          activeOutSet.add(norm);
        }
      }
    });

    const activeIn = [
      ...ALL_CATEGORIES.filter(cat => activeInSet.has(cat)),
      ...Array.from(activeInSet).filter(cat => !ALL_CATEGORIES.includes(cat)).sort((a, b) => a.localeCompare(b))
    ];
    const activeOut = [
      ...ALL_CATEGORIES.filter(cat => activeOutSet.has(cat)),
      ...Array.from(activeOutSet).filter(cat => !ALL_CATEGORIES.includes(cat)).sort((a, b) => a.localeCompare(b))
    ];

    return {
      activeInCats: activeIn,
      activeOutCats: activeOut
    };
  }, [startDate, endDate, transactions, items]);

  const reportData = useMemo(() => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const opnameCodes = activeOpnameRecord ? activeOpnameRecord.items.map(i => i.itemCode) : [];
    const itemCodes: string[] = Array.from(new Set([...items.map(i => i.itemCode), ...opnameCodes])).filter(c => c && c !== 'N/A');
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

      // Opening Stock: If Stock Opname exists for startDate, opening stock is directly anchored by the Opname recount!
      let openingKgs = 0;
      let openingPcs = 0;

      if (activeOpnameRecord) {
        if (isWIPGroup) {
          const opnameWipItems = activeOpnameRecord.items.filter(it => it.isWIP);
          openingKgs = opnameWipItems.reduce((acc, curr) => acc + (Number(curr.kgs) || 0), 0);
          openingPcs = opnameWipItems.reduce((acc, curr) => acc + (Number(curr.pcs) || 0), 0);
        } else {
          const opnameItems = activeOpnameRecord.items.filter(it => !it.isWIP && it.itemCode === label);
          openingKgs = opnameItems.reduce((acc, curr) => acc + (Number(curr.kgs) || 0), 0);
          openingPcs = opnameItems.reduce((acc, curr) => acc + (Number(curr.pcs) || 0), 0);
        }
      } else {
        // Standard formula: (Total IN before range) - (Total OUT before range)
        const beforeInK = sumT(groupTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'kgs');
        const beforeOutK = sumT(groupTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'kgs');
        openingKgs = beforeInK - beforeOutK;

        const beforeInP = sumT(groupTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'pcs');
        const beforeOutP = sumT(groupTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'pcs');
        openingPcs = beforeInP - beforeOutP;
      }

      // Movements during the range (exclude opname batch generation from dayInTrx to prevent double counting)
      const dayInTrx = groupTrx.filter(t => {
        if (t.type !== 'IN' || t.timestamp < startRange || t.timestamp > endRange) return false;
        if (activeOpnameRecord && t.note && t.note.includes('[STOCK OPNAME]')) return false;
        return true;
      });
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
    const hasOpnameWip = activeOpnameRecord && activeOpnameRecord.items.some(it => it.isWIP);
    if (wipRow.openingKgs > 0 || wipRow.inKgs > 0 || wipRow.outKgs > 0 || wipRow.openingPcs > 0 || wipRow.inPcs > 0 || wipRow.outPcs > 0 || hasOpnameWip) {
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
  }, [items, startDate, endDate, transactionsByChillerId, activeOpnameRecord]);

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

    const categorizedInMap: Record<string, number> = inMap;
    const otherIn = 0;

    const categorizedOutMap: Record<string, number> = outMap;
    const otherOut = 0;

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

  const getRowBatches = (rowName: string, isWIPRow: boolean = false) => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const groupItems = isWIPRow
      ? items.filter(i => !!i.isWIP)
      : items.filter(i => i.itemCode === rowName && !i.isWIP);

    return groupItems.filter(i => {
      const batchTrx = transactionsByChillerId[i.batchId] || [];
      const sumT = (arr: Transaction[], key: 'kgs' | 'pcs') => arr.reduce((acc, curr) => acc + (curr[key] || 0), 0);
      const k = unit === 'KGS' ? 'kgs' : 'pcs';

      const beforeIn = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), k);
      const beforeOut = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), k);
      const opening = beforeIn - beforeOut;

      const dayIn = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange), k);
      const dayOut = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange), k);

      return Math.abs(opening) > 0.01 || dayIn > 0 || dayOut > 0;
    });
  };

  const getRowTableBreakdown = (rowName: string, isWIPRow: boolean = false) => {
    const activeBatches = getRowBatches(rowName, isWIPRow);

    let opening = 0;
    let totalIn = 0;
    let totalOut = 0;
    let endingStock = 0;
    const categorizedInMap: Record<string, number> = {};
    const categorizedOutMap: Record<string, number> = {};

    activeBatches.forEach(batch => {
      const batchTbl = getBatchTableBreakdown(batch);
      opening += batchTbl.opening;
      totalIn += batchTbl.totalIn;
      totalOut += batchTbl.totalOut;
      endingStock += batchTbl.endingStock;

      for (const [cat, val] of Object.entries(batchTbl.categorizedInMap)) {
        categorizedInMap[cat] = (categorizedInMap[cat] || 0) + val;
      }
      for (const [cat, val] of Object.entries(batchTbl.categorizedOutMap)) {
        categorizedOutMap[cat] = (categorizedOutMap[cat] || 0) + val;
      }
    });

    return {
      opening,
      categorizedInMap,
      otherIn: 0,
      totalIn,
      categorizedOutMap,
      otherOut: 0,
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

      {/* Sub-Navigation: Laporan Stok Harian vs Stock Opname Fisik (Hanya untuk Superadmin) */}
      {isSuperAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-1.5 bg-gray-100/90 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('REPORT')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'REPORT'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-white/50'
                }`}
            >
              <TableIcon size={14} className={activeTab === 'REPORT' ? 'text-red-600' : 'text-gray-400'} />
              <span>Rekap Stok Harian</span>
            </button>

            <button
              onClick={() => setActiveTab('OPNAME')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all relative ${activeTab === 'OPNAME'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
            >
              <ClipboardCheck size={14} className={activeTab === 'OPNAME' ? 'text-white' : 'text-red-600'} />
              <span>Stock Opname Fisik</span>
              {activeOpnameRecord && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-white"></span>
              )}
            </button>
          </div>

          {activeOpnameRecord && activeTab === 'REPORT' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-medium border border-emerald-100">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Stok Awal Menggunakan Opname ({activeOpnameRecord.opnameDate})</span>
            </div>
          )}
        </div>
      )}

      {isSuperAdmin && activeTab === 'OPNAME' ? (
        <StockOpnameTab
          user={user}
          itemsList={itemsList}
          onOpnameApplied={handleOpnameApplied}
        />
      ) : (
        <>
          {activeOpnameRecord && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-900 shadow-sm animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-sm shrink-0">
                  <ClipboardCheck size={20} />
                </div>
                <div>
                  <div className="text-xs font-bold flex items-center gap-2">
                    <span>Stok Awal Diselaraskan Berdasarkan Stock Opname Fisik</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-extrabold uppercase">
                      {activeOpnameRecord.opnameDate}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Stok awal (opening stock) pada laporan ini dihitung langsung dari data fisik Opname: <strong>{formatNumber(activeOpnameRecord.totalPcs)} pcs</strong> / <strong className="text-emerald-900">{formatNumber(activeOpnameRecord.totalKgs, 2)} kg</strong> ({activeOpnameRecord.items.length} baris item).
                  </p>
                </div>
              </div>
              {isSuperAdmin && (
                <button
                  onClick={() => setActiveTab('OPNAME')}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all self-start sm:self-center shrink-0 shadow-sm flex items-center gap-1.5"
                >
                  <span>Lihat / Kelola Opname</span>
                </button>
              )}
            </div>
          )}

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

            <div className="space-y-1.5 lg:col-span-2">
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

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                <Info size={12} className="text-red-600" /> Detail Kolom
              </label>
              <div className="flex bg-gray-100 p-1 rounded-xl h-[42px]">
                <button
                  onClick={() => setShowDetail(false)}
                  className={`flex-1 rounded-lg text-[10px] font-black transition-all ${!showDetail ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Tampilkan hanya total IN dan OUT"
                >
                  RINGKAS
                </button>
                <button
                  onClick={() => setShowDetail(true)}
                  className={`flex-1 rounded-lg text-[10px] font-black transition-all ${showDetail ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  title="Tampilkan breakdown per kategori"
                >
                  DETAIL
                </button>
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

                      {showDetail && activeInCats.map(cat => (
                        <th key={`in-${cat}`} className="px-1.5 py-1.5 text-[8.5px] font-black text-gray-400 uppercase tracking-tight text-right min-w-[55px]">{cat} (IN)</th>
                      ))}
                      <th className="px-1.5 py-1.5 text-[8.5px] font-black text-green-700 bg-green-50/50 uppercase tracking-tight text-right min-w-[70px]">TOTAL IN</th>

                      {showDetail && activeOutCats.map(cat => (
                        <th key={`out-${cat}`} className="px-1.5 py-1.5 text-[8.5px] font-black text-gray-400 uppercase tracking-tight text-right min-w-[55px]">{cat} (OUT)</th>
                      ))}
                      <th className="px-1.5 py-1.5 text-[8.5px] font-black text-blue-700 bg-blue-50/50 uppercase tracking-tight text-right min-w-[70px]">TOTAL OUT</th>

                      <th className="px-2 py-1.5 text-[8.5px] font-black text-red-700 bg-red-50/50 uppercase tracking-tight text-right min-w-[85px]">Ending Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredData.map((row, idx) => {
                      const isWIPRow = row.isWIPGroup;
                      const tbl = getRowTableBreakdown(row.name, isWIPRow);
                      const rowBatches = getRowBatches(row.name, isWIPRow);
                      const hasBatches = rowBatches.length > 0;
                      const isExpanded = !!expandedRows[row.name];

                      return (
                        <React.Fragment key={idx}>
                          <tr className={`
                        hover:bg-gray-50 transition-colors border-b border-gray-100
                        ${isWIPRow ? 'bg-amber-50/40 font-black' : ''}
                      `}>
                            <td className="px-2 py-1.5 cursor-pointer select-none" onClick={() => hasBatches && toggleRowExpanded(row.name)}>
                              <div className="flex items-center gap-2">
                                {hasBatches && (
                                  <span className="text-gray-400 hover:text-red-600 transition-colors mr-0.5 self-center">
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </span>
                                )}
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
                            {showDetail && activeInCats.map(cat => {
                              const val = tbl.categorizedInMap[cat] || 0;
                              return (
                                <td key={`val-in-${cat}`} className="px-1.5 py-1.5 text-right font-mono text-[12px] text-black">
                                  {val > 0 ? formatNumber(val, unit === 'KGS' ? 2 : 0) : ''}
                                </td>
                              );
                            })}
                            <td className="px-1.5 py-1.5 text-right font-mono font-black text-green-700 bg-green-50/10 text-[12px]">
                              {tbl.totalIn > 0 ? formatNumber(tbl.totalIn, unit === 'KGS' ? 2 : 0) : '0'}
                            </td>

                            {showDetail && activeOutCats.map(cat => {
                              const val = tbl.categorizedOutMap[cat] || 0;
                              return (
                                <td key={`val-out-${cat}`} className="px-1.5 py-1.5 text-right font-mono text-[12px] text-black">
                                  {val > 0 ? formatNumber(val, unit === 'KGS' ? 2 : 0) : ''}
                                </td>
                              );
                            })}
                            <td className="px-1.5 py-1.5 text-right font-mono font-black text-blue-700 bg-blue-50/10 text-[12px]">
                              {tbl.totalOut > 0 ? formatNumber(tbl.totalOut, unit === 'KGS' ? 2 : 0) : '0'}
                            </td>

                            <td className="px-2 py-1.5 text-right font-mono font-black text-red-700 bg-red-50/10 text-[12px]">
                              {formatNumber(tbl.endingStock, unit === 'KGS' ? 2 : 0)}
                            </td>
                          </tr>

                          {isExpanded && rowBatches.map((batch, bIdx) => {
                            const batchTbl = getBatchTableBreakdown(batch);
                            return (
                              <tr key={`${row.name}-batch-${bIdx}`} className="bg-gray-50/40 border-b border-gray-100/50 hover:bg-red-50/10 transition-colors">
                                <td className="px-2 py-1 pl-8">
                                  <div className="flex flex-col ml-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[8.5px] font-black text-gray-800 uppercase flex items-center gap-0.5">
                                        <Hash size={10} className="text-gray-400" /> {batch.batchId}
                                      </span>
                                      {batch.isWIP && <span className="bg-amber-100 text-amber-700 text-[6px] font-black px-1.5 py-0.2 rounded scale-90">WIP</span>}
                                    </div>
                                    <span className="text-[7.5px] font-bold text-gray-400 uppercase leading-none mt-0.5 ml-2.5">
                                      {batch.itemCode} - {batch.itemName}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-1.5 py-1 text-right font-mono text-[12px] text-gray-600">
                                  {batchTbl.opening > 0 ? formatNumber(batchTbl.opening, unit === 'KGS' ? 2 : 0) : '0'}
                                </td>
                                {showDetail && activeInCats.map(cat => {
                                  const val = batchTbl.categorizedInMap[cat] || 0;
                                  return (
                                    <td key={`batch-in-${cat}`} className="px-1.5 py-1 text-right font-mono text-[12px] text-gray-500">
                                      {val > 0 ? formatNumber(val, unit === 'KGS' ? 2 : 0) : ''}
                                    </td>
                                  );
                                })}
                                <td className="px-1.5 py-1 text-right font-mono font-bold text-green-600 bg-green-50/5 text-[12px]">
                                  {batchTbl.totalIn > 0 ? formatNumber(batchTbl.totalIn, unit === 'KGS' ? 2 : 0) : '0'}
                                </td>

                                {showDetail && activeOutCats.map(cat => {
                                  const val = batchTbl.categorizedOutMap[cat] || 0;
                                  return (
                                    <td key={`batch-out-${cat}`} className="px-1.5 py-1 text-right font-mono text-[12px] text-gray-500">
                                      {val > 0 ? formatNumber(val, unit === 'KGS' ? 2 : 0) : ''}
                                    </td>
                                  );
                                })}
                                <td className="px-1.5 py-1 text-right font-mono font-bold text-blue-600 bg-blue-50/5 text-[12px]">
                                  {batchTbl.totalOut > 0 ? formatNumber(batchTbl.totalOut, unit === 'KGS' ? 2 : 0) : '0'}
                                </td>

                                <td className="px-2 py-1 text-right font-mono font-bold text-red-600 bg-red-50/5 text-[12px] relative group">
                                  <span className="mr-6">{formatNumber(batchTbl.endingStock, unit === 'KGS' ? 2 : 0)}</span>
                                  {isSuperAdmin && (
                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                                      <button onClick={() => handleEditBatchClick(batch)} className="p-1 bg-white text-blue-600 hover:bg-blue-50 rounded border border-blue-100 transition-colors shadow-sm cursor-pointer" title="Edit Batch">
                                        <Edit2 size={11} />
                                      </button>
                                      <button onClick={() => handleDeleteBatchClick(batch)} className="p-1 bg-white text-red-600 hover:bg-red-50 rounded border border-red-100 transition-colors shadow-sm cursor-pointer" title="Hapus Batch">
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  )}
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

                          {showDetail && activeInCats.map(cat => {
                            const totalCatIn = filteredData.reduce((acc, r) => acc + (getRowTableBreakdown(r.name, r.isWIPGroup).categorizedInMap[cat] || 0), 0);
                            return (
                              <td key={`total-in-${cat}`} className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-green-400">
                                {totalCatIn > 0 ? formatNumber(totalCatIn, unit === 'KGS' ? 2 : 0) : ''}
                              </td>
                            );
                          })}
                          <td className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-green-400 bg-gray-800">
                            {formatNumber(totalTotalIn, unit === 'KGS' ? 2 : 0)}
                          </td>

                          {showDetail && activeOutCats.map(cat => {
                            const totalCatOut = filteredData.reduce((acc, r) => acc + (getRowTableBreakdown(r.name, r.isWIPGroup).categorizedOutMap[cat] || 0), 0);
                            return (
                              <td key={`total-out-${cat}`} className="px-1.5 py-2 text-right text-[10px] font-mono font-black text-blue-400">
                                {totalCatOut > 0 ? formatNumber(totalCatOut, unit === 'KGS' ? 2 : 0) : ''}
                              </td>
                            );
                          })}
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

          {/* ================= EDIT MODAL (SUPERADMIN ONLY) ================= */}
          {isSuperAdmin && editingBatch && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-gray-100 p-6 relative animate-in zoom-in-95 duration-200">
                <button
                  onClick={() => setEditingBatch(null)}
                  className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer outline-none"
                >
                  <XCircle size={18} />
                </button>

                <div className="mb-4">
                  <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
                    <Edit2 className="text-blue-600 animate-pulse" size={18} />
                    Edit Batch Chiller Stock
                  </h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                    BATCH ID: <span className="text-blue-600 font-black">{editingBatch.batchId}</span>
                  </p>
                </div>

                <form onSubmit={handleSaveEdit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pilih Item (Produk)</label>
                    <select
                      className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase text-gray-800"
                      value={editingItemsId}
                      onChange={e => setEditingItemsId(e.target.value)}
                      required
                    >
                      <option value="">-- PILIH ITEM --</option>
                      {itemsList.map(it => (
                        <option key={it.id} value={it.id}>
                          {it.code} - {it.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pcs (Kuantitas)</label>
                      <input
                        type="number"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                        value={editingPcs}
                        onChange={e => setEditingPcs(parseInt(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kgs (Berat)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                        value={editingKgs}
                        onChange={e => setEditingKgs(parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tanggal Produksi</label>
                      <input
                        type="date"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase text-gray-700"
                        value={editingProductionDate}
                        onChange={e => setEditingProductionDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tanggal Potong</label>
                      <input
                        type="date"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase text-gray-700"
                        value={editingSlaughteringDate}
                        onChange={e => setEditingSlaughteringDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Sumber (Source)</label>
                      <input
                        type="text"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                        value={editingSource}
                        onChange={e => setEditingSource(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Alokasi (Allocation)</label>
                      <input
                        type="text"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs uppercase"
                        value={editingAllocation}
                        onChange={e => setEditingAllocation(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 flex flex-col justify-end pb-2 pl-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 cursor-pointer"
                          checked={editingIsWIP}
                          onChange={e => setEditingIsWIP(e.target.checked)}
                        />
                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-tight">Status WIP</span>
                      </label>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1.5 border border-red-100">
                      <AlertTriangle size={14} /> {error}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingBatch(null)}
                      disabled={isMutating}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer"
                    >
                      BATAL
                    </button>
                    <button
                      type="submit"
                      disabled={isMutating}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-100 cursor-pointer"
                    >
                      {isMutating ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <Save size={14} /> SIMPAN PERUBAHAN
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ================= DELETE CONFIRMATION MODAL (SUPERADMIN ONLY) ================= */}
          {isSuperAdmin && deletingBatch && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-gray-100 p-6 relative animate-in zoom-in-95 duration-200">
                <div className="text-center space-y-4">
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2 border border-red-100">
                    <Trash2 size={24} className="animate-bounce" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Hapus Stock Batch?</h3>
                    <p className="text-xs text-gray-500 mt-2 font-semibold">
                      Apakah Anda yakin ingin menghapus batch <span className="text-red-600 font-extrabold">{deletingBatch.batchId}</span> ({deletingBatch.itemCode})?
                    </p>
                    <p className="text-[10px] text-amber-600 bg-amber-50 p-2.5 rounded-xl border border-amber-100 mt-3 font-bold uppercase tracking-tight leading-normal">
                      <AlertTriangle size={12} className="inline mr-1" /> Penting: Tindakan ini juga akan menghapus seluruh catatan transaksi terkait dari database untuk menjaga integritas stok harian.
                    </p>
                  </div>

                  {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 border border-red-100">
                      <AlertTriangle size={14} /> {error}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeletingBatch(null)}
                      disabled={isMutating}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer"
                    >
                      BATAL
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      disabled={isMutating}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-red-100 cursor-pointer"
                    >
                      {isMutating ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          HAPUS SEKARANG
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DailyStockReport;
