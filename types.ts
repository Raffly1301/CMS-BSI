
export type InflowSource = 'PDS' | 'FPS' | 'PARTING' | 'MARINASI' | 'BONELESS' | 'SO FRESH' | 'IQF' | 'RETUR' | 'SMS' | 'CS';

export type OutflowDestination =
  | 'Boneless'
  | 'Parting'
  | 'Marinasi'
  | 'Thowing'
  | 'FPS'
  | 'Condem'
  | 'CS'
  | 'Delive'
  | 'SMS'
  | 'IQF'
  | 'Retur';

export interface User {
  id: string; // Key ID for Profile
  username: string;
  role: 'ADMIN' | 'USER' | 'ADMINQC' | 'SUPERADMIN' | 'VIEWER' | string;
  fullName: string;
}

export interface ChillerItem {
  id: string; // Internal database ID or PK
  batchId: string; // batch_id from DB
  itemsId: string; // items_id (UUID) from DB
  itemCode: string; // item code from items table
  itemName: string; // Display name (derived from items_id or description)
  pcs: number; // quantity_pcs
  kgs: number; // quantity_kgs
  productionDate: string; // production_date
  slaughteringDate: string; // slaughtering_date
  source: InflowSource; // source
  allocation: InflowSource; // allocation
  entryTimestamp: number; // derived from created_at
  exitTimestamp?: number;
  status: 'IN_CHILLER' | 'OUT_CHILLER' | 'PENDING_QC';
  isWIP?: boolean; // status_WIP
}

export interface Transaction {
  id: string;
  chillerId: string;
  itemCode?: string; // Menyimpan kode item secara permanen di riwayat
  userId: string;
  type: 'IN' | 'OUT' | 'QC_PENDING' | 'QC_APPROVED' | 'QC_REJECTED';
  destination?: OutflowDestination;
  pcs: number;
  kgs: number;
  timestamp: number;
}

export interface SystemLog {
  id: string;
  transactionId?: string;
  userId: string;
  action: string;
  details: string;
  timestamp: number;
}

export interface ItemMaster {
  id: string;
  code: string;
  description: string;
  category?: string;
  created_at?: string;
  is_active?: boolean;
}

export interface VirtualInventory {
  id: string;
  destination: string;
  items_id: string;
  quantity_pcs: number;
  quantity_kgs: number;
  updated_at: string;
  // Join fields
  item_name?: string;
  item_code?: string;
}

export type ViewState = 'DASHBOARD' | 'INFLOW' | 'INVENTORY' | 'REPORTS' | 'DAILY_REPORT' | 'ITEM_DATABASE' | 'VIRTUAL_INVENTORY';
