import { supabase } from './supabase';
import { getTableCache, saveTableCache, isEgressQuotaError } from './cacheHelper';
import { ItemMaster } from '../types';

let cachedItemsList: ItemMaster[] | null = null;
let cachedItemsMap: Record<string, { name: string; code: string }> | null = null;
let cachedUsersList: { id: string; username: string; role?: string; fullName?: string }[] | null = null;
let cachedUsersMap: Record<string, string> | null = null;

let itemsFetchPromise: Promise<{ list: ItemMaster[]; map: Record<string, { name: string; code: string }> }> | null = null;
let usersFetchPromise: Promise<{ list: any[]; map: Record<string, string> }> | null = null;

/**
 * Fetch and cache master items in global memory.
 * Subsequent calls return from memory instantly (0 network calls).
 */
export async function getMasterItems(forceRefresh = false): Promise<{ list: ItemMaster[]; map: Record<string, { name: string; code: string }> }> {
  if (!forceRefresh && cachedItemsList && cachedItemsMap) {
    return { list: cachedItemsList, map: cachedItemsMap };
  }

  if (itemsFetchPromise && !forceRefresh) {
    return itemsFetchPromise;
  }

  itemsFetchPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, code, description, name, category, is_active')
        .order('code', { ascending: true });

      let rawList = data;
      if (error || !rawList) {
        if (error && isEgressQuotaError(error)) {
          console.warn('Supabase egress quota limit for items. Reading local cache.');
        }
        rawList = getTableCache('items') || [];
      } else {
        saveTableCache('items', rawList);
      }

      const map: Record<string, { name: string; code: string }> = {};
      const list: ItemMaster[] = (rawList || []).map((it: any) => {
        const idStr = String(it.id);
        const nameStr = it.description || it.name || '';
        const codeStr = it.code || '';
        map[idStr] = { name: nameStr, code: codeStr };
        return {
          id: idStr,
          code: codeStr,
          description: nameStr,
          category: it.category || '',
          is_active: it.is_active !== false
        };
      });

      cachedItemsList = list;
      cachedItemsMap = map;
      return { list, map };
    } catch (err) {
      console.warn("Error fetching master items, using local cache:", err);
      const rawList = getTableCache('items') || [];
      const map: Record<string, { name: string; code: string }> = {};
      const list: ItemMaster[] = rawList.map((it: any) => {
        const idStr = String(it.id);
        const nameStr = it.description || it.name || '';
        const codeStr = it.code || '';
        map[idStr] = { name: nameStr, code: codeStr };
        return {
          id: idStr,
          code: codeStr,
          description: nameStr,
          category: it.category || '',
          is_active: it.is_active !== false
        };
      });
      cachedItemsList = list;
      cachedItemsMap = map;
      return { list, map };
    } finally {
      itemsFetchPromise = null;
    }
  })();

  return itemsFetchPromise;
}

/**
 * Fetch and cache master users in global memory.
 * Subsequent calls return from memory instantly (0 network calls).
 */
export async function getMasterUsers(forceRefresh = false): Promise<{ list: any[]; map: Record<string, string> }> {
  if (!forceRefresh && cachedUsersList && cachedUsersMap) {
    return { list: cachedUsersList, map: cachedUsersMap };
  }

  if (usersFetchPromise && !forceRefresh) {
    return usersFetchPromise;
  }

  usersFetchPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, role, full_name');

      let rawUsers = data;
      if (error || !rawUsers) {
        if (error && isEgressQuotaError(error)) {
          console.warn('Supabase egress quota limit for users. Reading local cache.');
        }
        rawUsers = getTableCache('users') || [];
      } else {
        saveTableCache('users', rawUsers);
      }

      const map: Record<string, string> = {};
      const list = (rawUsers || []).map((u: any) => {
        const idStr = String(u.id);
        map[idStr] = u.username;
        return {
          id: idStr,
          username: u.username,
          role: u.role,
          fullName: u.full_name || u.username
        };
      });

      cachedUsersList = list;
      cachedUsersMap = map;
      return { list, map };
    } catch (err) {
      console.warn("Error fetching master users, using local cache:", err);
      const rawUsers = getTableCache('users') || [];
      const map: Record<string, string> = {};
      const list = rawUsers.map((u: any) => {
        const idStr = String(u.id);
        map[idStr] = u.username;
        return {
          id: idStr,
          username: u.username,
          role: u.role,
          fullName: u.full_name || u.username
        };
      });
      cachedUsersList = list;
      cachedUsersMap = map;
      return { list, map };
    } finally {
      usersFetchPromise = null;
    }
  })();

  return usersFetchPromise;
}

/**
 * Invalidate in-memory cache when items or users are updated.
 */
export function invalidateMasterCache() {
  cachedItemsList = null;
  cachedItemsMap = null;
  cachedUsersList = null;
  cachedUsersMap = null;
}
