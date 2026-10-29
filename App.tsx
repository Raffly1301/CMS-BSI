
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  ArrowDownToLine,
  ThermometerSnowflake,
  ClipboardList,
  BarChart3,
  Menu,
  X,
  LogOut,
  User as UserIcon,
  ChevronLast,
  ChevronFirst,
  Database,
  Layers,
  Info
} from 'lucide-react';
import { ViewState, ChillerItem, Transaction, SystemLog, User, OutflowDestination } from './types';
import Dashboard from './components/Dashboard';
import InflowForm from './components/InflowForm';
import InventoryList from './components/InventoryList';
import Reports from './components/Reports';
import DailyStockReport from './components/DailyStockReport';
import ItemDatabase from './components/ItemDatabase';
import VirtualInventoryList from './components/VirtualInventoryList';
import LoginForm from './components/LoginForm';
import { supabase } from './lib/supabase';
import { safeInsertChillerStock } from './lib/chillerStockHelper';
import { isEgressQuotaError, saveTableCache, getTableCache } from './lib/cacheHelper';
import { getMasterItems, getMasterUsers } from './lib/masterCache';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('bsi_auth') === 'true';
  });

  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('bsi_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [activeView, setActiveView] = useState<ViewState>(() => {
    const savedUser = localStorage.getItem('bsi_user');
    const parsed = savedUser ? JSON.parse(savedUser) : null;
    return parsed?.role?.toUpperCase() === 'VIEWER' ? 'INVENTORY' : 'INFLOW';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(false);
  const [fetchProgressMessage, setFetchProgressMessage] = useState<string>('');
  const [dashboardDateRange, setDashboardDateRange] = useState<{ start?: string, end?: string }>({
    start: new Date().toISOString().split('T')[0] + 'T00:00:00.000Z',
    end: new Date().toISOString().split('T')[0] + 'T23:59:59.999Z'
  });

  // Per-resource loading & loaded states for efficient on-demand menu loading
  const [stockLoaded, setStockLoaded] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [trxLoaded, setTrxLoaded] = useState(false);
  const [trxLoading, setTrxLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const [chillerTable, setChillerTable] = useState<ChillerItem[]>([]);
  const [transactionTable, setTransactionTable] = useState<Transaction[]>([]);
  const [logTable, setLogTable] = useState<SystemLog[]>([]);

  const itemsCache = useRef<Record<string, { name: string, code: string }>>({});
  const usersCache = useRef<Record<string, string>>({});
  const stockLoadedRef = useRef(false);
  stockLoadedRef.current = stockLoaded;
  const trxLoadedRef = useRef(false);
  trxLoadedRef.current = trxLoaded;

  // Helper: fetch data from a Supabase table without recursive loops
  const fetchTableData = useCallback(async (table: string, orderCol: string, selectCols = '*', dateStart?: string, dateEnd?: string, maxLimit = 100) => {
    try {
      let query = supabase
        .from(table)
        .select(selectCols)
        .order(orderCol, { ascending: false })
        .limit(maxLimit);

      if (dateStart) {
        query = query.gte(orderCol, dateStart);
      }
      if (dateEnd) {
        query = query.lte(orderCol, dateEnd);
      }

      const { data, error } = await query;

      if (error) {
        if (isEgressQuotaError(error)) {
          setIsQuotaExceeded(true);
        }
        const cached = getTableCache(table);
        return cached || [];
      }

      if (data && data.length > 0) {
        saveTableCache(table, data);
      }
      return data || [];
    } catch (err: any) {
      if (isEgressQuotaError(err)) {
        setIsQuotaExceeded(true);
      }
      const cached = getTableCache(table);
      return cached || [];
    }
  }, []);

  const [usersList, setUsersList] = useState<User[]>([]);

  const fetchLookups = useCallback(async () => {
    try {
      const [{ map: itemsMap }, { list: usersData, map: usersMap }] = await Promise.all([
        getMasterItems(),
        getMasterUsers()
      ]);
      itemsCache.current = itemsMap;
      usersCache.current = usersMap;
      if (usersData && usersData.length > 0) {
        setUsersList(usersData as User[]);
      }
    } catch (e) {
      console.warn("Non-fatal lookups fetch issue:", e);
    }
  }, []);

  // Fetch only chiller stock from the last 2 weeks (used by Dashboard, Laporan, Stok Harian)
  const fetchStock = useCallback(async (silent = false) => {
    if (!silent) setStockLoading(true);
    try {
      await fetchLookups();
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      twoWeeksAgo.setHours(0, 0, 0, 0);

      const stockData = await fetchTableData(
        'chiller_stock',
        'created_at',
        '*',
        twoWeeksAgo.toISOString(),
        undefined,
        100
      );

      const mappedStock: ChillerItem[] = (stockData || []).map((item: any) => ({
        id: item.id ? String(item.id) : String(item.batch_id),
        batchId: item.batch_id,
        itemsId: item.items_id,
        itemCode: itemsCache.current[item.items_id]?.code || 'N/A',
        itemName: itemsCache.current[item.items_id]?.name || item.items_id,
        pcs: Number(item.quantity_pcs || 0),
        kgs: Number(item.quantity_kgs || 0),
        productionDate: item.production_date,
        slaughteringDate: item.slaughtering_date,
        source: item.source || 'FPS',
        allocation: item.allocation || 'FPS',
        entryTimestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
        exitTimestamp: undefined,
        status: (
          item.status === 'OUT' || item.status === 'OUT_CHILLER' ? 'OUT_CHILLER' :
            item.status === 'PENDING' || item.status === 'QC_PENDING' ? 'PENDING_QC' :
              'IN_CHILLER'
        ),
        isWIP: item.status_WIP === true || item.status_WIP === 'true' || item.status_wip === true || item.status_wip === 'true'
      }));

      setChillerTable(mappedStock);
      setStockLoaded(true);
    } catch (err) {
      console.error("Stock Fetch Error:", err);
    } finally {
      if (!silent) setStockLoading(false);
    }
  }, [fetchTableData, fetchLookups]);

  // Fetch only transactions (used by Dashboard, Laporan & Log, Stok Harian)
  const fetchTransactions = useCallback(async (silent = false, dateStart?: string, dateEnd?: string) => {
    if (!silent) setTrxLoading(true);
    try {
      await fetchLookups();
      const trxData = await fetchTableData(
        'transactions',
        'transaction_time',
        'id,batch_id,note,quantity_pcs,quantity_kgs,transaction_type,destination,user_id,transaction_time',
        dateStart,
        dateEnd,
        100
      );

      const mappedTrx: Transaction[] = (trxData || []).map((item: any) => ({
        id: String(item.id),
        chillerId: String(item.batch_id || 'N/A'),
        itemCode: item.note || undefined,
        userId: usersCache.current[item.user_id] || item.user_id,
        type: (item.transaction_type || '').toUpperCase() as any,
        destination: item.destination as OutflowDestination,
        pcs: Number(item.quantity_pcs || 0),
        kgs: Number(item.quantity_kgs || 0),
        timestamp: item.transaction_time ? new Date(item.transaction_time).getTime() : Date.now(),
        note: item.note || undefined
      }));

      // Dynamically heal missing 'IN' transactions for batches with outflow
      const synthesizedTrxs: Transaction[] = [];
      chillerTable.forEach(stockItem => {
        const hasIn = mappedTrx.some(t => t.chillerId === stockItem.batchId && t.type === 'IN');
        if (!hasIn) {
          const outTrxsForBatch = mappedTrx.filter(t => t.chillerId === stockItem.batchId && t.type === 'OUT');
          const totalOutPcs = outTrxsForBatch.reduce((sum, t) => sum + t.pcs, 0);
          const totalOutKgs = outTrxsForBatch.reduce((sum, t) => sum + t.kgs, 0);

          const reconstructedOriginalPcs = stockItem.pcs + totalOutPcs;
          const reconstructedOriginalKgs = stockItem.kgs + totalOutKgs;

          if (reconstructedOriginalPcs > 0 || reconstructedOriginalKgs > 0) {
            synthesizedTrxs.push({
              id: `SYNTH-IN-${stockItem.id}-${stockItem.batchId}`,
              chillerId: stockItem.batchId,
              itemCode: stockItem.itemCode,
              userId: 'SYSTEM',
              type: 'IN',
              pcs: reconstructedOriginalPcs,
              kgs: reconstructedOriginalKgs,
              timestamp: stockItem.entryTimestamp
            });
          }
        }
      });

      const finalTrx = [...mappedTrx, ...synthesizedTrxs];
      setTransactionTable(finalTrx);
      setLogTable(finalTrx.map((t, idx) => ({
        id: `LOG-${t.id}-${idx}`,
        userId: t.userId,
        action: t.type,
        details: `${t.type} untuk Batch ${t.chillerId} (${t.pcs} Pcs / ${t.kgs.toFixed(2)} Kg)`,
        timestamp: t.timestamp
      })));
      setTrxLoaded(true);
    } catch (err) {
      console.error("Transactions Fetch Error:", err);
    } finally {
      if (!silent) setTrxLoading(false);
    }
  }, [fetchTableData, fetchLookups, chillerTable]);

  const fetchData = useCallback(async (silent = false) => {
    await Promise.all([fetchStock(silent), fetchTransactions(silent)]);
  }, [fetchStock, fetchTransactions]);

  const stockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const trxTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFetchStock = useCallback((silent = true) => {
    if (stockTimeoutRef.current) clearTimeout(stockTimeoutRef.current);
    stockTimeoutRef.current = setTimeout(() => {
      fetchStock(silent);
    }, 1200);
  }, [fetchStock]);

  const debouncedFetchTrx = useCallback((silent = true) => {
    if (trxTimeoutRef.current) clearTimeout(trxTimeoutRef.current);
    trxTimeoutRef.current = setTimeout(() => {
      fetchTransactions(silent);
    }, 1200);
  }, [fetchTransactions]);

  useEffect(() => {
    return () => {
      if (stockTimeoutRef.current) clearTimeout(stockTimeoutRef.current);
      if (trxTimeoutRef.current) clearTimeout(trxTimeoutRef.current);
    };
  }, []);

  // Preload master items and users into memory cache immediately on app initialization
  useEffect(() => {
    if (isAuthenticated) {
      getMasterItems().catch(err => console.warn('Preload master items failed:', err));
      getMasterUsers().catch(err => console.warn('Preload master users failed:', err));
    }
  }, [isAuthenticated]);

  // EFFICIENT ON-DEMAND LOADING:
  // Only load the exact tables required for the currently active menu!
  useEffect(() => {
    if (!isAuthenticated) return;

    // Menus that are completely independent and require NO stock or transactions
    if (activeView === 'INFLOW' || activeView === 'ITEM_DATABASE' || activeView === 'VIRTUAL_INVENTORY') {
      return;
    }

    // "Stok Chiller" only needs chiller stock (no transactions needed!)
    if (activeView === 'INVENTORY') {
      if (!stockLoadedRef.current) {
        fetchStock();
      }
      return;
    }

    // Views that require both stock and transactions
    if (activeView === 'DASHBOARD') {
      if (!stockLoadedRef.current) {
        fetchStock();
      }
      fetchTransactions(false, dashboardDateRange.start, dashboardDateRange.end);
      return;
    }

    if (activeView === 'REPORTS' || activeView === 'DAILY_REPORT') {
      if (!stockLoadedRef.current) {
        fetchStock();
      }
      if (!trxLoadedRef.current) {
        fetchTransactions();
      }
    }
  }, [activeView, isAuthenticated, fetchStock, fetchTransactions, dashboardDateRange]);

  // Real-time synchronization only for data that has already been loaded by the user
  useEffect(() => {
    if (isAuthenticated && !isQuotaExceeded) {
      const channel = supabase.channel('bsi-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chiller_stock' }, () => {
          if (stockLoadedRef.current && !isQuotaExceeded) {
            debouncedFetchStock(true);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
          if (trxLoadedRef.current && !isQuotaExceeded) {
            debouncedFetchTrx(true);
          }
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [isAuthenticated, isQuotaExceeded, debouncedFetchStock, debouncedFetchTrx]);

  const updateVirtualStock = async (destination: string, itemsId: string, pcs: number, kgs: number, type: 'ADD' | 'SUBTRACT') => {
    try {
      // Fetch all records with specific columns to minimize payload
      const { data: records, error: fetchError } = await supabase
        .from('virtual_inventory')
        .select('id,items_id,quantity_pcs,quantity_kgs,destination')
        .eq('destination', destination);

      if (fetchError) throw fetchError;

      let totalPcs = 0;
      let totalKgs = 0;
      let targetId = null;

      if (records && records.length > 0) {
        // Sum everything up from existing records (handles migration from item-based to section-based)
        totalPcs = records.reduce((sum, r) => sum + (r.quantity_pcs || 0), 0);
        totalKgs = records.reduce((sum, r) => sum + Number(r.quantity_kgs || 0), 0);
        targetId = records[0].id;

        // If there are multiple records (old item-based data), consolidate them
        if (records.length > 1) {
          const idsToDelete = records.slice(1).map(r => r.id);
          await supabase.from('virtual_inventory').delete().in('id', idsToDelete);
        }
      }

      const newPcs = type === 'ADD' ? totalPcs + pcs : totalPcs - pcs;
      const newKgs = type === 'ADD' ? totalKgs + kgs : totalKgs - kgs;

      if (targetId) {
        const { error: updateError } = await supabase
          .from('virtual_inventory')
          .update({
            quantity_pcs: Math.max(0, newPcs),
            quantity_kgs: Math.max(0, newKgs),
            updated_at: new Date().toISOString()
          })
          .eq('id', targetId);
        if (updateError) throw updateError;
      } else if (type === 'ADD') {
        const { error: insertError } = await supabase
          .from('virtual_inventory')
          .insert({
            destination,
            items_id: itemsId,
            quantity_pcs: Math.max(0, pcs),
            quantity_kgs: Math.max(0, kgs),
            updated_at: new Date().toISOString()
          });
        if (insertError) throw insertError;
      }
    } catch (err: any) {
      console.error("Virtual Inventory Update Error:", err);
    }
  };

  const handleInflow = async (newItems: Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status' | 'itemCode'>[]) => {
    if (!user) return;
    setIsActionLoading(true);
    let successCount = 0;
    let failCount = 0;
    let lastErrorMsg = "";

    // Keep track of used batch IDs for each unique datePart during this save operation
    const usedBatchIdsMap = new Map<string, Set<string>>();

    const getExistingBatchIds = async (datePart: string) => {
      if (usedBatchIdsMap.has(datePart)) {
        return usedBatchIdsMap.get(datePart)!;
      }
      const set = new Set<string>();

      // Seed from in-memory chiller table & transactions
      chillerTable.forEach(row => {
        if (row.batchId && row.batchId.includes(datePart)) {
          set.add(row.batchId);
        }
      });
      transactionTable.forEach(row => {
        if (row.chillerId && row.chillerId.includes(datePart)) {
          set.add(row.chillerId);
        }
      });

      try {
        const { data, error } = await supabase
          .from('chiller_stock')
          .select('batch_id')
          .like('batch_id', `BSI-%${datePart}-%`)
          .limit(100);

        if (!error && data) {
          data.forEach((row: any) => {
            if (row.batch_id) set.add(row.batch_id);
          });
        }
      } catch (e) {
        console.error("Error fetching existing batch ids:", e);
      }
      usedBatchIdsMap.set(datePart, set);
      return set;
    };

    const generateUniqueBatchId = (datePart: string, existingSet: Set<string>): string => {
      // 1. Try 4-digit random numbers (1000-9999) - 9000 combinations
      for (let attempt = 0; attempt < 250; attempt++) {
        const rand = Math.floor(1000 + Math.random() * 9000);
        const candidate = `BSI-${datePart}-${rand}`;
        if (!existingSet.has(candidate)) {
          return candidate;
        }
      }

      // 2. Try 5-digit random numbers (10000-99999) - 90000 combinations
      for (let attempt = 0; attempt < 250; attempt++) {
        const rand = Math.floor(10000 + Math.random() * 90000);
        const candidate = `BSI-${datePart}-${rand}`;
        if (!existingSet.has(candidate)) {
          return candidate;
        }
      }

      // 3. Fallback sequential increment guaranteed to find an unused number
      let seq = existingSet.size + 1;
      while (true) {
        const candidate = `BSI-${datePart}-${seq}`;
        if (!existingSet.has(candidate)) {
          return candidate;
        }
        seq++;
      }
    };

    for (const item of newItems) {
      const formatDateForBatch = (d: string) => {
        if (!d) return '';
        const parts = d.split('-');
        if (parts.length < 3) return d.replace(/[^0-9]/g, '');
        return parts[2] + parts[1] + parts[0].slice(-2);
      };

      const pdFmt = formatDateForBatch(item.productionDate);
      const sdFmt = formatDateForBatch(item.slaughteringDate);
      const datePart = pdFmt === sdFmt ? pdFmt : `${pdFmt}${sdFmt}`;

      const existingSet = await getExistingBatchIds(datePart);
      const currentItemCode = itemsCache.current[item.itemsId]?.code || 'N/A';

      let itemSaved = false;
      let retries = 0;
      const MAX_RETRIES = 5;

      while (!itemSaved && retries < MAX_RETRIES) {
        const batchId = generateUniqueBatchId(datePart, existingSet);
        existingSet.add(batchId);

        try {
          try {
            await safeInsertChillerStock([{
              batch_id: batchId,
              items_id: item.itemsId,
              quantity_pcs: item.pcs,
              quantity_kgs: item.kgs,
              production_date: item.productionDate,
              slaughtering_date: item.slaughteringDate,
              status: 'IN',
              created_by: user.id,
              source: item.source,
              allocation: item.allocation,
              isWIP: item.isWIP || false
            }]);
          } catch (stockErr: any) {
            // Check for duplicate key / unique constraint violation
            const isDuplicate = stockErr.code === '23505' ||
              stockErr.message?.toLowerCase().includes('unique') ||
              stockErr.message?.toLowerCase().includes('duplicate') ||
              stockErr.details?.toLowerCase().includes('already exists');

            if (isDuplicate) {
              console.warn(`Duplicate key detected for batch_id ${batchId}, regenerating new batch ID and retrying...`);
              retries++;
              await new Promise(res => setTimeout(res, 50 * retries));
              continue;
            }
            throw stockErr;
          }

          const { error: trxErr } = await supabase.from('transactions').insert({
            batch_id: batchId,
            note: currentItemCode,
            destination: 'Chiller',
            quantity_pcs: item.pcs,
            quantity_kgs: item.kgs,
            transaction_type: 'in',
            user_id: user.id,
            transaction_time: new Date().toISOString()
          });
          if (trxErr) throw trxErr;

          // Virtual Inventory Update: If source is a virtual location, subtract from it
          const sourceToDestMap: Record<string, string> = {
            'PARTING': 'Parting',
            'MARINASI': 'Marinasi',
            'BONELESS': 'Boneless',
            'RETUR': 'Retur',
            'THOWING': 'Thowing',
            'FPS': 'FPS',
            'SMS': 'SMS',
            'IQF': 'IQF',
            'CS': 'CS'
          };

          const mappedSource = sourceToDestMap[item.source.toUpperCase()];
          if (mappedSource) {
            await updateVirtualStock(mappedSource, item.itemsId, item.pcs, item.kgs, 'SUBTRACT');
          }

          itemSaved = true;
          successCount++;
        } catch (err: any) {
          console.error("Inflow Error:", err);
          failCount++;
          lastErrorMsg = err?.message || String(err);
          break;
        }
      }

      if (!itemSaved && retries >= MAX_RETRIES) {
        failCount++;
        lastErrorMsg = `Gagal mendapatkan ID batch unik setelah ${MAX_RETRIES} percobaan.`;
      }
    }

    if (failCount > 0) {
      alert(`Gagal menyimpan ${failCount} item dari total ${newItems.length} item. Error: ${lastErrorMsg}`);
    }

    await fetchStock(true);
    setIsActionLoading(false);
    setActiveView('INVENTORY');
  };

  const handleOutflow = async (id: string, destination: OutflowDestination, outPcs?: number, outKgs?: number, skipLoading = false) => {
    if (!user) return;
    if (!skipLoading) setIsActionLoading(true);
    
    let item: any = chillerTable.find(i => i.id === id || i.batchId === id);
    if (!item) {
      const { data } = await supabase
        .from('chiller_stock')
        .select('*')
        .or(`id.eq.${id},batch_id.eq.${id}`)
        .limit(1);
      if (data && data.length > 0) {
        item = {
          id: String(data[0].id),
          batchId: data[0].batch_id,
          itemsId: data[0].items_id,
          itemCode: itemsCache.current[data[0].items_id]?.code || 'N/A',
          itemName: itemsCache.current[data[0].items_id]?.name || data[0].items_id,
          pcs: Number(data[0].quantity_pcs || 0),
          kgs: Number(data[0].quantity_kgs || 0),
          productionDate: data[0].production_date,
          slaughteringDate: data[0].slaughtering_date,
          source: data[0].source || 'FPS',
          allocation: data[0].allocation || 'FPS',
          entryTimestamp: data[0].created_at ? new Date(data[0].created_at).getTime() : Date.now(),
          status: data[0].status
        };
      }
    }

    if (!item) {
      if (!skipLoading) setIsActionLoading(false);
      alert('Item chiller tidak ditemukan.');
      return;
    }

    const actualPcs = outPcs ?? item.pcs;
    const actualKgs = outKgs ?? item.kgs;
    const userRole = user.role.toUpperCase();
    const isCondem = destination === 'Condem' && (userRole === 'USER' || userRole === 'ADMIN');

    try {
      if (!isCondem && actualPcs >= item.pcs) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('process_batch_outflow', {
          p_batch_ids: [item.batchId],
          p_destination: destination,
          p_user_id: user.id
        });

        if (!rpcError && rpcData && rpcData.success) {
          if (destination !== 'Delive' && destination !== 'Condem') {
            await updateVirtualStock(destination, item.itemsId, actualPcs, actualKgs, 'ADD');
          }
          await fetchStock(true);
          if (trxLoadedRef.current) await fetchTransactions(true);
          if (!skipLoading) setIsActionLoading(false);
          return;
        }
      }

      if (isCondem) {
        const { error: stockErr } = await supabase.from('chiller_stock')
          .update({ status: 'PENDING' })
          .eq('batch_id', item.batchId);

        if (stockErr) throw stockErr;

        const { error: trxErr } = await supabase.from('transactions').insert({
          batch_id: item.batchId,
          note: item.itemCode,
          destination: 'Condem',
          quantity_pcs: actualPcs,
          quantity_kgs: actualKgs,
          transaction_type: 'qc_pending',
          user_id: user.id,
          transaction_time: new Date().toISOString()
        });
        if (trxErr) throw trxErr;
      } else {
        if (actualPcs >= item.pcs) {
          const { error: upErr } = await supabase.from('chiller_stock')
            .update({
              status: 'OUT',
              quantity_pcs: 0,
              quantity_kgs: 0
            })
            .eq('batch_id', item.batchId);
          if (upErr) throw upErr;
        } else {
          const { error: upErr } = await supabase.from('chiller_stock')
            .update({
              quantity_pcs: item.pcs - actualPcs,
              quantity_kgs: item.kgs - actualKgs
            })
            .eq('batch_id', item.batchId);
          if (upErr) throw upErr;
        }

        const { error: trxErr } = await supabase.from('transactions').insert({
          batch_id: item.batchId,
          note: item.itemCode,
          destination: destination,
          quantity_pcs: actualPcs,
          quantity_kgs: actualKgs,
          transaction_type: 'out',
          user_id: user.id,
          transaction_time: new Date().toISOString()
        });

        if (trxErr) throw trxErr;

        if (destination !== 'Delive' && destination !== 'Condem') {
          await updateVirtualStock(destination, item.itemsId, actualPcs, actualKgs, 'ADD');
        }
      }

      await fetchStock(true);
      if (trxLoadedRef.current) await fetchTransactions(true);
    } catch (err: any) {
      console.error("Outflow Error:", err);
      alert(`Gagal memproses pengeluaran stok: ${err?.message || err}`);
    } finally {
      if (!skipLoading) setIsActionLoading(false);
    }
  };

  const handleBatchOut = async (ids: string[], destination: OutflowDestination) => {
    if (!user) return;
    setIsActionLoading(true);
    const userRole = user.role.toUpperCase();
    const isCondem = destination === 'Condem' && (userRole === 'USER' || userRole === 'ADMIN');

    if (!isCondem) {
      try {
        const batchIdsList: string[] = [];
        const itemsToUpdate: any[] = [];

        for (const id of ids) {
          let item: any = chillerTable.find(i => i.id === id || i.batchId === id);
          if (!item) {
            const { data } = await supabase
              .from('chiller_stock')
              .select('*')
              .or(`id.eq.${id},batch_id.eq.${id}`)
              .limit(1);
            if (data && data.length > 0) {
              item = {
                id: String(data[0].id),
                batchId: data[0].batch_id,
                itemsId: data[0].items_id,
                pcs: Number(data[0].quantity_pcs || 0),
                kgs: Number(data[0].quantity_kgs || 0),
                source: data[0].source || 'FPS'
              };
            }
          }
          if (item) {
            batchIdsList.push(item.batchId);
            itemsToUpdate.push(item);
          }
        }

        if (batchIdsList.length > 0) {
          const { data: rpcData, error: rpcError } = await supabase.rpc('process_batch_outflow', {
            p_batch_ids: batchIdsList,
            p_destination: destination,
            p_user_id: user.id
          });

          if (!rpcError && rpcData && rpcData.success) {
            if (destination !== 'Delive' && destination !== 'Condem') {
              for (const it of itemsToUpdate) {
                await updateVirtualStock(destination, it.itemsId, it.pcs, it.kgs, 'ADD');
              }
            }
            await fetchStock(true);
            if (trxLoadedRef.current) await fetchTransactions(true);
            setIsActionLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("RPC batch outflow transaction error, falling back:", e);
      }
    }

    let successCount = 0;
    let failCount = 0;
    let lastErrorMsg = "";

    for (const id of ids) {
      try {
        let item: any = chillerTable.find(i => i.id === id || i.batchId === id);
        if (!item) {
          const { data } = await supabase
            .from('chiller_stock')
            .select('*')
            .or(`id.eq.${id},batch_id.eq.${id}`)
            .limit(1);
          if (data && data.length > 0) {
            item = {
              id: String(data[0].id),
              batchId: data[0].batch_id,
              itemsId: data[0].items_id,
              itemCode: itemsCache.current[data[0].items_id]?.code || 'N/A',
              pcs: Number(data[0].quantity_pcs || 0),
              kgs: Number(data[0].quantity_kgs || 0),
              source: data[0].source || 'FPS',
              allocation: data[0].allocation || 'FPS'
            };
          }
        }
        if (!item) continue;

        const actualPcs = item.pcs;
        const actualKgs = item.kgs;

        if (isCondem) {
          const { error: stockErr } = await supabase.from('chiller_stock')
            .update({ status: 'PENDING' })
            .eq('batch_id', item.batchId);
          if (stockErr) throw stockErr;

          const { error: trxErr } = await supabase.from('transactions').insert({
            batch_id: item.batchId,
            note: item.itemCode || 'N/A',
            destination: 'Condem',
            quantity_pcs: actualPcs,
            quantity_kgs: actualKgs,
            transaction_type: 'qc_pending',
            user_id: user.id,
            transaction_time: new Date().toISOString()
          });
          if (trxErr) throw trxErr;
        } else {
          const { error: upErr } = await supabase.from('chiller_stock')
            .update({
              status: 'OUT',
              quantity_pcs: 0,
              quantity_kgs: 0
            })
            .eq('batch_id', item.batchId);
          if (upErr) throw upErr;

          const { error: trxErr } = await supabase.from('transactions').insert({
            batch_id: item.batchId,
            note: item.itemCode || 'N/A',
            destination: destination,
            quantity_pcs: actualPcs,
            quantity_kgs: actualKgs,
            transaction_type: 'out',
            user_id: user.id,
            transaction_time: new Date().toISOString()
          });
          if (trxErr) throw trxErr;

          if (destination !== 'Delive' && destination !== 'Condem') {
            await updateVirtualStock(destination, item.itemsId, actualPcs, actualKgs, 'ADD');
          }
        }
        successCount++;
      } catch (err: any) {
        console.error("Batch Outflow Error for ID:", id, err);
        failCount++;
        lastErrorMsg = err?.message || String(err);
      }
    }

    if (failCount > 0) {
      alert(`Gagal memproses total ${failCount} item dari total batch ${ids.length} item. Error: ${lastErrorMsg}`);
    }

    await fetchStock(true);
    if (trxLoadedRef.current) await fetchTransactions(true);
    setIsActionLoading(false);
  };

  const handleQCAction = async (id: string, action: 'APPROVE' | 'REJECT') => {
    const role = user?.role?.toUpperCase();
    if (!user || (role !== 'ADMINQC' && role !== 'SUPERADMIN')) return;
    const item = chillerTable.find(i => i.id === id);
    if (!item) return;

    setIsActionLoading(true);
    try {
      const { data: trxList } = await supabase
        .from('transactions')
        .select('*')
        .eq('batch_id', item.batchId)
        .eq('transaction_type', 'qc_pending')
        .order('transaction_time', { ascending: false })
        .limit(1);

      const lastTrx = trxList && trxList.length > 0 ? trxList[0] : null;

      if (lastTrx && lastTrx.destination === 'Condem') {
        if (action === 'APPROVE') {
          if (lastTrx.quantity_pcs >= item.pcs) {
            await supabase.from('chiller_stock').update({
              status: 'OUT',
              quantity_pcs: 0,
              quantity_kgs: 0
            }).eq('batch_id', item.batchId);
          } else {
            await supabase.from('chiller_stock').update({
              quantity_pcs: item.pcs - lastTrx.quantity_pcs,
              quantity_kgs: item.kgs - lastTrx.quantity_kgs,
              status: 'IN'
            }).eq('batch_id', item.batchId);
          }

          await supabase.from('transactions').insert({
            batch_id: item.batchId,
            note: item.itemCode,
            destination: 'Condem',
            quantity_pcs: lastTrx.quantity_pcs,
            quantity_kgs: lastTrx.quantity_kgs,
            transaction_type: 'out',
            user_id: user.id,
            transaction_time: new Date().toISOString()
          });
        } else {
          await supabase.from('chiller_stock')
            .update({ status: 'IN' })
            .eq('batch_id', item.batchId);

          await supabase.from('transactions').insert({
            batch_id: item.batchId,
            note: item.itemCode,
            destination: 'Chiller',
            quantity_pcs: item.pcs,
            quantity_kgs: item.kgs,
            transaction_type: 'qc_rejected',
            user_id: user.id,
            transaction_time: new Date().toISOString()
          });
        }
      } else {
        const { error: stockErr } = await supabase.from('chiller_stock')
          .update({ status: action === 'APPROVE' ? 'APPROVED' : 'IN' })
          .eq(item.id.includes('-') ? 'id' : 'batch_id', item.id);

        if (stockErr) throw stockErr;

        const { error: trxErr } = await supabase.from('transactions').insert({
          batch_id: item.batchId,
          note: item.itemCode,
          destination: 'Chiller',
          quantity_pcs: item.pcs,
          quantity_kgs: item.kgs,
          transaction_type: action === 'APPROVE' ? 'qc_approved' : 'qc_rejected',
          user_id: user.id,
          transaction_time: new Date().toISOString()
        });
        if (trxErr) throw trxErr;
      }

      await fetchStock(true);
      if (trxLoadedRef.current) await fetchTransactions(true);
    } catch (err: any) {
      console.error("QC Action Error:", err);
      alert(`Gagal memproses tindakan QC: ${err?.message || err}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogin = (u: User) => {
    setIsAuthenticated(true);
    setUser(u);
    localStorage.setItem('bsi_auth', 'true');
    localStorage.setItem('bsi_user', JSON.stringify(u));
    setStockLoaded(false);
    setTrxLoaded(false);
    setActiveView(u.role?.toUpperCase() === 'VIEWER' ? 'INVENTORY' : 'INFLOW');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('bsi_auth');
    localStorage.removeItem('bsi_user');
    setStockLoaded(false);
    setTrxLoaded(false);
  };

  const currentInventory = useMemo(() =>
    chillerTable.filter(item => item.status === 'IN_CHILLER' || item.status === 'PENDING_QC'),
    [chillerTable]);

  // Determine whether the currently selected menu is still loading its required data
  const isViewLoading = useMemo(() => {
    if (activeView === 'INFLOW' || activeView === 'ITEM_DATABASE' || activeView === 'VIRTUAL_INVENTORY') {
      return false;
    }
    if (activeView === 'INVENTORY') {
      return !stockLoaded;
    }
    if (activeView === 'DASHBOARD' || activeView === 'REPORTS' || activeView === 'DAILY_REPORT') {
      return !stockLoaded || !trxLoaded;
    }
    return false;
  }, [activeView, stockLoaded, trxLoaded]);

  const viewLoadingLabel = useMemo(() => {
    switch (activeView) {
      case 'INVENTORY':
        return 'Memuat Stok Chiller...';
      case 'DASHBOARD':
        return 'Memuat Data Dashboard...';
      case 'REPORTS':
        return 'Memuat Laporan & Log...';
      case 'DAILY_REPORT':
        return 'Memuat Stok Harian...';
      default:
        return 'Memuat Data...';
    }
  }, [activeView]);

  const isViewer = user?.role?.toUpperCase() === 'VIEWER';

  const navigation = [
    { name: 'Dashboard', view: 'DASHBOARD' as ViewState, icon: LayoutDashboard },
    ...(!isViewer ? [{ name: 'Input', view: 'INFLOW' as ViewState, icon: ArrowDownToLine }] : []),
    { name: 'Stok Chiller', view: 'INVENTORY' as ViewState, icon: ThermometerSnowflake },
    ...(user?.role?.toUpperCase() !== 'USER' ? [{ name: 'Laporan & Log', view: 'REPORTS' as ViewState, icon: ClipboardList }] : []),
    { name: 'Stok Harian', view: 'DAILY_REPORT' as ViewState, icon: BarChart3 },
    { name: 'Inventory', view: 'VIRTUAL_INVENTORY' as ViewState, icon: Layers },
    ...(user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'SUPERADMIN' ? [{ name: 'Database Item', view: 'ITEM_DATABASE' as ViewState, icon: Database }] : []),
  ];

  if (!isAuthenticated) return <LoginForm onLogin={handleLogin} />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 overflow-hidden relative">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] md:hidden animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Header (Top bar) */}
      <header className="md:hidden bg-[#c01e1e] text-white p-4 flex items-center justify-between shadow-lg z-50">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
        >
          <Menu size={24} />
        </button>
        <div className="flex items-center gap-3">
          <img src="/logo2.png" className="w-8 h-8 bg-white p-1 rounded-lg" />
          <span className="font-brand font-bold italic text-xs uppercase tracking-wider">BSI CMS</span>
        </div>
      </header>

      {/* Sidebar Aside Panel */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-[70] md:relative md:flex flex-col bg-[#c01e1e] text-white 
          transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} 
          ${sidebarCollapsed ? 'md:w-20' : 'md:w-64'}
          w-[280px] md:w-auto
        `}
      >
        <div className="p-4 md:p-6 border-b border-white/10 flex items-center gap-4">
          <button
            onClick={() => {
              if (window.innerWidth < 768) setSidebarOpen(false);
              else setSidebarCollapsed(!sidebarCollapsed);
            }}
            className="p-2 hover:bg-white/10 rounded-xl transition-all shrink-0"
          >
            <div className="md:hidden">
              <X size={22} className="text-white" />
            </div>
            <div className="hidden md:block">
              {sidebarCollapsed ? <ChevronLast size={20} /> : <ChevronFirst size={20} />}
            </div>
          </button>

          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-white p-1.5 rounded-xl w-10 h-10 shrink-0 flex items-center justify-center shadow-lg">
              <img src="/logo2.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0 animate-in slide-in-from-left-2">
                <span className="font-brand font-bold italic text-sm whitespace-nowrap leading-tight">
                  Bounty Segar Indonesia
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider opacity-60">
                  Chiller Management System
                </span>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto">
          {navigation.map(item => (
            <button
              key={item.name}
              onClick={() => { setActiveView(item.view); setSidebarOpen(false); }}
              className={`
                w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all group
                ${activeView === item.view
                  ? 'bg-white text-[#c01e1e] font-black shadow-[0_10px_20px_-5px_rgba(255,255,255,0.3)]'
                  : 'hover:bg-white/10 text-white/80 hover:text-white'
                }
              `}
            >
              <item.icon size={20} className={activeView === item.view ? 'text-[#c01e1e]' : 'group-hover:scale-110 transition-transform'} />
              {(!sidebarCollapsed || (window.innerWidth < 768)) && (
                <span className="text-[11px] font-black uppercase tracking-widest">{item.name}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User Profile Section */}
        {user && (
          <div className="px-4 py-6 border-t border-white/10 mx-2 mb-1 bg-white/5 rounded-3xl m-3">
            <div className={`flex items-center gap-3 ${sidebarCollapsed && window.innerWidth >= 768 ? 'justify-center' : ''}`}>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 border border-white/10">
                <UserIcon size={20} className="text-white" />
              </div>
              {(!sidebarCollapsed || window.innerWidth < 768) && (
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase truncate leading-tight text-white">{user.fullName || user.username}</p>
                  <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest mt-0.5">{user.role}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className={`p-4 border-t border-white/10 flex ${sidebarCollapsed && window.innerWidth >= 768 ? 'flex-col gap-3 items-center justify-center' : 'items-center justify-between gap-2'}`}>
          <button
            onClick={handleLogout}
            className={`
              flex items-center gap-4 px-4 py-3.5 hover:bg-red-500 rounded-2xl transition-all text-white/70 hover:text-white group
              ${sidebarCollapsed && window.innerWidth >= 768 ? 'w-10 h-10 p-0 items-center justify-center rounded-xl bg-white/5 hover:bg-red-500 shadow-md' : 'flex-1'}
            `}
            title="Logout"
          >
            <LogOut size={20} className={`${sidebarCollapsed && window.innerWidth >= 768 ? '' : 'group-hover:-translate-x-1'} transition-transform`} />
            {(!sidebarCollapsed || window.innerWidth < 768) && (
              <span className="text-[11px] font-black uppercase tracking-widest">Logout</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsAboutOpen(true)}
            className={`
              p-2 rounded-xl text-white/35 hover:text-white/80 hover:bg-white/5 transition-all shrink-0 cursor-pointer flex items-center justify-center
              ${sidebarCollapsed && window.innerWidth >= 768 ? 'w-10 h-10 bg-white/5' : ''}
            `}
            title="Tentang Aplikasi (About)"
          >
            <Info size={15} />
          </button>
        </div>
      </aside>

      <main className="flex-1 h-screen overflow-y-auto p-4 md:p-8 bg-gray-50">
        {isQuotaExceeded && (
          <div className="max-w-7xl mx-auto mb-4 bg-amber-500/90 backdrop-blur-sm text-white px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between text-xs font-bold animate-in slide-in-from-top-2 border border-amber-400">
            <div className="flex items-center gap-2.5">
              <Info size={18} className="shrink-0 text-amber-100" />
              <span>
                <strong>Mode Cache Lokal:</strong> Kuota egress cloud Supabase terlampaui. Menampilkan data tersimpan dari cache lokal agar aplikasi tetap berfungsi normal.
              </span>
            </div>
            <button
              onClick={() => setIsQuotaExceeded(false)}
              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-colors font-extrabold text-[10px] uppercase shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {isViewLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 min-h-[400px]">
            <div className="w-12 h-12 border-4 border-red-100 border-t-red-600 rounded-full animate-spin"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">{viewLoadingLabel}</span>
            {fetchProgressMessage && (
              <span className="text-xs font-bold text-gray-700 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 animate-in fade-in">
                {fetchProgressMessage}
              </span>
            )}
          </div>
        ) : (
          <div className="max-w-7xl mx-auto pb-20 md:pb-0">
            {activeView === 'DASHBOARD' && <Dashboard items={chillerTable} transactions={transactionTable} onNavigate={setActiveView} onFetchTransactionsRange={(s, e) => {
              setDashboardDateRange({ start: s, end: e });
              fetchTransactions(false, s, e);
            }} />}
            {activeView === 'INFLOW' && (
              isViewer ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-2xl text-center space-y-2">
                  <h3 className="text-lg font-black uppercase tracking-tight">Akses Dibatasi</h3>
                  <p className="text-xs font-medium">Akun dengan peran Viewer hanya memiliki akses melihat (Read-Only) dan tidak dapat melakukan transaksi masuk.</p>
                </div>
              ) : (
                <InflowForm onSubmitBatch={handleInflow} />
              )
            )}
            {activeView === 'INVENTORY' && <InventoryList user={user} items={currentInventory} onOut={handleOutflow} onBatchOut={handleBatchOut} onQCApprove={(id) => handleQCAction(id, 'APPROVE')} onQCReject={(id) => handleQCAction(id, 'REJECT')} onRefresh={() => fetchStock(true)} />}
            {activeView === 'REPORTS' && <Reports items={chillerTable} transactions={transactionTable} logs={logTable} users={usersList.length > 0 ? usersList : (user ? [user] : [])} user={user} />}
            {activeView === 'DAILY_REPORT' && <DailyStockReport items={chillerTable} transactions={transactionTable} user={user} onRefresh={() => fetchData(true)} />}
            {activeView === 'ITEM_DATABASE' && <ItemDatabase user={user} />}
            {activeView === 'VIRTUAL_INVENTORY' && <VirtualInventoryList />}
          </div>
        )}
      </main>

      {/* Action Processing Overlay (only during mutations) */}
      {isActionLoading && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex flex-col items-center justify-center text-white gap-3 animate-in fade-in duration-200">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span className="text-xs font-black uppercase tracking-widest">Memproses Data...</span>
        </div>
      )}

      {/* About Modal */}
      {isAboutOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-gray-100 relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Background design elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-100 rounded-full mix-blend-multiply filter blur-2xl opacity-40 transform translate-x-8 -translate-y-8"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-red-50 rounded-full mix-blend-multiply filter blur-xl opacity-30 transform -translate-x-8 translate-y-8"></div>

            <button
              onClick={() => setIsAboutOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>

            <div className="relative">
              {/* Logo / Icon */}
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-white p-1.5 rounded-xl border border-gray-100 w-11 h-11 flex items-center justify-center shadow-md shrink-0">
                  <img src="/logo2.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">BSI CMS</h3>
                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Chiller Management System</span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-4 text-xs text-gray-600 leading-relaxed">
                <p>
                  Sistem Informasi terintegrasi untuk pemantauan, pencatatan, dan analisis sediaan logistik pada gudang pendingin (chiller) secara real-time dan presisi.
                </p>

                <div className="pt-4 border-t border-gray-100">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#c01e1e] block mb-2.5">
                    DIKEMBANGKAN OLEH:
                  </span>
                  <ul className="space-y-2 text-gray-800 font-bold">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c01e1e] shrink-0" />
                      Didi Nurochman
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c01e1e] shrink-0" />
                      Habib Dwi Prajoto
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c01e1e] shrink-0" />
                      Raffly Pasya Trenadhi
                    </li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                  <span>Versi 1.0.0 (Build 2026)</span>
                  <span>© Bounty Segar Indonesia</span>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAboutOpen(false)}
                  className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer outline-none"
                >
                  Tutup Informasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
