
import { InflowSource, OutflowDestination } from './types';

export const INFLOW_SOURCES: InflowSource[] = [
  'PDS', 'FPS', 'PARTING', 'MARINASI', 'BONELESS', 'SO FRESH', 'IQF', 'RETUR', 'SMS', 'CS'
];

export const OUTFLOW_DESTINATIONS: OutflowDestination[] = [
  'Boneless', 'Parting', 'Marinasi', 'Thowing', 'FPS', 'Condem', 'CS', 'Delive', 'SMS', 'IQF', 'Retur'
];

export const APP_PRIMARY_COLOR = '#DC2626'; // Tailwind red-600
