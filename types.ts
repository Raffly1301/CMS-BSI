
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
  username: string;
  role: 'ADMIN' | 'USER';
  fullName: string;
}

export interface ChillerItem {
  id: string;
  itemName: string;
  pcs: number;
  kgs: number;
  productionDate: string;
  slaughteringDate: string;
  source: InflowSource;
  entryTimestamp: number;
  status: 'IN_CHILLER' | 'OUT_CHILLER' | 'PENDING_QC';
  exitTimestamp?: number;
  destination?: OutflowDestination;
  isWIP?: boolean;
}

export interface TransactionRecord extends ChillerItem {}

export type ViewState = 'DASHBOARD' | 'INFLOW' | 'INVENTORY' | 'REPORTS' | 'DAILY_REPORT';
