
import React, { useState, useMemo } from 'react';
import { ChillerItem, Transaction, SystemLog, User } from '../types';
import { formatNumber } from '@/utils';
import {
  History,
  Search,
  ArrowRight,
  User as UserIcon,
  Activity,
  Package,
  Filter,
  RotateCcw,
  Calendar
} from 'lucide-react';

interface ReportsProps {
  items: ChillerItem[];
  transactions: Transaction[];
  logs: SystemLog[];
  users: User[];
}

const Reports: React.FC<ReportsProps> = ({ items, transactions, logs, users }) => {
  const [tab, setTab] = useState<'TRANSACTIONS' | 'LOGS' | 'STOCK_CARD' | 'ALLOCATION'>('TRANSACTIONS');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<Transaction['type'] | 'ALL'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [selectedItemCode, setSelectedItemCode] = useState<string>('');

  const itemCodes = useMemo(() => {
    return Array.from(new Set(items.map(i => i.itemCode))).sort();
  }, [items]);

  const allocationData = useMemo(() => {
    if (tab !== 'ALLOCATION') return [];

    const startOfDay = filterStartDate ? new Date(filterStartDate).setHours(0, 0, 0, 0) : 0;
    const endOfDay = filterEndDate ? new Date(filterEndDate).setHours(23, 59, 59, 999) : Infinity;

    // Group items by allocation
    const allocations = Array.from(new Set(items.map(i => i.allocation)));

    return allocations.map(alloc => {
      const batchesInAlloc = items.filter(i => i.allocation === alloc);
      const batchIds = new Set(batchesInAlloc.map(b => b.batchId));

      // Find all OUT transactions for these batches within date range
      const outTrx = transactions.filter(t =>
        t.type === 'OUT' &&
        batchIds.has(t.chillerId) &&
        t.timestamp >= startOfDay &&
        t.timestamp <= endOfDay
      );

      // Group by destination
      const destBreakdown: Record<string, { kgs: number, pcs: number }> = {};
      outTrx.forEach(t => {
        const dest = t.destination || 'Unknown';
        if (!destBreakdown[dest]) destBreakdown[dest] = { kgs: 0, pcs: 0 };
        destBreakdown[dest].kgs += t.kgs;
        destBreakdown[dest].pcs += t.pcs;
      });

      return {
        allocation: alloc,
        totalKgs: outTrx.reduce((sum, t) => sum + t.kgs, 0),
        totalPcs: outTrx.reduce((sum, t) => sum + t.pcs, 0),
        destinations: Object.entries(destBreakdown).map(([name, val]) => ({ name, ...val }))
      };
    }).filter(a => a.totalKgs > 0);
  }, [tab, items, transactions, filterStartDate, filterEndDate]);

  const stockCardData = useMemo(() => {
    if (tab !== 'STOCK_CARD' || !selectedItemCode) return [];

    // Get all transactions for this item code
    // Note: Some transactions might not have itemCode if they were from old batches, 
    // but we can try to find them via chillerId -> item batch mapping
    const batchIdsForItem = new Set(items.filter(i => i.itemCode === selectedItemCode).map(i => i.batchId));

    const relevantTrx = transactions.filter(t =>
      t.itemCode === selectedItemCode || batchIdsForItem.has(t.chillerId)
    ).sort((a, b) => a.timestamp - b.timestamp);

    let runningKgs = 0;
    let runningPcs = 0;

    return relevantTrx.map(t => {
      if (t.type === 'IN' || t.type === 'QC_REJECTED') {
        runningKgs += t.kgs;
        runningPcs += t.pcs;
      } else if (t.type === 'OUT') {
        runningKgs -= t.kgs;
        runningPcs -= t.pcs;
      }

      return {
        ...t,
        balanceKgs: runningKgs,
        balancePcs: runningPcs
      };
    });
  }, [tab, selectedItemCode, transactions, items]);

  const filteredTrx = useMemo(() => {
    return transactions.filter(t => {
      const item = items.find(i => i.batchId === t.chillerId);

      const searchStr = searchTerm.toLowerCase();
      const matchesSearch =
        (item?.itemName || '').toLowerCase().includes(searchStr) ||
        (item?.itemCode || t.itemCode || '').toLowerCase().includes(searchStr) ||
        t.id.toLowerCase().includes(searchStr) ||
        t.chillerId.toLowerCase().includes(searchStr);

      const trxDate = new Date(t.timestamp).toISOString().split('T')[0];
      const matchesStart = !filterStartDate || trxDate >= filterStartDate;
      const matchesEnd = !filterEndDate || trxDate <= filterEndDate;
      const matchesType = filterType === 'ALL' || t.type === filterType;

      return matchesSearch && matchesStart && matchesEnd && matchesType;
    });
  }, [transactions, items, searchTerm, filterType, filterStartDate, filterEndDate]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l =>
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.details.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [logs, searchTerm]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterType('ALL');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Audit Trail & Mutasi</h2>
          <p className="text-sm text-gray-500 font-medium">Rekaman riwayat pergerakan chiller</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto">
          <button onClick={() => setTab('TRANSACTIONS')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'TRANSACTIONS' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>TRANSAKSI</button>
          <button onClick={() => setTab('STOCK_CARD')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'STOCK_CARD' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>KARTU STOK</button>
          <button onClick={() => setTab('ALLOCATION')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'ALLOCATION' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>LAP. ALOKASI</button>
          <button onClick={() => setTab('LOGS')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${tab === 'LOGS' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>LOG SISTEM</button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {tab === 'TRANSACTIONS' || tab === 'LOGS' ? (
            <div className="md:col-span-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Cari Batch ID atau Produk..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          ) : tab === 'STOCK_CARD' ? (
            <div className="md:col-span-6">
              <select
                className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600"
                value={selectedItemCode}
                onChange={(e) => setSelectedItemCode(e.target.value)}
              >
                <option value="">PILIH KODE ITEM UNTUK LIHAT RIWAYAT...</option>
                {itemCodes.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="md:col-span-4 flex items-center">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filter Tanggal Alokasi:</span>
            </div>
          )}

          {(tab === 'TRANSACTIONS' || tab === 'ALLOCATION') && (
            <>
              {tab === 'TRANSACTIONS' && (
                <div className="md:col-span-2">
                  <select
                    className="w-full bg-gray-50 border border-transparent rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                  >
                    <option value="ALL">SEMUA TIPE</option>
                    <option value="IN">MASUK (IN)</option>
                    <option value="OUT">KELUAR (OUT)</option>
                    <option value="QC_APPROVED">QC APPROVED</option>
                    <option value="QC_REJECTED">QC REJECTED</option>
                  </select>
                </div>
              )}
              <div className={tab === 'ALLOCATION' ? "md:col-span-3" : "md:col-span-2"}>
                <input
                  type="date"
                  className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>
              <div className={tab === 'ALLOCATION' ? "md:col-span-3" : "md:col-span-2"}>
                <input
                  type="date"
                  className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <button onClick={resetFilters} className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl text-[10px] font-black uppercase">Reset</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {tab === 'TRANSACTIONS' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Batch ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Aktivitas</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">User</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Volume</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTrx.length > 0 ? (
                  filteredTrx.map(trx => {
                    const item = items.find(i => i.batchId === trx.chillerId);
                    return (
                      <tr key={trx.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-[10px] font-black text-red-600 uppercase tracking-tighter">{trx.chillerId}</div>
                          <div className="text-[11px] font-bold text-gray-800 uppercase">{trx.itemCode || item?.itemCode || 'Batch Selesai/Keluar'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${trx.type === 'IN' ? 'bg-green-100 text-green-700' :
                            trx.type === 'OUT' ? 'bg-blue-100 text-blue-700' :
                              trx.type.includes('APPROVED') ? 'bg-emerald-100 text-emerald-700' :
                                'bg-red-100 text-red-700'
                            }`}>
                            {trx.type.replace('_', ' ')} {trx.destination && `→ ${trx.destination}`}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <UserIcon size={12} className="text-gray-400" />
                            <span className="text-xs font-bold text-gray-600 uppercase">{trx.userId}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-xs font-black text-gray-800">{formatNumber(trx.pcs, 0)} Pcs</div>
                          <div className="text-[10px] font-bold text-gray-400">{formatNumber(trx.kgs, 2)} Kg</div>
                        </td>
                        <td className="px-6 py-4 text-right text-[10px] font-bold text-gray-400">
                          {new Date(trx.timestamp).toLocaleString('id-ID', { hour12: false })}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-black uppercase text-[10px]">Data tidak ditemukan</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : tab === 'ALLOCATION' ? (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {allocationData.length > 0 ? (
                allocationData.map((alloc, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden flex flex-col">
                    <div className="bg-red-600 p-4 text-white">
                      <h4 className="text-sm font-black uppercase tracking-widest">{alloc.allocation}</h4>
                      <p className="text-[10px] font-bold opacity-70 mt-1">Total Distribusi</p>
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4 border-b border-gray-200 pb-4">
                        <div>
                          <p className="text-[8px] font-black text-gray-400 uppercase">Total Berat</p>
                          <p className="text-sm font-black text-gray-800">{formatNumber(alloc.totalKgs, 2)} Kg</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-gray-400 uppercase">Total Qty</p>
                          <p className="text-sm font-black text-gray-800">{formatNumber(alloc.totalPcs, 0)} Pcs</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Breakdown Tujuan:</p>
                        <div className="space-y-2">
                          {alloc.destinations.map((dest, dIdx) => (
                            <div key={dIdx} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-gray-100">
                              <span className="text-[10px] font-black text-gray-700 uppercase">{dest.name}</span>
                              <div className="text-right">
                                <div className="text-[10px] font-black text-red-600">{formatNumber(dest.kgs, 2)} Kg</div>
                                <div className="text-[8px] font-bold text-gray-400">{formatNumber(dest.pcs, 0)} Pcs</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-20 text-center text-gray-400">
                  <Activity size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest">Tidak ada data distribusi untuk periode ini</p>
                </div>
              )}
            </div>
          </div>
        ) : tab === 'STOCK_CARD' ? (
          <div className="overflow-x-auto">
            {!selectedItemCode ? (
              <div className="px-6 py-20 text-center text-gray-400">
                <Package size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest">Pilih Kode Item untuk melihat riwayat pergerakan</p>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Waktu</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Batch ID</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipe</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Masuk</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Keluar</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right bg-gray-100/50">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {stockCardData.length > 0 ? (
                    stockCardData.map((trx, idx) => (
                      <tr key={trx.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-[10px] font-bold text-gray-500">
                          {new Date(trx.timestamp).toLocaleString('id-ID', { hour12: false })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[10px] font-black text-red-600 uppercase tracking-tighter">{trx.chillerId}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${trx.type === 'IN' ? 'bg-green-100 text-green-700' :
                            trx.type === 'OUT' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                            {trx.type} {trx.destination && `→ ${trx.destination}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {(trx.type === 'IN' || trx.type === 'QC_REJECTED') ? (
                            <div className="text-xs font-black text-green-600">+{formatNumber(trx.kgs, 2)} <span className="text-[8px] text-gray-400">Kg</span></div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {trx.type === 'OUT' ? (
                            <div className="text-xs font-black text-blue-600">-{formatNumber(trx.kgs, 2)} <span className="text-[8px] text-gray-400">Kg</span></div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right bg-gray-50/30">
                          <div className="text-xs font-black text-gray-900">{formatNumber(trx.balanceKgs, 2)} <span className="text-[8px] text-gray-400">Kg</span></div>
                          <div className="text-[9px] font-bold text-gray-400">{formatNumber(trx.balancePcs, 0)} Pcs</div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-black uppercase text-[10px]">Tidak ada riwayat untuk item ini</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredLogs.map(log => (
              <div key={log.id} className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Activity size={16} /></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-red-600 uppercase">{log.action}</span>
                    <span className="text-[10px] font-bold text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-700">{log.details}</p>
                  <span className="text-[9px] font-bold text-gray-400 uppercase">User: {log.userId}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
