
import React, { useMemo } from 'react';
import { ChillerItem, ViewState, Transaction } from '../types';
import { formatNumber } from '@/utils';
import { 
  Package, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  AlertCircle,
  Clock,
  ChevronRight,
  ThermometerSnowflake
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
} from 'recharts';

interface DashboardProps {
  items: ChillerItem[];
  transactions: Transaction[];
  onNavigate: (view: ViewState) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ items, transactions, onNavigate }) => {
  const inChiller = items.filter(i => i.status === 'IN_CHILLER');
  const totalInToday = transactions.filter(t => {
    const today = new Date().toDateString();
    return t.type === 'IN' && new Date(t.timestamp).toDateString() === today;
  }).length;
  const totalOutToday = transactions.filter(t => {
    const today = new Date().toDateString();
    return t.type === 'OUT' && new Date(t.timestamp).toDateString() === today;
  }).length;

  const totalWeight = inChiller.reduce((sum, i) => sum + i.kgs, 0);

  // Grouping for real-time chart
  const chartData = useMemo(() => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const label = d.toLocaleDateString('id-ID', { weekday: 'short' });

      const dayIn = transactions.filter(t =>
        t.type === 'IN' && new Date(t.timestamp).toDateString() === dateStr
      ).length;

      const dayOut = transactions.filter(t =>
        t.type === 'OUT' && new Date(t.timestamp).toDateString() === dateStr
      ).length;

      result.push({ name: label, in: dayIn, out: dayOut });
    }
    return result;
  }, [transactions]);

  const stats = [
    { label: 'Stok Saat Ini', value: formatNumber(inChiller.length, 0), sub: `${formatNumber(totalWeight, 2)} Kgs`, icon: Package, color: 'bg-red-500' },
    { label: 'Masuk Hari Ini', value: formatNumber(totalInToday, 0), sub: 'Items', icon: ArrowDownToLine, color: 'bg-green-500' },
    { label: 'Keluar Hari Ini', value: formatNumber(totalOutToday, 0), sub: 'Items', icon: ArrowUpFromLine, color: 'bg-blue-500' },
    { label: 'Total Transaksi', value: formatNumber(transactions.length, 0), sub: 'All Time', icon: Clock, color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard Ringkasan</h2>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className={`w-12 h-12 ${stat.color} text-white rounded-xl flex items-center justify-center mb-4`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">{stat.label}</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl md:text-3xl font-black text-gray-900">{stat.value}</h3>
              <span className="text-xs font-semibold text-gray-400">{stat.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Tren Pergerakan Barang</h3>
              <p className="text-sm text-gray-500">Aktivitas masuk & keluar 7 hari terakhir (Real-time)</p>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f9fafb'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                />
                <Bar dataKey="in" fill="#DC2626" radius={[4, 4, 0, 0]} name="Masuk" />
                <Bar dataKey="out" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Keluar" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Actions / Recent Activity */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 h-full">
            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Aksi Cepat
            </h3>
            <div className="space-y-3">
              <button 
                onClick={() => onNavigate('INFLOW')}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-red-50 hover:text-red-700 rounded-2xl group transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <ArrowDownToLine className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-sm">Input Barang Baru</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100" />
              </button>
              <button 
                onClick={() => onNavigate('INVENTORY')}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-2xl group transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <ThermometerSnowflake className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-sm">Cek Stok Chiller</span>
                </div>
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
