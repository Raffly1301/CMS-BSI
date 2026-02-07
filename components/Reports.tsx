
import React, { useState, useMemo } from 'react';
import { ChillerItem, Transaction, SystemLog, User } from '../types';
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
  const [tab, setTab] = useState<'TRANSACTIONS' | 'LOGS'>('TRANSACTIONS');
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Filter States
  const [filterType, setFilterType] = useState<Transaction['type'] | 'ALL'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const filteredTrx = useMemo(() => {
    return transactions.filter(t => {
      const item = items.find(i => i.id === t.chillerId);
      const matchesSearch = 
        item?.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item?.batchId.toLowerCase().includes(searchTerm.toLowerCase());
      
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
          <p className="text-sm text-gray-500 font-medium">Rekaman relasional antara transaksi dan log sistem</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button onClick={() => setTab('TRANSACTIONS')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${tab === 'TRANSACTIONS' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>TRANSAKSI</button>
          <button onClick={() => setTab('LOGS')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${tab === 'LOGS' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>LOG SISTEM</button>
        </div>
      </header>

      {/* Filter Section */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Cari Produk, Batch, atau ID..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none font-bold text-xs transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {tab === 'TRANSACTIONS' && (
            <>
              <div className="md:col-span-2 relative">
                <select 
                  className="w-full appearance-none bg-gray-50 border border-transparent rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:bg-white focus:border-red-600 cursor-pointer"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                >
                  <option value="ALL">SEMUA TIPE</option>
                  <option value="IN">MASUK (IN)</option>
                  <option value="OUT">KELUAR (OUT)</option>
                  <option value="QC_PENDING">PENDING QC</option>
                  <option value="QC_APPROVED">QC APPROVED</option>
                  <option value="QC_REJECTED">QC REJECTED</option>
                </select>
              </div>

              <div className="md:col-span-2 flex items-center gap-2">
                <Calendar size={14} className="text-red-600 shrink-0" />
                <input 
                  type="date"
                  className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-2 flex items-center gap-2">
                <span className="text-[10px] font-black text-gray-400">s/d</span>
                <input 
                  type="date"
                  className="w-full bg-gray-50 border border-transparent rounded-xl px-3 py-2 text-[10px] font-black outline-none focus:bg-white focus:border-red-600"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <button 
                  onClick={resetFilters}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl text-[10px] font-black transition-all uppercase"
                >
                  <RotateCcw size={14} /> Reset
                </button>
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
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Produk (Batch)</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipe</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">User</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Volume</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTrx.length > 0 ? (
                  filteredTrx.map(trx => {
                    const item = items.find(i => i.id === trx.chillerId);
                    return (
                      <tr key={trx.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-black text-gray-900 text-sm uppercase">{item?.itemName || 'Unknown'}</div>
                          <div className="text-[10px] font-bold text-gray-400">{item?.batchId || trx.chillerId}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[8px] font-black px-2 py-1 rounded-full uppercase ${
                            trx.type === 'IN' ? 'bg-green-100 text-green-700' : 
                            trx.type === 'OUT' ? 'bg-blue-100 text-blue-700' : 
                            trx.type === 'QC_PENDING' ? 'bg-amber-100 text-amber-700' :
                            trx.type === 'QC_APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {trx.type} {trx.destination && `→ ${trx.destination}`}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <UserIcon size={12} className="text-gray-400" />
                            <span className="text-xs font-bold text-gray-600 uppercase">ID: {trx.userId}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="text-xs font-black text-gray-800">{trx.pcs} Pcs</div>
                          <div className="text-[10px] font-bold text-gray-400">{trx.kgs.toFixed(2)} Kg</div>
                        </td>
                        <td className="px-6 py-4 text-right text-[10px] font-bold text-gray-400">
                          {new Date(trx.timestamp).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 uppercase text-[10px] font-black tracking-widest">
                      Tidak ada transaksi ditemukan
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredLogs.length > 0 ? (
              filteredLogs.map(log => (
                <div key={log.id} className="p-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    log.action.includes('QC') ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <Activity size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">{log.action}</span>
                      <span className="text-[10px] font-bold text-gray-400">{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-700 mb-1">{log.details}</p>
                    <div className="flex items-center gap-4">
                      <span className="text-[9px] font-bold text-gray-400 uppercase">User: {log.userId}</span>
                      {log.transactionId && (
                        <span className="text-[9px] font-bold text-blue-500 uppercase flex items-center gap-1">
                          <History size={10} /> Ref Trx: {log.transactionId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-gray-400 uppercase text-[10px] font-black tracking-widest">
                Tidak ada log ditemukan
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
