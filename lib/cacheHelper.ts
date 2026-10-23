/**
 * Utility for handling Supabase Egress Quota Restrictions & Local Data Caching
 */

export function isEgressQuotaError(error: any): boolean {
    if (!error) return false;
    const msg = typeof error === 'string'
        ? error
        : String(error.message || error.details || error.hint || error.error || JSON.stringify(error)).toLowerCase();

    return (
        msg.includes('exceed_egress_quota') ||
        msg.includes('spend caps') ||
        msg.includes('restricted due to the following violations') ||
        msg.includes('exceeded egress') ||
        msg.includes('quota exceeded') ||
        msg.includes('service for this project is restricted')
    );
}

const CACHE_PREFIX = 'bsi_table_cache_';

export function saveTableCache<T = any>(tableName: string, data: T[]): void {
    try {
        if (!tableName || !Array.isArray(data)) return;
        localStorage.setItem(`${CACHE_PREFIX}${tableName}`, JSON.stringify(data));
    } catch (e) {
        console.warn(`Failed to save cache for table ${tableName}:`, e);
    }
}

export function getTableCache<T = any>(tableName: string): T[] | null {
    try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}${tableName}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
        console.warn(`Failed to read cache for table ${tableName}:`, e);
        return null;
    }
}
