
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

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('bsi_auth') === 'true';
  });

  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('bsi_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [activeView, setActiveView] = useState<ViewState>('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  const [chillerTable, setChillerTable] = useState<ChillerItem[]>([]);
  const [transactionTable, setTransactionTable] = useState<Transaction[]>([]);
  const [logTable, setLogTable] = useState<SystemLog[]>([]);

  const itemsCache = useRef<Record<string, { name: string, code: string }>>({});
  const usersCache = useRef<Record<string, string>>({});

  // Helper: fetch ALL rows from a Supabase table using pagination with specific column selections
  const fetchAllRows = useCallback(async (table: string, orderCol: string, selectCols = '*') => {
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let keepGoing = true;

    while (keepGoing) {
      let { data, error } = await supabase
        .from(table)
        .select(selectCols)
        .order(orderCol, { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error && selectCols !== '*') {
        console.warn(`Fetch error on table '${table}' with columns '${selectCols}', falling back to '*':`, error);
        const retry1 = await supabase
          .from(table)
          .select('*')
          .order(orderCol, { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        data = retry1.data;
        error = retry1.error;
      }

      if (error) {
        console.warn(`Fetch error on table '${table}' with ordering '${orderCol}', falling back to no order:`, error);
        const retry2 = await supabase
          .from(table)
          .select('*')
          .range(from, from + PAGE_SIZE - 1);
        data = retry2.data;
        error = retry2.error;
      }

      if (error) {
        console.error(`Persistent fetch error on table '${table}':`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) keepGoing = false;
      } else {
        keepGoing = false;
      }
    }
    return allData;
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      try {
        const { data: itemsData, error: itemsError } = await supabase.from('items').select('id, code, description');
        if (itemsError) {
          const { data: fallbackItems } = await supabase.from('items').select('*');
          if (fallbackItems) {
            fallbackItems.forEach(item => {
              itemsCache.current[item.id] = { name: item.description || item.name || '', code: item.code || '' };
            });
          }
        } else if (itemsData) {
          itemsData.forEach(item => {
            itemsCache.current[item.id] = { name: item.description || '', code: item.code || '' };
          });
        }
      } catch (e) {
        console.warn("Non-fatal items fetch issue:", e);
      }

      try {
        const { data: usersData, error: usersError } = await supabase.from('users').select('id, username');
        if (usersError) {
          const { data: fallbackUsers } = await supabase.from('users').select('*');
          if (fallbackUsers) {
            fallbackUsers.forEach(u => { usersCache.current[u.id] = u.username; });
          }
        } else if (usersData) {
          usersData.forEach(u => { usersCache.current[u.id] = u.username; });
        }
      } catch (e) {
        console.warn("Non-fatal users fetch issue:", e);
      }

      const [stockData, trxData] = await Promise.all([
        fetchAllRows('chiller_stock', 'created_at', 'id,batch_id,items_id,quantity_pcs,quantity_kgs,production_date,slaughtering_date,source,allocation,created_at,status,status_WIP'),
        fetchAllRows('transactions', 'transaction_time', 'id,batch_id,note,quantity_pcs,quantity_kgs,transaction_type,destination,user_id,transaction_time')
      ]);

      const mappedTrx: Transaction[] = (trxData || []).map(item => ({
        id: String(item.id),
        chillerId: String(item.batch_id || 'N/A'),
        itemCode: item.note || undefined,
        userId: usersCache.current[item.user_id] || item.user_id,
        type: (item.transaction_type || '').toUpperCase() as any,
        destination: item.destination as OutflowDestination,
        pcs: Number(item.quantity_pcs || 0),
        kgs: Number(item.quantity_kgs || 0),
        timestamp: item.transaction_time ? new Date(item.transaction_time).getTime() : Date.now()
      }));

      const mappedStock: ChillerItem[] = (stockData || []).map(item => {
        const batchId = item.batch_id;
        const lastOut = mappedTrx.find(t => t.chillerId === batchId && t.type === 'OUT');

        return {
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
          exitTimestamp: lastOut ? lastOut.timestamp : undefined,
          status: (
            item.status === 'OUT' || item.status === 'OUT_CHILLER' ? 'OUT_CHILLER' :
              item.status === 'PENDING' || item.status === 'QC_PENDING' ? 'PENDING_QC' :
                'IN_CHILLER'
          ),
          isWIP: item.status_WIP === true || item.status_WIP === 'true' || item.status_wip === true || item.status_wip === 'true'
        };
      });

      // Heal missing 'IN' transactions dynamically!
      // If a batch from chiller stock doesn't have an 'IN' transaction, reconstruct its quantity
      // based on its current stock level plus any outflows that have been executed on it.
      const synthesizedTrxs: Transaction[] = [];
      mappedStock.forEach(stockItem => {
        const hasIn = mappedTrx.some(t => t.chillerId === stockItem.batchId && t.type === 'IN');
        if (!hasIn) {
          const outTrxsForBatch = mappedTrx.filter(t => t.chillerId === stockItem.batchId && t.type === 'OUT');
          const totalOutPcs = outTrxsForBatch.reduce((sum, t) => sum + t.pcs, 0);
          const totalOutKgs = outTrxsForBatch.reduce((sum, t) => sum + t.kgs, 0);

          const reconstructedOriginalPcs = stockItem.pcs + totalOutPcs;
          const reconstructedOriginalKgs = stockItem.kgs + totalOutKgs;

          if (reconstructedOriginalPcs > 0 || reconstructedOriginalKgs > 0) {
            synthesizedTrxs.push({
              id: `SYNTH-IN-${stockItem.batchId}`,
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

      setChillerTable(mappedStock);
      setTransactionTable(finalTrx);
      setLogTable(finalTrx.map(t => ({
        id: `LOG-${t.id}`,
        userId: t.userId,
        action: t.type,
        details: `${t.type} untuk Batch ${t.chillerId} (${t.pcs} Pcs / ${t.kgs.toFixed(2)} Kg)`,
        timestamp: t.timestamp
      })));
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [fetchAllRows]);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFetchData = useCallback((silent = false) => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchData(silent);
    }, 1200);
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      const channel = supabase.channel('bsi-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chiller_stock' }, () => debouncedFetchData(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => debouncedFetchData(true))
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [isAuthenticated, fetchData, debouncedFetchData]);

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
    setIsLoading(true);
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
      try {
        const { data, error } = await supabase
          .from('chiller_stock')
          .select('batch_id')
          .like('batch_id', `BSI-${datePart}-%`);
        if (!error && data) {
          data.forEach(row => set.add(row.batch_id));
        }
      } catch (e) {
        console.error("Error fetching existing batch ids:", e);
      }
      usedBatchIdsMap.set(datePart, set);
      return set;
    };

    for (const item of newItems) {
      const formatDateForBatch = (d: string) => {
        const parts = d.split('-');
        return parts[2] + parts[1] + parts[0].slice(-2);
      };

      const pdFmt = formatDateForBatch(item.productionDate);
      const sdFmt = formatDateForBatch(item.slaughteringDate);
      const datePart = pdFmt === sdFmt ? pdFmt : `${pdFmt}${sdFmt}`;

      const existingSet = await getExistingBatchIds(datePart);
      let batchId = "";
      let attempts = 0;
      do {
        let suffix = "";
        if (attempts < 50) {
          suffix = String(Math.floor(Math.random() * 900 + 100)); // 100-999
        } else {
          suffix = String(Math.floor(Math.random() * 9000 + 1000)); // 1000-9999
        }
        batchId = `BSI-${datePart}-${suffix}`;
        attempts++;
      } while (existingSet.has(batchId) && attempts < 100);

      existingSet.add(batchId);
      const currentItemCode = itemsCache.current[item.itemsId]?.code || 'N/A';

      try {
        const { error: stockErr } = await supabase.from('chiller_stock').insert({
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
          status_WIP: item.isWIP || false
        });
        if (stockErr) throw stockErr;

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
        successCount++;
      } catch (err: any) {
        console.error("Inflow Error:", err);
        failCount++;
        lastErrorMsg = err?.message || String(err);
      }
    }

    if (failCount > 0) {
      alert(`Gagal menyimpan ${failCount} item dari total ${newItems.length} item. Error: ${lastErrorMsg}`);
    }

    await fetchData(true);
    setIsLoading(false);
    setActiveView('INVENTORY');
  };

  const handleOutflow = async (id: string, destination: OutflowDestination, outPcs?: number, outKgs?: number, skipLoading = false) => {
    if (!user) return;
    if (!skipLoading) setIsLoading(true);
    const item = chillerTable.find(i => i.id === id);
    if (!item) {
      if (!skipLoading) setIsLoading(false);
      return;
    }

    const actualPcs = outPcs ?? item.pcs;
    const actualKgs = outKgs ?? item.kgs;
    const userRole = user.role.toUpperCase();

    if (destination === 'Condem' && (userRole === 'USER' || userRole === 'ADMIN')) {
      try {
        const { error: stockErr } = await supabase.from('chiller_stock')
          .update({ status: 'PENDING' })
          .eq(item.id.includes('-') ? 'id' : 'batch_id', item.id);

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

        await fetchData(true);
      } catch (err: any) {
        console.error("Condem Request Error:", err);
        alert(`Gagal mengajukan Condem: ${err?.message || err}`);
      } finally {
        if (!skipLoading) setIsLoading(false);
      }
      return;
    }

    try {
      if (actualPcs >= item.pcs) {
        const { error: upErr } = await supabase.from('chiller_stock')
          .update({
            status: 'OUT',
            quantity_pcs: 0,
            quantity_kgs: 0
          })
          .eq(item.id.includes('-') ? 'id' : 'batch_id', item.id);
        if (upErr) throw upErr;
      } else {
        const { error: upErr } = await supabase.from('chiller_stock')
          .update({
            quantity_pcs: item.pcs - actualPcs,
            quantity_kgs: item.kgs - actualKgs
          })
          .eq(item.id.includes('-') ? 'id' : 'batch_id', item.id);
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

      // Virtual Inventory Update: If destination is NOT 'Delive' or 'Condem', add to it
      if (destination !== 'Delive' && destination !== 'Condem') {
        await updateVirtualStock(destination, item.itemsId, actualPcs, actualKgs, 'ADD');
      }

      await fetchData(true);
    } catch (err: any) {
      console.error("Outflow Error:", err);
      alert(`Gagal memproses pengeluaran stok: ${err?.message || err}`);
    } finally {
      if (!skipLoading) setIsLoading(false);
    }
  };

  const handleBatchOut = async (ids: string[], destination: OutflowDestination) => {
    if (!user) return;
    setIsLoading(true);
    let successCount = 0;
    let failCount = 0;
    let lastErrorMsg = "";

    for (const id of ids) {
      try {
        const item = chillerTable.find(i => i.id === id);
        if (!item) continue;

        const actualPcs = item.pcs;
        const actualKgs = item.kgs;

        if (destination === 'Condem' && (user.role.toUpperCase() === 'USER' || user.role.toUpperCase() === 'ADMIN')) {
          const { error: stockErr } = await supabase.from('chiller_stock')
            .update({ status: 'PENDING' })
            .eq(id.includes('-') ? 'id' : 'batch_id', id);
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
          const { error: upErr } = await supabase.from('chiller_stock')
            .update({
              status: 'OUT',
              quantity_pcs: 0,
              quantity_kgs: 0
            })
            .eq(id.includes('-') ? 'id' : 'batch_id', id);
          if (upErr) throw upErr;

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

          // Virtual Inventory Update
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

    await fetchData(true);
    setIsLoading(false);
  };

  const handleQCAction = async (id: string, action: 'APPROVE' | 'REJECT') => {
    const role = user?.role?.toUpperCase();
    if (!user || (role !== 'ADMINQC' && role !== 'SUPERADMIN')) return;
    const item = chillerTable.find(i => i.id === id);
    if (!item) return;

    setIsLoading(true);
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

      await fetchData(true);
    } catch (err: any) {
      console.error("QC Action Error:", err);
      alert(`Gagal memproses tindakan QC: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (u: User) => {
    setIsAuthenticated(true);
    setUser(u);
    localStorage.setItem('bsi_auth', 'true');
    localStorage.setItem('bsi_user', JSON.stringify(u));
    fetchData();
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('bsi_auth');
    localStorage.removeItem('bsi_user');
  };

  const currentInventory = useMemo(() =>
    chillerTable.filter(item => item.status === 'IN_CHILLER' || item.status === 'PENDING_QC'),
    [chillerTable]);

  const navigation = [
    { name: 'Dashboard', view: 'DASHBOARD' as ViewState, icon: LayoutDashboard },
    { name: 'Input', view: 'INFLOW' as ViewState, icon: ArrowDownToLine },
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
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4">
            <div className="w-12 h-12 border-4 border-red-100 border-t-red-600 rounded-full animate-spin"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Meyinkronkan Data...</span>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto pb-20 md:pb-0">
            {activeView === 'DASHBOARD' && <Dashboard items={chillerTable} transactions={transactionTable} onNavigate={setActiveView} />}
            {activeView === 'INFLOW' && <InflowForm onSubmitBatch={handleInflow} />}
            {activeView === 'INVENTORY' && <InventoryList user={user} items={currentInventory} onOut={handleOutflow} onBatchOut={handleBatchOut} onQCApprove={(id) => handleQCAction(id, 'APPROVE')} onQCReject={(id) => handleQCAction(id, 'REJECT')} onRefresh={() => fetchData(true)} />}
            {activeView === 'REPORTS' && <Reports items={chillerTable} transactions={transactionTable} logs={logTable} users={[user!]} user={user} />}
            {activeView === 'DAILY_REPORT' && <DailyStockReport items={chillerTable} transactions={transactionTable} user={user} onRefresh={() => fetchData(true)} />}
            {activeView === 'ITEM_DATABASE' && <ItemDatabase user={user} />}
            {activeView === 'VIRTUAL_INVENTORY' && <VirtualInventoryList />}
          </div>
        )}
      </main>

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
