
import React, { useState, useMemo, useRef } from 'react';
import { ChillerItem, InflowSource, OutflowDestination } from '../types';
import { INFLOW_SOURCES, OUTFLOW_DESTINATIONS } from '../constants';
import { 
  FileText, 
  Package,
  ArrowRight,
  Info,
  Table,
  Filter,
  RotateCcw,
  Search,
  Tag
} from 'lucide-react';

interface ReportsProps {
  items: ChillerItem[];
}

// Access global libraries from index.html
declare const XLSX: any;
declare const html2pdf: any;

const Reports: React.FC<ReportsProps> = ({ items }) => {
  const [filter, setFilter] = useState<'ALL' | 'IN_CHILLER' | 'OUT_CHILLER'>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  // Advanced Filters
  const [filterSource, setFilterSource] = useState<InflowSource | 'ALL'>('ALL');
  const [filterDest, setFilterDest] = useState<OutflowDestination | 'ALL'>('ALL');
  const [filterWIP, setFilterWIP] = useState<'ALL' | 'WIP' | 'REGULAR'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredItems = useMemo(() => {
    let list = items.filter(i => {
      const matchesMainStatus = filter === 'ALL' || i.status === filter;
      const matchesSearch = 
        i.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSource = filterSource === 'ALL' || i.source === filterSource;
      const matchesDest = filterDest === 'ALL' || i.destination === filterDest;
      const matchesWIP = 
        filterWIP === 'ALL' || 
        (filterWIP === 'WIP' && i.isWIP) || 
        (filterWIP === 'REGULAR' && !i.isWIP);

      // Date logic
      const entryTime = i.entryTimestamp;
      const exitTime = i.exitTimestamp;
      const filterStart = startDate ? new Date(startDate).setHours(0,0,0,0) : null;
      const filterEnd = endDate ? new Date(endDate).setHours(23,59,59,999) : null;

      let matchesDate = true;
      if (filterStart || filterEnd) {
        const relevantTime = i.status === 'OUT_CHILLER' && i.exitTimestamp ? i.exitTimestamp : i.entryTimestamp;
        if (filterStart && relevantTime < filterStart) matchesDate = false;
        if (filterEnd && relevantTime > filterEnd) matchesDate = false;
      }

      return matchesMainStatus && matchesSearch && matchesSource && matchesDest && matchesWIP && matchesDate;
    });

    return list.sort((a, b) => {
      const timeA = b.exitTimestamp || b.entryTimestamp;
      const timeB = a.exitTimestamp || a.entryTimestamp;
      return timeA - timeB;
    });
  }, [items, filter, searchTerm, filterSource, filterDest, filterWIP, startDate, endDate]);

  const resetFilters = () => {
    setFilter('ALL');
    setSearchTerm('');
    setFilterSource('ALL');
    setFilterDest('ALL');
    setFilterWIP('ALL');
    setStartDate('');
    setEndDate('');
  };

  const formatDateCompact = (ts: number | undefined) => {
    if (!ts) return '';
    const date = new Date(ts);
    return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const downloadExcel = () => {
    const headers = [
      "Batch ID", "Item Name", "Status", "WIP", "Source", "Entry Timestamp", 
      "Destination", "Exit Timestamp", "Pcs", "Kgs", 
      "Production Date", "Slaughtering Date"
    ];
    
    const rows = filteredItems.map(item => [
      item.id,
      item.itemName,
      item.status,
      item.isWIP ? "YES" : "NO",
      item.source,
      new Date(item.entryTimestamp).toLocaleString('id-ID'),
      item.destination || '-',
      item.exitTimestamp ? new Date(item.exitTimestamp).toLocaleString('id-ID') : '-',
      item.pcs,
      item.kgs.toFixed(2),
      item.productionDate,
      item.slaughteringDate
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mutasi Detail");
    
    XLSX.writeFile(workbook, `mutasi_chiller_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadPDF = () => {
    if (!reportRef.current) return;
    
    const element = reportRef.current;
    const opt = {
      margin: 10,
      filename: `mutasi_chiller_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opt).from(element).save();
  };

  const activeFilterCount = [
    filterSource !== 'ALL',
    filterDest !== 'ALL',
    filterWIP !== 'ALL',
    startDate !== '',
    endDate !== ''
  ].filter(Boolean).length;

  return (
    <div className="space-y-3 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase">Monitoring Mutasi</h2>
          <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
            {filteredItems.length} Records Ditemukan
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 action-buttons">
          <div className="flex bg-gray-200 p-0.5 rounded-lg">
            {(['ALL', 'IN_CHILLER', 'OUT_CHILLER'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`
                  px-2 py-1 rounded-md text-[8px] font-black transition-all uppercase
                  ${filter === f ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}
                `}
              >
                {f === 'ALL' ? 'Semua' : f === 'IN_CHILLER' ? 'Aktif' : 'Keluar'}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
            <input 
              type="text"
              placeholder="Cari..."
              className="pl-8 pr-2 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold outline-none focus:border-red-600 w-32 md:w-40 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-[10px] font-black transition-all ${showFilters || activeFilterCount > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}
          >
            <Filter size={10} />
            {activeFilterCount > 0 ? `(${activeFilterCount})` : 'FILTER'}
          </button>
          
          <div className="flex items-center gap-1 bg-white border border-gray-200 p-0.5 rounded-lg shadow-sm">
            <button 
              onClick={downloadPDF}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[8px] font-black text-gray-600 hover:bg-gray-50 transition-all uppercase border border-transparent hover:border-gray-100"
            >
              <FileText size={10} className="text-red-600" />
              PDF
            </button>
            <div className="w-px h-3 bg-gray-100"></div>
            <button 
              onClick={downloadExcel}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[8px] font-black text-gray-600 hover:bg-gray-50 transition-all uppercase border border-transparent hover:border-gray-100"
            >
              <Table size={10} className="text-green-600" />
              XLSX
            </button>
          </div>
        </div>
      </header>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm grid grid-cols-2 md:grid-cols-5 gap-3 animate-in slide-in-from-top-1 duration-200">
          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Asal</label>
            <select 
              className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:border-red-600"
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as any)}
            >
              <option value="ALL">SEMUA ASAL</option>
              {INFLOW_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Tujuan</label>
            <select 
              className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:border-red-600"
              value={filterDest}
              onChange={(e) => setFilterDest(e.target.value as any)}
            >
              <option value="ALL">SEMUA TUJUAN</option>
              {OUTFLOW_DESTINATIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Mulai Tgl</label>
            <input 
              type="date"
              className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Sampai Tgl</label>
            <input 
              type="date"
              className="w-full bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col justify-end">
             <div className="flex gap-1.5 items-center">
                <div className="flex-1 flex bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                  {(['ALL', 'WIP'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setFilterWIP(type === filterWIP ? 'ALL' : type)}
                      className={`flex-1 py-1 text-[8px] font-black rounded ${filterWIP === type ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={resetFilters}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Reset Filter"
                >
                  <RotateCcw size={14} />
                </button>
             </div>
          </div>
        </div>
      )}

      <div ref={reportRef} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-2 py-2 text-[8px] font-black text-gray-400 uppercase tracking-wider w-[120px]">Produk & Batch ID</th>
                <th className="px-1 py-2 text-[8px] font-black text-gray-400 uppercase tracking-wider text-center w-10">Sts</th>
                <th className="px-2 py-2 text-[8px] font-black text-gray-400 uppercase tracking-wider w-[110px]">Masuk (IN)</th>
                <th className="px-0 py-2 text-center w-4"></th>
                <th className="px-2 py-2 text-[8px] font-black text-gray-400 uppercase tracking-wider w-[100px]">Keluar (OUT)</th>
                <th className="px-2 py-2 text-[8px] font-black text-gray-400 uppercase tracking-wider text-right w-[60px]">Fisik</th>
                <th className="px-2 py-2 text-[8px] font-black text-gray-400 uppercase tracking-wider text-right">Info Tanggal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className={`shrink-0 p-0.5 rounded ${item.status === 'IN_CHILLER' ? 'text-red-600' : 'text-blue-600'}`}>
                        <Package size={10} />
                      </div>
                      <div className="truncate">
                        <div className="flex items-center gap-1">
                          <div className="text-[9px] font-black text-gray-900 truncate uppercase leading-tight">{item.itemName}</div>
                          {item.isWIP && <span className="bg-amber-100 text-amber-700 text-[6px] font-black px-1 rounded uppercase">WIP</span>}
                        </div>
                        <div className="text-[7px] font-bold text-gray-400 tracking-tighter truncate">{item.id}</div>
                      </div>
                    </div>
                  </td>

                  <td className="px-1 py-1.5 text-center">
                    <div className={`text-[7px] font-black px-0.5 rounded border leading-none py-0.5 ${item.status === 'IN_CHILLER' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-green-50 border-green-100 text-green-700'}`}>
                      {item.status === 'IN_CHILLER' ? 'IN' : 'OK'}
                    </div>
                  </td>
                  
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span className="text-[8px] font-black text-gray-700 uppercase">{item.source}</span>
                      <span className="text-[7px] text-gray-400 font-bold">{formatDateCompact(item.entryTimestamp)}</span>
                    </div>
                  </td>

                  <td className="px-0 py-1.5 text-center">
                     <ArrowRight size={8} className={item.status === 'OUT_CHILLER' ? 'text-blue-300' : 'text-gray-200'} />
                  </td>

                  <td className="px-2 py-1.5">
                    {item.status === 'OUT_CHILLER' ? (
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <span className="text-[8px] font-black text-blue-600 uppercase">{item.destination}</span>
                        <span className="text-[7px] text-gray-400 font-bold">{formatDateCompact(item.exitTimestamp)}</span>
                      </div>
                    ) : (
                      <span className="text-[7px] font-black text-gray-200 uppercase tracking-tighter italic">PENDING</span>
                    )}
                  </td>

                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <div className="text-[9px] font-black text-gray-800 leading-none">{item.pcs}P <span className="text-[7px] font-bold text-gray-400">/</span> {item.kgs.toFixed(1)}K</div>
                  </td>

                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <div className="flex flex-row justify-end gap-2 text-[7px] font-bold text-gray-400 uppercase tracking-tighter">
                      <span>PRD: {item.productionDate.split('-').slice(1).join('/')}</span>
                      <span>POT: {item.slaughteringDate.split('-').slice(1).join('/')}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredItems.length === 0 && (
          <div className="p-8 text-center bg-gray-50/50">
            <h3 className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Data Tidak Ditemukan</h3>
            <button onClick={resetFilters} className="mt-2 text-[7px] font-black text-red-600 uppercase underline">Clear All Filters</button>
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2 bg-red-50 p-2 rounded-lg border border-red-100 print:hidden">
        <Info size={12} className="text-red-600 shrink-0" />
        <p className="text-[8px] font-bold text-red-800 leading-tight">
          Pencarian mutasi mendukung filter silang antara sumber, tujuan, status WIP, dan rentang tanggal. Gunakan XLSX untuk audit mendalam.
        </p>
      </div>
    </div>
  );
};

export default Reports;
