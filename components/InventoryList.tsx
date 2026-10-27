import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChillerItem, OutflowDestination, InflowSource, User, ItemMaster } from '../types';
import { OUTFLOW_DESTINATIONS, INFLOW_SOURCES } from '../constants';
import { formatNumber } from '@/utils';
import {
  ArrowUpFromLine,
  Search,
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
  Package,
  Edit2,
  Trash2,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import CalculatorPopup from './CalculatorPopup';
import { supabase } from '../lib/supabase';
import { safeUpdateChillerStock } from '../lib/chillerStockHelper';
import { getMasterItems } from '../lib/masterCache';
import { isEgressQuotaError, getTableCache } from '../lib/cacheHelper';

const PAGE_SIZE = 30;

interface InventoryListProps {
  user: User | null;
  items?: ChillerItem[]; // Optional fallback from parent
  onOut: (id: string, destination: OutflowDestination, outPcs?: number, outKgs?: number) => void;
  onBatchOut: (ids: string[], destination: OutflowDestination) => void;
  onQCApprove: (id: string) => void;
  onQCReject: (id: string) => void;
  onRefresh?: () => void;
}

const InventoryList: React.FC<InventoryListProps> = ({
  user,
  onOut,
  onBatchOut,
  onQCApprove,
  onQCReject,
  onRefresh
}) => {
  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterSource, setFilterSource] = useState<InflowSource | 'ALL'>('ALL');
  const [filterAllocation, setFilterAllocation] = useState<InflowSource | 'ALL'>('ALL');
  const [filterWIP, setFilterWIP] = useState<'ALL' | 'WIP' | 'REGULAR'>('ALL');
  const [filterProdDate, setFilterProdDate] = useState('');
  const [filterSlaughterDate, setFilterSlaughterDate] = useState('');

  // Server-side Paginated Data states
  const [chillerItems, setChillerItems] = useState<ChillerItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Summary stats state (computed from server query)
  const [summaryTotals, setSummaryTotals] = useState({ pcs: 0, kgs: 0, uniquePDCount: 0 });

  // Selection & Modal states
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isBatchOutModalOpen, setIsBatchOutModalOpen] = useState(false);
  const [selectedItemForSingleOut, setSelectedItemForSingleOut] = useState<ChillerItem | null>(null);
  const [destination, setDestination] = useState<OutflowDestination>('Boneless');
  const [showAdminCondemConfirm, setShowAdminCondemConfirm] = useState(false);
  const [isPDModalOpen, setIsPDModalOpen] = useState(false);
  const [expandedPD, setExpandedPD] = useState<string | null>(null);

  const [outPcs, setOutPcs] = useState<number>(0);
  const [outKgs, setOutKgs] = useState<number>(0);
  const [activeCalculator, setActiveCalculator] = useState<'pcs' | 'kgs' | null>(null);

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

  // Global master items cache (memory cache)
  const [itemsList, setItemsList] = useState<ItemMaster[]>([]);
  const itemsMapRef = useRef<Record<string, { name: string; code: string }>>({});

  // Sentinel ref for Infinite Scroll
  const observerTarget = useRef<HTMLDivElement | null>(null);

  // Load master items once using Global Memory Cache
  useEffect(() => {
    let isMounted = true;
    getMasterItems().then(({ list, map }) => {
      if (isMounted) {
        setItemsList(list);
        itemsMapRef.current = map;
      }
    });
    return () => { isMounted = false; };
  }, []);

  // Debounce search term by 300ms to reduce unnecessary server queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const isSuperAdmin = user?.role?.toUpperCase() === 'SUPERADMIN';
  const isViewer = user?.role?.toUpperCase() === 'VIEWER';

  /**
   * Helper to build Postgres query filters based on current state
   */
  const applyServerFilters = useCallback((query: any, searchStr: string) => {
    // Only query active stock in chiller
    let q = query.in('status', ['IN', 'IN_CHILLER', 'PENDING', 'QC_PENDING', 'APPROVED']);

    if (searchStr.trim()) {
      const term = searchStr.trim().toLowerCase();
      // Match item code/description from global memory map
      const matchingItemIds = Object.entries(itemsMapRef.current)
        .filter(([_, info]) => info.code.toLowerCase().includes(term) || info.name.toLowerCase().includes(term))
        .map(([id]) => id);

      const orParts = [
        `batch_id.ilike.%${term}%`,
        `source.ilike.%${term}%`,
        `allocation.ilike.%${term}%`
      ];

      if (matchingItemIds.length > 0) {
        orParts.push(`items_id.in.(${matchingItemIds.join(',')})`);
      }

      q = q.or(orParts.join(','));
    }

    if (filterSource !== 'ALL') {
      q = q.eq('source', filterSource);
    }
    if (filterAllocation !== 'ALL') {
      q = q.eq('allocation', filterAllocation);
    }
    if (filterWIP === 'WIP') {
      q = q.or('status_WIP.eq.true,status_wip.eq.true');
    } else if (filterWIP === 'REGULAR') {
      q = q.or('status_WIP.eq.false,status_wip.eq.false,status_WIP.is.null,status_wip.is.null');
    }
    if (filterProdDate) {
      q = q.eq('production_date', filterProdDate);
    }
    if (filterSlaughterDate) {
      q = q.eq('slaughtering_date', filterSlaughterDate);
    }

    return q;
  }, [filterSource, filterAllocation, filterWIP, filterProdDate, filterSlaughterDate]);

  /**
   * Fetch summary metrics (Total Pcs, Total Kgs, Unique PD count) across the full filtered dataset
   */
  const fetchSummaryMetrics = useCallback(async (searchStr: string) => {
    try {
      let q = supabase.from('chiller_stock').select('quantity_pcs, quantity_kgs, production_date');
      q = applyServerFilters(q, searchStr);

      const { data, error } = await q;

      if (error && isEgressQuotaError(error)) {
        console.warn('Egress quota error fetching summary metrics');
        return;
      }

      if (data) {
        let totalPcs = 0;
        let totalKgs = 0;
        const pdSet = new Set<string>();

        data.forEach((row: any) => {
          totalPcs += Number(row.quantity_pcs || 0);
          totalKgs += Number(row.quantity_kgs || 0);
          if (row.production_date) pdSet.add(row.production_date);
        });

        setSummaryTotals({
          pcs: totalPcs,
          kgs: totalKgs,
          uniquePDCount: pdSet.size
        });
      }
    } catch (e) {
      console.warn('Failed to fetch summary metrics:', e);
    }
  }, [applyServerFilters]);

  /**
   * Primary Server-Side Paginated Fetch for chiller_stock
   */
  const fetchPage = useCallback(async (pageNum: number, isReset = false) => {
    if (isReset) {
      setLoadingInitial(true);
      setPage(0);
    } else {
      setLoadingMore(true);
    }

    try {
      // Ensure master items map is populated
      if (Object.keys(itemsMapRef.current).length === 0) {
        const { map } = await getMasterItems();
        itemsMapRef.current = map;
      }

      let query = supabase
        .from('chiller_stock')
        .select('*', { count: 'exact' });

      query = applyServerFilters(query, debouncedSearchTerm);
      query = query.order('created_at', { ascending: false });

      const from = pageNum * PAGE_SIZE;
      const to = (pageNum + 1) * PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) {
        if (isEgressQuotaError(error)) {
          console.warn('Quota exceeded in paginated fetch, falling back to local cache.');
          const cached = getTableCache('chiller_stock') || [];
          const mappedCached: ChillerItem[] = cached.map((item: any) => ({
            id: item.id ? String(item.id) : String(item.batch_id),
            batchId: item.batch_id,
            itemsId: item.items_id,
            itemCode: itemsMapRef.current[item.items_id]?.code || 'N/A',
            itemName: itemsMapRef.current[item.items_id]?.name || item.items_id,
            pcs: Number(item.quantity_pcs || 0),
            kgs: Number(item.quantity_kgs || 0),
            productionDate: item.production_date,
            slaughteringDate: item.slaughtering_date,
            source: item.source || 'FPS',
            allocation: item.allocation || 'FPS',
            entryTimestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
            status: item.status === 'OUT' || item.status === 'OUT_CHILLER' ? 'OUT_CHILLER' : item.status === 'PENDING' || item.status === 'QC_PENDING' ? 'PENDING_QC' : 'IN_CHILLER',
            isWIP: Boolean(item.status_WIP || item.status_wip)
          }));
          setChillerItems(mappedCached);
          setTotalCount(mappedCached.length);
          setHasMore(false);
          return;
        }
        throw error;
      }

      const totalNum = count ?? 0;
      setTotalCount(totalNum);

      const mappedData: ChillerItem[] = (data || []).map((item: any) => ({
        id: item.id ? String(item.id) : String(item.batch_id),
        batchId: item.batch_id,
        itemsId: item.items_id,
        itemCode: itemsMapRef.current[item.items_id]?.code || 'N/A',
        itemName: itemsMapRef.current[item.items_id]?.name || item.items_id,
        pcs: Number(item.quantity_pcs || 0),
        kgs: Number(item.quantity_kgs || 0),
        productionDate: item.production_date,
        slaughteringDate: item.slaughtering_date,
        source: item.source || 'FPS',
        allocation: item.allocation || 'FPS',
        entryTimestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
        status: item.status === 'OUT' || item.status === 'OUT_CHILLER' ? 'OUT_CHILLER' : item.status === 'PENDING' || item.status === 'QC_PENDING' ? 'PENDING_QC' : 'IN_CHILLER',
        isWIP: Boolean(item.status_WIP || item.status_wip)
      }));

      if (isReset) {
        setChillerItems(mappedData);
      } else {
        setChillerItems(prev => [...prev, ...mappedData]);
      }

      const loadedSoFar = (pageNum + 1) * PAGE_SIZE;
      setHasMore(loadedSoFar < totalNum);
    } catch (err) {
      console.error("Error loading chiller stock page:", err);
    } finally {
      setLoadingInitial(false);
      setLoadingMore(false);
    }
  }, [debouncedSearchTerm, applyServerFilters]);

  // Initial fetch and trigger on filter/search change
  useEffect(() => {
    fetchPage(0, true);
    fetchSummaryMetrics(debouncedSearchTerm);
  }, [debouncedSearchTerm, filterSource, filterAllocation, filterWIP, filterProdDate, filterSlaughterDate, fetchPage, fetchSummaryMetrics]);

  // Infinite Scroll Observer Setup
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingInitial) {
          setPage(prevPage => {
            const nextPage = prevPage + 1;
            fetchPage(nextPage, false);
            return nextPage;
          });
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [hasMore, loadingMore, loadingInitial, fetchPage]);

  // Manual Load More Handler
  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchPage(nextPage, false);
    }
  };

  const handleRefreshAll = () => {
    fetchPage(0, true);
    fetchSummaryMetrics(debouncedSearchTerm);
    if (onRefresh) onRefresh();
  };

  // Pre-fill destination for single outflow modal based on allocation
  useEffect(() => {
    if (selectedItemForSingleOut) {
      setOutPcs(selectedItemForSingleOut.pcs);
      setOutKgs(selectedItemForSingleOut.kgs);

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

  // Pre-fill destination for batch outflow modal
  useEffect(() => {
    if (isBatchOutModalOpen && selectedItemIds.length > 0) {
      const selectedItems = chillerItems.filter(i => selectedItemIds.includes(i.id));
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
  }, [isBatchOutModalOpen, selectedItemIds, chillerItems]);

  const pdBreakdown = useMemo(() => {
    const groups: { [date: string]: { date: string; pcs: number; kgs: number; items: ChillerItem[] } } = {};

    chillerItems.forEach(item => {
      const date = item.productionDate || 'TANPA TANGGAL';
      if (!groups[date]) {
        groups[date] = { date, pcs: 0, kgs: 0, items: [] };
      }
      groups[date].pcs += item.pcs || 0;
      groups[date].kgs += item.kgs || 0;
      groups[date].items.push(item);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.date === 'TANPA TANGGAL') return 1;
      if (b.date === 'TANPA TANGGAL') return -1;
      return b.date.localeCompare(a.date);
    });
  }, [chillerItems]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterSource('ALL');
    setFilterAllocation('ALL');
    setFilterWIP('ALL');
    setFilterProdDate('');
    setFilterSlaughterDate('');
  };

  const toggleSelection = (id: string) => {
    const item = chillerItems.find(i => i.id === id);
    if (item?.status === 'PENDING_QC') return;

    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const executeConfirm = async () => {
    const userRole = user?.role?.toUpperCase() || '';
    if (destination === 'Condem' && (userRole === 'ADMINQC' || userRole === 'SUPERADMIN') && !showAdminCondemConfirm) {
      setShowAdminCondemConfirm(true);
      return;
    }

    if (isBatchOutModalOpen) {
      await onBatchOut(selectedItemIds, destination);
      setSelectedItemIds([]);
      setIsBatchOutModalOpen(false);
    } else if (selectedItemForSingleOut) {
      await onOut(selectedItemForSingleOut.id, destination, outPcs, outKgs);
      setSelectedItemForSingleOut(null);
    }
    setShowAdminCondemConfirm(false);
    handleRefreshAll();
  };

  // Superadmin Edit/Delete Handlers
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

    const dbStatus = batch.status === 'OUT_CHILLER' ? 'OUT' : batch.status === 'PENDING_QC' ? 'PENDING' : 'IN';
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

      await safeUpdateChillerStock(
        { col: 'batch_id', val: editingBatch.batchId },
        {
          items_id: editingItemsId,
          quantity_pcs: editingPcs,
          quantity_kgs: editingKgs,
          production_date: editingProductionDate,
          slaughtering_date: editingSlaughteringDate,
          source: editingSource,
          allocation: editingAllocation,
          isWIP: editingIsWIP,
          status: editingStatus
        }
      );

      const { data: firstInTrx } = await supabase
        .from('transactions')
        .select('id')
        .eq('batch_id', editingBatch.batchId)
        .eq('transaction_type', 'in')
        .limit(1);

      if (firstInTrx && firstInTrx.length > 0) {
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
      handleRefreshAll();
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
      await supabase.from('transactions').delete().eq('batch_id', deletingBatch.batchId);
      await supabase.from('chiller_stock').delete().eq('batch_id', deletingBatch.batchId);
      setDeletingBatch(null);
      handleRefreshAll();
    } catch (err: any) {
      console.error("Failed to delete batch:", err);
      setError(err?.message || String(err));
    } finally {
      setIsMutating(false);
    }
  };

  const isInvalidPartial = selectedItemForSingleOut && (
    outPcs <= 0 || outPcs > selectedItemForSingleOut.pcs ||
    outKgs <= 0 || outKgs > selectedItemForSingleOut.kgs
  );

  return (
    <div className="space-y-4 pb-24 select-none md:select-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight uppercase">Stok Chiller</h2>
          <p className="text-[8px] md:text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            Manajemen Inventori
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Cari item"
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-4 focus:ring-red-100 focus:border-red-600 outline-none shadow-sm font-bold text-[11px] transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-black text-[10px] transition-all cursor-pointer ${showFilters ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}
          >
            <Filter size={12} /> FILTER
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
        <div
          onClick={() => setIsPDModalOpen(true)}
          className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between cursor-pointer hover:border-red-200 hover:shadow-md transition-all active:scale-[0.98] group relative"
          title="Klik untuk melihat detail per tanggal produksi"
        >
          <div>
            <div className="flex justify-between items-center">
              <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest group-hover:text-red-600 transition-colors">Total Batch PD</p>
              <span className="text-[7px] font-black text-red-600 bg-red-50 px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all uppercase tracking-wider">Detail</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-gray-900">{summaryTotals.uniquePDCount}</span>
              <span className="text-[9px] font-bold text-gray-400">Production Date</span>
            </div>
          </div>
          <span className="text-[9px] text-gray-400 mt-1 font-bold group-hover:text-red-600 transition-colors">
            ({totalCount} Total Batch Server)
          </span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Total Quantity</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-red-600">{formatNumber(summaryTotals.pcs, 0)}</span>
            <span className="text-[9px] font-bold text-gray-400">Pcs</span>
          </div>
        </div>
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex flex-col col-span-2 md:col-span-1">
          <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Total Berat</p>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black text-red-600">{formatNumber(summaryTotals.kgs, 2)}</span>
            <span className="text-[9px] font-bold text-gray-400">Kgs</span>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-in slide-in-from-top-2">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase">Sumber</label>
            <select className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold" value={filterSource} onChange={(e) => setFilterSource(e.target.value as any)}>
              <option value="ALL">SEMUA</option>
              {INFLOW_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase">Alokasi</label>
            <select className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold" value={filterAllocation} onChange={(e) => setFilterAllocation(e.target.value as any)}>
              <option value="ALL">SEMUA</option>
              {INFLOW_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase">WIP</label>
            <select className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold" value={filterWIP} onChange={(e) => setFilterWIP(e.target.value as any)}>
              <option value="ALL">SEMUA</option>
              <option value="WIP">WIP</option>
              <option value="REGULAR">REGULAR</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tgl Produksi</label>
            <input type="date" className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold outline-none" value={filterProdDate} onChange={(e) => setFilterProdDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tgl Potong</label>
            <input type="date" className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-bold outline-none" value={filterSlaughterDate} onChange={(e) => setFilterSlaughterDate(e.target.value)} />
          </div>
          <div className="flex items-end pb-1">
            <button onClick={resetFilters} className="w-full flex items-center justify-center gap-2 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-dashed border-gray-200 text-[9px] font-black uppercase cursor-pointer">
              <RotateCcw size={12} /> Reset
            </button>
          </div>
        </div>
      )}

      {/* Batch Out Action Banner */}
      {!isViewer && selectedItemIds.length > 0 && (
        <div className="sticky top-4 z-30 flex items-center justify-between bg-red-600 text-white p-3 rounded-xl shadow-xl animate-in slide-in-from-top">
          <div className="flex items-center gap-3 ml-2">
            <CheckSquare className="w-5 h-5" />
            <span className="font-black text-sm uppercase">{selectedItemIds.length} Terpilih</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedItemIds([])} className="px-3 py-1.5 hover:bg-red-700 rounded-lg text-xs font-bold uppercase cursor-pointer">Batal</button>
            <button onClick={() => setIsBatchOutModalOpen(true)} className="bg-white text-red-600 px-4 py-1.5 rounded-lg text-xs font-black shadow-lg flex items-center gap-2 uppercase cursor-pointer">
              <ArrowUpFromLine size={14} /> Keluar
            </button>
          </div>
        </div>
      )}

      {/* Paginated Stock List */}
      <div className="grid grid-cols-1 gap-3">
        {loadingInitial ? (
          <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 size={28} className="animate-spin text-red-600" />
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Memuat Stok Chiller...</span>
          </div>
        ) : chillerItems.length > 0 ? (
          chillerItems.map((item) => {
            const isSelected = selectedItemIds.includes(item.id);
            const isPendingQC = item.status === 'PENDING_QC';
            const userRole = user?.role?.toUpperCase() || '';

            return (
              <div
                key={item.id}
                onClick={() => !isViewer && toggleSelection(item.id)}
                className={`
                  group relative bg-white rounded-2xl overflow-hidden border-2 transition-all flex flex-col
                  ${isPendingQC ? 'border-amber-400 bg-amber-50/20' : isSelected ? 'border-red-500 bg-red-50/20' : 'border-gray-50 hover:border-red-200 shadow-sm'}
                  ${isPendingQC || isViewer ? 'cursor-default' : 'cursor-pointer'}
                `}
              >
                <div className="flex-1 flex flex-col p-3 gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-red-50 text-red-600 text-[7px] font-black uppercase px-1.5 py-0.5 rounded border border-red-100">S: {item.source}</span>
                      <span className="bg-blue-50 text-blue-600 text-[7px] font-black uppercase px-1.5 py-0.5 rounded border border-blue-100">A: {item.allocation}</span>
                      {item.isWIP && <span className="bg-amber-100 text-amber-700 text-[7px] font-black px-1.5 py-0.5 rounded">WIP</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[7.5px] font-bold text-gray-400 uppercase tracking-tighter mr-1">{item.batchId}</span>
                      {isSuperAdmin && (
                        <div className="flex items-center gap-1 print:hidden">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditBatchClick(item); }}
                            className="p-1 px-1.5 bg-gray-50 text-blue-600 hover:bg-blue-100 rounded-lg border border-blue-100 transition-colors cursor-pointer"
                            title="Edit Batch"
                          >
                            <Edit2 size={10} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteBatchClick(item); }}
                            className="p-1 px-1.5 bg-gray-50 text-red-600 hover:bg-red-100 rounded-lg border border-red-100 transition-colors cursor-pointer"
                            title="Hapus Batch"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm md:text-base font-black text-gray-900 uppercase leading-tight">{item.itemCode}</h3>
                      <div className="text-[9px] font-bold text-gray-500 truncate mt-0.5">{item.itemName}</div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[7px] font-black text-gray-400 uppercase">PD:</span>
                          <span className="text-[8px] font-bold text-gray-600">{item.productionDate}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[7px] font-black text-gray-400 uppercase">SD:</span>
                          <span className="text-[8px] font-bold text-gray-600">{item.slaughteringDate}</span>
                        </div>
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
                                onClick={(e) => { e.stopPropagation(); onQCReject(item.id); handleRefreshAll(); }}
                                className="p-2 bg-white text-gray-400 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                                title="Tolak"
                              >
                                <XCircle size={16} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onQCApprove(item.id); handleRefreshAll(); }}
                                className="bg-red-600 text-white font-black px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700 transition-colors uppercase text-[9px] shadow-lg shadow-red-100 cursor-pointer"
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
                          !isViewer && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedItemForSingleOut(item); }}
                              className="w-full md:w-auto bg-red-600 text-white font-black px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-all active:scale-95 uppercase text-[10px] shadow-lg shadow-red-200 group-hover:shadow-red-300 cursor-pointer"
                            >
                              <ArrowUpFromLine size={14} /> KELUAR
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white p-12 rounded-2xl border border-gray-100 text-center flex flex-col items-center justify-center gap-3">
            <Package size={36} className="text-gray-300" />
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Tidak ada item yang ditemukan</span>
          </div>
        )}
      </div>

      {/* Infinite Scroll Bottom Sentinel & Progress Indicator */}
      <div ref={observerTarget} className="py-4 text-center">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 text-red-600 font-bold text-xs uppercase tracking-wider py-2">
            <Loader2 size={16} className="animate-spin" />
            <span>Memuat 30 item berikutnya...</span>
          </div>
        )}

        {!loadingInitial && chillerItems.length > 0 && (
          <div className="mt-2 flex flex-col items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Menampilkan {chillerItems.length} dari {totalCount} total item
            </span>
            {hasMore && !loadingMore && (
              <button
                onClick={handleLoadMore}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-red-300 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
              >
                Muat Lebih Banyak
              </button>
            )}
            {!hasMore && chillerItems.length >= totalCount && totalCount > 0 && (
              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg uppercase tracking-wider border border-emerald-100">
                ✓ Semua data telah dimuat ({totalCount} item)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Single / Batch Out Modal */}
      {(isBatchOutModalOpen || selectedItemForSingleOut) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase">Proses Pengeluaran</h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                    {isBatchOutModalOpen ? `${selectedItemIds.length} Batch terpilih` : `BATCH: ${selectedItemForSingleOut?.batchId}`}
                  </p>
                </div>
                <button onClick={() => { setIsBatchOutModalOpen(false); setSelectedItemForSingleOut(null); setShowAdminCondemConfirm(false); }} className="p-1 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
                  <X size={20} className="text-gray-400" />
                </button>
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
                        <button
                          key={dest}
                          onClick={() => setDestination(dest)}
                          className={`py-2 px-1 rounded-lg border-2 text-[8px] font-black transition-all uppercase cursor-pointer ${destination === dest ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-50 hover:border-gray-200 text-gray-400'}`}
                        >
                          {dest}
                        </button>
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
              <button onClick={() => { if (showAdminCondemConfirm) setShowAdminCondemConfirm(false); else { setIsBatchOutModalOpen(false); setSelectedItemForSingleOut(null); } }} className="flex-1 py-3 font-black text-gray-400 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all uppercase text-xs cursor-pointer">Batal</button>
              <button disabled={isInvalidPartial} onClick={executeConfirm} className={`flex-1 py-3 font-black text-white rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 uppercase text-xs cursor-pointer ${isInvalidPartial ? 'bg-gray-300 cursor-not-allowed grayscale' : 'bg-red-600 shadow-red-100 hover:bg-red-700 active:scale-95'}`}>
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

      {/* Calculator Popup */}
      {activeCalculator && (
        <CalculatorPopup
          initialValue={activeCalculator === 'pcs' ? outPcs : outKgs}
          title={`Hitung ${activeCalculator === 'pcs' ? 'Qty Keluar (Pcs)' : 'Berat Keluar (Kg)'}`}
          onApply={(val) => {
            if (activeCalculator === 'pcs') setOutPcs(val);
            else setOutKgs(val);
          }}
          onClose={() => setActiveCalculator(null)}
        />
      )}

      {/* Superadmin Edit Modal */}
      {isSuperAdmin && editingBatch && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border border-gray-100 p-6 relative animate-in zoom-in-95 duration-200 select-text">
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

            <form onSubmit={handleSaveEdit} className="space-y-4 font-sans">
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

      {/* Superadmin Delete Modal */}
      {isSuperAdmin && deletingBatch && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-gray-100 p-6 relative animate-in zoom-in-95 duration-200 font-sans">
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
                  <AlertTriangle size={12} className="inline mr-1" /> Penting: Tindakan ini juga akan menghapus seluruh catatan transaksi terkait dari database.
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
                      <Trash2 size={14} /> HAPUS
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Production Date Breakdown Modal */}
      {isPDModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200 select-text">
          <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-gray-100 p-6 relative animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Rincian Per Tanggal Produksi</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total {pdBreakdown.length} Tanggal Produksi (Halaman Terload)</p>
              </div>
              <button
                onClick={() => setIsPDModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {pdBreakdown.map((group) => {
                const isExpanded = expandedPD === group.date;
                return (
                  <div key={group.date} className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                    <div
                      onClick={() => setExpandedPD(isExpanded ? null : group.date)}
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-red-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                          PD: {group.date}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">
                          ({group.items.length} Batch)
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-xs font-black text-gray-900">{formatNumber(group.pcs, 0)} Pcs</span>
                          <span className="text-[10px] font-bold text-gray-400 block">{formatNumber(group.kgs, 2)} Kg</span>
                        </div>
                        {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-white p-3 border-t border-gray-100 space-y-2">
                        {group.items.map(it => (
                          <div key={it.id} className="flex items-center justify-between text-xs py-1.5 px-2 hover:bg-gray-50 rounded-lg border-b border-gray-50 last:border-none">
                            <div>
                              <span className="font-black text-gray-800">{it.itemCode}</span>
                              <span className="text-[9px] text-gray-400 font-bold block">{it.batchId} • S: {it.source}</span>
                            </div>
                            <div className="text-right font-black text-gray-700">
                              {formatNumber(it.pcs, 0)} Pcs / {formatNumber(it.kgs, 2)} Kg
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryList;
