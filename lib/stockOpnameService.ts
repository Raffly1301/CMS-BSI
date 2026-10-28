import { supabase } from './supabase';
import { safeInsertChillerStock, safeInsertStockOpname } from './chillerStockHelper';
import { StockOpnameItem, StockOpnameRecord, User, InflowSource } from '../types';
import { isEgressQuotaError, getTableCache } from './cacheHelper';

const STORAGE_KEY = 'bsi_stock_opname_history';

// Helper: load from localStorage
export const getLocalOpnameHistory = (): StockOpnameRecord[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) {
        console.error('Failed to parse local opname history:', e);
        return [];
    }
};

// Helper: save to localStorage
export const saveLocalOpnameHistory = (records: StockOpnameRecord[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
        console.error('Failed to save local opname history:', e);
    }
};

/**
 * Fetch all stock opname records.
 * Tries Supabase table `stock_opname` first; if it returns PGRST205, exceed_egress_quota,
 * or another error, it falls back seamlessly to localStorage.
 */
export const fetchStockOpnames = async (): Promise<{ records: StockOpnameRecord[]; isFromCloud: boolean }> => {
    const localRecords = getLocalOpnameHistory();

    try {
        const { data, error } = await supabase
            .from('stock_opname')
            .select('*')
            .order('opname_date', { ascending: false });

        if (error) {
            if (isEgressQuotaError(error)) {
                console.warn('Supabase egress quota restricted for stock_opname, falling back to local cache.');
            } else {
                console.warn('Supabase stock_opname query error, using localStorage fallback:', error.message);
            }
            return { records: localRecords, isFromCloud: false };
        }

        if (!data || data.length === 0) {
            return { records: localRecords, isFromCloud: true };
        }

        // Group cloud flat rows by opname_date
        const grouped: Record<string, StockOpnameRecord> = {};

        data.forEach((row: any) => {
            const dateKey = row.opname_date;
            if (!grouped[dateKey]) {
                grouped[dateKey] = {
                    id: row.opname_date,
                    opnameDate: row.opname_date,
                    items: [],
                    createdBy: row.created_by || 'User',
                    createdAt: row.created_at || new Date().toISOString(),
                    totalPcs: 0,
                    totalKgs: 0
                };
            }

            const pcs = Number(row.quantity_pcs || 0);
            const kgs = Number(row.quantity_kgs || 0);

            grouped[dateKey].items.push({
                id: row.id || `item-${Math.random()}`,
                itemsId: row.items_id || '',
                itemCode: row.item_code || 'N/A',
                itemName: row.item_name || 'N/A',
                productionDate: row.production_date || row.opname_date,
                slaughteringDate: row.slaughtering_date || row.opname_date,
                source: (row.source || 'PDS') as InflowSource,
                allocation: (row.allocation || 'PDS') as InflowSource,
                pcs,
                kgs,
                isWIP: Boolean(row.status_wip || row.status_WIP)
            });

            grouped[dateKey].totalPcs += pcs;
            grouped[dateKey].totalKgs += kgs;
        });

        const cloudRecords = Object.values(grouped).sort((a, b) => b.opnameDate.localeCompare(a.opnameDate));

        // Merge: If local has opnames that cloud doesn't have, include them
        const cloudDates = new Set(cloudRecords.map(r => r.opnameDate));
        const merged = [...cloudRecords];
        localRecords.forEach(localRec => {
            if (!cloudDates.has(localRec.opnameDate)) {
                merged.push(localRec);
            }
        });

        merged.sort((a, b) => b.opnameDate.localeCompare(a.opnameDate));
        saveLocalOpnameHistory(merged);

        return { records: merged, isFromCloud: true };
    } catch (err) {
        console.error('Failed to fetch stock opnames from Supabase:', err);
        return { records: localRecords, isFromCloud: false };
    }
};

/**
 * Get Stock Opname for a specific date (or the latest on/before that date if requested).
 */
export const getOpnameForDate = async (targetDate: string): Promise<StockOpnameRecord | null> => {
    const { records } = await fetchStockOpnames();
    const exact = records.find(r => r.opnameDate === targetDate);
    if (exact) return exact;

    // Check if any opname matches targetDate in localStorage
    const local = getLocalOpnameHistory();
    return local.find(r => r.opnameDate === targetDate) || null;
};

/**
 * Save and apply Stock Opname.
 * 1. Persists to Supabase `stock_opname` (and always caches to localStorage).
 * 2. If syncChillerStock is true, reconciles `chiller_stock`:
 *    - Updates active items (`status = 'IN'`) to archived/cleared.
 *    - Inserts the new physical recount items as active stock (`status: 'IN'`).
 *    - Records audit transactions in `transactions` with note containing `[STOCK OPNAME]`.
 */
export const saveAndApplyStockOpname = async ({
    opnameDate,
    items,
    user,
    syncChillerStock = true
}: {
    opnameDate: string;
    items: StockOpnameItem[];
    user: User;
    syncChillerStock?: boolean;
}): Promise<{ success: boolean; savedToCloud: boolean; message: string }> => {
    if (!items || items.length === 0) {
        throw new Error('Tidak ada data item untuk disimpan dalam Stock Opname.');
    }

    const totalPcs = items.reduce((sum, it) => sum + (Number(it.pcs) || 0), 0);
    const totalKgs = items.reduce((sum, it) => sum + (Number(it.kgs) || 0), 0);

    const newRecord: StockOpnameRecord = {
        id: `opn-${opnameDate}-${Date.now()}`,
        opnameDate,
        items,
        createdBy: user.fullName || user.username,
        createdAt: new Date().toISOString(),
        totalPcs,
        totalKgs
    };

    // 1. Save to LocalStorage immediately
    const existingLocal = getLocalOpnameHistory().filter(r => r.opnameDate !== opnameDate);
    const updatedLocal = [newRecord, ...existingLocal].sort((a, b) => b.opnameDate.localeCompare(a.opnameDate));
    saveLocalOpnameHistory(updatedLocal);

    let savedToCloud = false;

    // 2. Attempt save to Supabase `stock_opname` table
    try {
        // Delete previous rows for this date if overwriting
        await supabase.from('stock_opname').delete().eq('opname_date', opnameDate);

        const rowsToInsert = items.map(item => ({
            opname_date: opnameDate,
            items_id: item.itemsId || null,
            item_code: item.itemCode,
            item_name: item.itemName,
            quantity_pcs: Number(item.pcs) || 0,
            quantity_kgs: Number(item.kgs) || 0,
            production_date: item.productionDate || opnameDate,
            slaughtering_date: item.slaughteringDate || opnameDate,
            source: item.source || 'PDS',
            allocation: item.allocation || 'PDS',
            isWIP: Boolean(item.isWIP),
            created_by: user.fullName || user.username,
            created_at: new Date().toISOString()
        }));

        await safeInsertStockOpname(rowsToInsert);
        savedToCloud = true;
    } catch (cloudErr) {
        console.warn('Could not persist to Supabase stock_opname table (fallback to local):', cloudErr);
    }

    // 3. Synchronize Chiller Stock if requested
    if (syncChillerStock) {
        try {
            // Mark current active stock as cleared/reconciled by opname
            const { error: archiveError } = await supabase
                .from('chiller_stock')
                .update({
                    status: 'OUT'
                })
                .in('status', ['IN', 'IN_CHILLER', 'PENDING', 'QC_PENDING', 'APPROVED']);

            if (archiveError) {
                console.warn('Could not archive previous active chiller_stock:', archiveError);
            }

            // Filter items that have actual physical quantity (pcs > 0 or kgs > 0)
            const validItems = items.filter(it => (Number(it.pcs) > 0 || Number(it.kgs) > 0));

            // Generate unique batch IDs and insert new recount items
            const dateClean = opnameDate.replace(/-/g, '');
            const timestamp = new Date(`${opnameDate}T12:00:00Z`).toISOString();

            const newStockBatches = validItems.map((item, idx) => {
                const randId = Math.floor(1000 + Math.random() * 9000);
                const batchId = `OPN-${dateClean}-${idx + 1}-${randId}`;
                return {
                    batch_id: batchId,
                    items_id: item.itemsId && item.itemsId.trim() !== '' ? item.itemsId : null,
                    quantity_pcs: Number(item.pcs) || 0,
                    quantity_kgs: Number(item.kgs) || 0,
                    production_date: item.productionDate || opnameDate,
                    slaughtering_date: item.slaughteringDate || opnameDate,
                    status: 'IN',
                    created_by: user.id || 'system',
                    source: item.source || 'PDS',
                    allocation: item.allocation || 'PDS',
                    isWIP: Boolean(item.isWIP),
                    created_at: timestamp
                };
            });

            if (newStockBatches.length > 0) {
                // Insert resiliently (handles status_WIP / status_wip / column omit automatically)
                await safeInsertChillerStock(newStockBatches);

                // Insert transaction audit
                const CHUNK_SIZE = 50;
                for (let i = 0; i < newStockBatches.length; i += CHUNK_SIZE) {
                    const chunk = newStockBatches.slice(i, i + CHUNK_SIZE);
                    const trxChunk = chunk.map((c, idx) => {
                        const origItem = validItems[i + idx];
                        const noteText = origItem?.itemCode ? `${origItem.itemCode} [STOCK OPNAME]` : '[STOCK OPNAME]';
                        return {
                            batch_id: c.batch_id,
                            note: noteText,
                            destination: 'Chiller',
                            quantity_pcs: c.quantity_pcs,
                            quantity_kgs: c.quantity_kgs,
                            transaction_type: 'in',
                            user_id: user.id || 'system',
                            transaction_time: timestamp
                        };
                    });

                    await supabase.from('transactions').insert(trxChunk);
                }
            }

            // Update local table cache for offline / egress quota resilience
            const currentCachedStock = getTableCache('chiller_stock') || [];
            const updatedCachedStock = currentCachedStock.map((row: any) => {
                if (['IN', 'IN_CHILLER', 'PENDING', 'QC_PENDING', 'APPROVED'].includes(row.status)) {
                    return { ...row, status: 'OUT' };
                }
                return row;
            });
            const formattedNewBatchesForCache = newStockBatches.map(b => ({
                id: `local-${b.batch_id}`,
                batch_id: b.batch_id,
                items_id: b.items_id,
                quantity_pcs: b.quantity_pcs,
                quantity_kgs: b.quantity_kgs,
                production_date: b.production_date,
                slaughtering_date: b.slaughtering_date,
                status: 'IN',
                created_by: b.created_by,
                source: b.source,
                allocation: b.allocation,
                status_WIP: b.isWIP,
                status_wip: b.isWIP,
                created_at: timestamp
            }));
            saveTableCache('chiller_stock', [...formattedNewBatchesForCache, ...updatedCachedStock]);

            const currentCachedTrx = getTableCache('transactions') || [];
            const formattedNewTrxForCache = newStockBatches.map((c, idx) => {
                const origItem = validItems[idx];
                return {
                    id: `trx-${c.batch_id}`,
                    batch_id: c.batch_id,
                    note: origItem?.itemCode ? `${origItem.itemCode} [STOCK OPNAME]` : '[STOCK OPNAME]',
                    destination: 'Chiller',
                    quantity_pcs: c.quantity_pcs,
                    quantity_kgs: c.quantity_kgs,
                    transaction_type: 'in',
                    user_id: user.id || 'system',
                    transaction_time: timestamp
                };
            });
            saveTableCache('transactions', [...formattedNewTrxForCache, ...currentCachedTrx]);
        } catch (syncErr: any) {
            console.error('Failed to sync chiller stock with opname:', syncErr);
            throw new Error(`Stock Opname disimpan, namun gagal menyelaraskan Stok Chiller: ${syncErr.message || syncErr}`);
        }
    }

    return {
        success: true,
        savedToCloud,
        message: savedToCloud
            ? `Stock Opname tanggal ${opnameDate} berhasil disimpan ke Database Supabase & Stok Chiller diselaraskan!`
            : `Stock Opname tanggal ${opnameDate} berhasil diterapkan & disimpan lokal (Stok Chiller telah diperbarui).`
    };
};

/**
 * Delete a stock opname record.
 */
export const deleteStockOpname = async (opnameDate: string): Promise<boolean> => {
    // Delete from local
    const current = getLocalOpnameHistory().filter(r => r.opnameDate !== opnameDate);
    saveLocalOpnameHistory(current);

    // Attempt delete from Supabase
    try {
        await supabase.from('stock_opname').delete().eq('opname_date', opnameDate);
    } catch (e) {
        console.warn('Failed to delete opname from Supabase:', e);
    }

    return true;
};
