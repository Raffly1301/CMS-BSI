
export type InflowSource = 'FPS' | 'Marinasi' | 'SMS' | 'Boneless' | 'Retur' | 'Parting' | 'CS';

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
  role: 'ADMIN' | 'USER';
  fullName: string;
}

export interface ChillerItem {
  id: string; // Primary Key for Chiller table
  batchId: string; // The "BSI-XXXX" visible ID
  itemName: string;
  pcs: number;
  kgs: number;
  productionDate: string;
  slaughteringDate: string;
  source: InflowSource;
  entryTimestamp: number;
  // Added exitTimestamp to fix missing property errors in Dashboard and Reports
  exitTimestamp?: number; 
  status: 'IN_CHILLER' | 'OUT_CHILLER' | 'PENDING_QC';
  isWIP?: boolean;
}

export interface Transaction {
  id: string; // Primary Key for Transaction table
  chillerId: string; // Foreign Key to Chiller
  userId: string; // Foreign Key to Profile
  type: 'IN' | 'OUT' | 'QC_PENDING' | 'QC_APPROVED' | 'QC_REJECTED';
  destination?: OutflowDestination;
  pcs: number;
  kgs: number;
  timestamp: number;
}

export interface SystemLog {
  id: string; // Primary Key for Log table
  transactionId?: string; // Foreign Key to Transaction (Connects Log to Transaction)
  userId: string; // Who did it
  action: string;
  details: string;
  timestamp: number;
}

export type ViewState = 'DASHBOARD' | 'INFLOW' | 'INVENTORY' | 'REPORTS' | 'DAILY_REPORT';