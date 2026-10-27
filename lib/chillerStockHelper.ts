import { supabase } from './supabase';
import { isEgressQuotaError } from './cacheHelper';

// Track detected working column names in memory during runtime
let detectedChillerWipColumn: 'status_WIP' | 'status_wip' | 'none' | null = null;
let detectedOpnameWipColumn: 'status_wip' | 'status_WIP' | 'none' | null = null;
let supportsQcNotes: boolean | null = null;

export function isSchemaCacheColumnError(error: any, columnName?: string): boolean {
    if (!error) return false;
    const msg = String(error.message || '').toLowerCase();
    const details = String(error.details || '').toLowerCase();
    const hint = String(error.hint || '').toLowerCase();
    const code = String(error.code || '');

    const isGenericSchemaErr =
        code === 'PGRST204' ||
        code === '42703' ||
        msg.includes('schema cache') ||
        msg.includes('does not exist') ||
        details.includes('schema cache') ||
        details.includes('does not exist');

    if (!isGenericSchemaErr) return false;

    // If no specific column requested, any schema mismatch matches
    if (!columnName) return true;

    // Check if error message/details specifically mentions the given column
    const colLower = columnName.toLowerCase();
    return msg.includes(colLower) || details.includes(colLower) || hint.includes(colLower);
}

/**
 * Clean and format a single chiller_stock item according to detected column support
 */
function prepareChillerItem(
    item: Record<string, any>,
    wipCol: 'status_WIP' | 'status_wip' | 'none',
    includeQcNotes: boolean
) {
    const isWIP = item.isWIP ?? item.status_WIP ?? item.status_wip ?? false;
    const clone: Record<string, any> = { ...item };

    // Remove all WIP variants first
    delete clone.isWIP;
    delete clone.status_WIP;
    delete clone.status_wip;

    // Add the specific supported variant
    if (wipCol === 'status_WIP') {
        clone.status_WIP = Boolean(isWIP);
    } else if (wipCol === 'status_wip') {
        clone.status_wip = Boolean(isWIP);
    }

    if (!includeQcNotes) {
        delete clone.qc_notes;
    }

    return clone;
}

/**
 * Probe chiller_stock table schema to detect valid column names dynamically
 */
async function probeChillerSchema() {
    if (detectedChillerWipColumn !== null && supportsQcNotes !== null) return;

    try {
        const { data, error } = await supabase.from('chiller_stock').select('*').limit(1);
        if (error && isEgressQuotaError(error)) {
            console.warn('Probe chiller_stock schema hit egress quota limit. Using default column detection.');
            if (detectedChillerWipColumn === null) detectedChillerWipColumn = 'status_WIP';
            if (supportsQcNotes === null) supportsQcNotes = true;
            return;
        }
        if (data && data.length > 0) {
            const keys = Object.keys(data[0]);
            if (detectedChillerWipColumn === null) {
                if (keys.includes('status_WIP')) detectedChillerWipColumn = 'status_WIP';
                else if (keys.includes('status_wip')) detectedChillerWipColumn = 'status_wip';
                else detectedChillerWipColumn = 'none';
            }
            if (supportsQcNotes === null) {
                supportsQcNotes = keys.includes('qc_notes');
            }
        }
    } catch (e) {
        console.warn('Unable to probe chiller_stock schema:', e);
    }
}

/**
 * Resilient batch insert into `chiller_stock` with automatic schema detection
 */
export async function safeInsertChillerStock(items: Record<string, any>[]): Promise<{ success: boolean; error?: any }> {
    if (!items || items.length === 0) return { success: true };

    await probeChillerSchema();

    const wipVariants: ('status_WIP' | 'status_wip' | 'none')[] = detectedChillerWipColumn
        ? [detectedChillerWipColumn, 'none']
        : ['status_WIP', 'status_wip', 'none'];

    const qcNotesOptions = supportsQcNotes === false ? [false] : [supportsQcNotes === true ? true : true, false];

    const CHUNK_SIZE = 50;

    for (let c = 0; c < items.length; c += CHUNK_SIZE) {
        const chunk = items.slice(c, c + CHUNK_SIZE);
        let inserted = false;
        let lastError: any = null;

        for (const wipCol of wipVariants) {
            if (inserted) break;

            for (const incQc of qcNotesOptions) {
                if (inserted) break;

                const payload = chunk.map(it => prepareChillerItem(it, wipCol, incQc));
                const { error } = await supabase.from('chiller_stock').insert(payload);

                if (!error) {
                    detectedChillerWipColumn = wipCol;
                    if (incQc) supportsQcNotes = true;
                    inserted = true;
                    break;
                }

                lastError = error;

                // 1. Check if error is due to qc_notes column missing
                if (isSchemaCacheColumnError(error, 'qc_notes')) {
                    supportsQcNotes = false;
                    console.warn('chiller_stock does not have qc_notes column, retrying without it...');
                    continue; // retry inner loop with incQc = false
                }

                // 2. Check if error is due to status_WIP / status_wip column missing
                if (isSchemaCacheColumnError(error, 'status_wip') || isSchemaCacheColumnError(error, 'status_WIP')) {
                    console.warn(`Schema cache mismatch for chiller_stock WIP column '${wipCol}'. Trying fallback...`, error);
                    break; // break inner loop to try next wipCol variant
                }

                // Other non-schema error (e.g. duplicate key constraint 23505), throw immediately so caller handles retries
                throw error;
            }
        }

        if (!inserted) {
            throw lastError || new Error('Gagal menyimpan data ke chiller_stock');
        }
    }

    return { success: true };
}

/**
 * Resilient update for a single `chiller_stock` record
 */
export async function safeUpdateChillerStock(
    filter: { col: 'batch_id' | 'id'; val: string },
    updates: Record<string, any>
): Promise<{ success: boolean; error?: any }> {
    await probeChillerSchema();

    const wipVariants: ('status_WIP' | 'status_wip' | 'none')[] = detectedChillerWipColumn
        ? [detectedChillerWipColumn, 'none']
        : ['status_WIP', 'status_wip', 'none'];

    const hasQcNotes = 'qc_notes' in updates;
    const qcNotesOptions = supportsQcNotes === false || !hasQcNotes ? [false] : [true, false];

    let lastError: any = null;

    for (const wipCol of wipVariants) {
        for (const incQc of qcNotesOptions) {
            const payload = prepareChillerItem(updates, wipCol, incQc);
            const { error } = await supabase
                .from('chiller_stock')
                .update(payload)
                .eq(filter.col, filter.val);

            if (!error) {
                detectedChillerWipColumn = wipCol;
                if (incQc && hasQcNotes) supportsQcNotes = true;
                return { success: true };
            }

            lastError = error;

            if (isSchemaCacheColumnError(error, 'qc_notes')) {
                supportsQcNotes = false;
                continue;
            }

            if (isSchemaCacheColumnError(error, 'status_wip') || isSchemaCacheColumnError(error, 'status_WIP')) {
                console.warn(`Update schema cache mismatch with '${wipCol}', trying alternative...`, error);
                break;
            }

            throw error;
        }
    }

    throw lastError || new Error('Gagal memperbarui data chiller_stock');
}

/**
 * Resilient batch insert into `stock_opname` table
 */
export async function safeInsertStockOpname(rows: Record<string, any>[]): Promise<{ success: boolean; error?: any }> {
    if (!rows || rows.length === 0) return { success: true };

    if (detectedOpnameWipColumn === null) {
        try {
            const { data } = await supabase.from('stock_opname').select('*').limit(1);
            if (data && data.length > 0) {
                const keys = Object.keys(data[0]);
                if (keys.includes('status_wip')) detectedOpnameWipColumn = 'status_wip';
                else if (keys.includes('status_WIP')) detectedOpnameWipColumn = 'status_WIP';
                else detectedOpnameWipColumn = 'none';
            }
        } catch (e) {
            console.warn('Unable to probe stock_opname schema:', e);
        }
    }

    const wipVariants: ('status_wip' | 'status_WIP' | 'none')[] = detectedOpnameWipColumn
        ? [detectedOpnameWipColumn, 'none']
        : ['status_wip', 'status_WIP', 'none'];

    let lastError: any = null;

    for (const wipCol of wipVariants) {
        const formatted = rows.map(r => {
            const isWIP = r.isWIP ?? r.status_wip ?? r.status_WIP ?? false;
            const clone = { ...r };
            delete clone.isWIP;
            delete clone.status_WIP;
            delete clone.status_wip;

            if (wipCol === 'status_wip') {
                clone.status_wip = Boolean(isWIP);
            } else if (wipCol === 'status_WIP') {
                clone.status_WIP = Boolean(isWIP);
            }
            return clone;
        });

        const { error } = await supabase.from('stock_opname').insert(formatted);
        if (!error) {
            detectedOpnameWipColumn = wipCol;
            return { success: true };
        }

        lastError = error;

        if (isSchemaCacheColumnError(error, 'status_wip') || isSchemaCacheColumnError(error, 'status_WIP')) {
            console.warn(`stock_opname schema cache mismatch with '${wipCol}', trying fallback...`, error);
            continue;
        }

        throw error;
    }

    throw lastError || new Error('Gagal menyimpan data ke stock_opname');
}

/**
 * Call RPC get_chiller_stock_summary for super-fast, lightweight stock summary
 */
export async function getChillerStockSummary() {
    try {
        const { data, error } = await supabase.rpc('get_chiller_stock_summary');
        if (error) {
            console.warn("RPC get_chiller_stock_summary issue, using fallback:", error);
            return { success: false, error, data: null };
        }
        return { success: true, data };
    } catch (err) {
        console.warn("Exception in getChillerStockSummary RPC:", err);
        return { success: false, error: err, data: null };
    }
}


