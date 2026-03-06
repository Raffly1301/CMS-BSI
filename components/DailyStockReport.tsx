
import React, { useState, useMemo, useRef } from 'react';
import { ChillerItem, Transaction } from '../types';
import { formatNumber } from '@/utils';
import { 
  Calendar, 
  FileText,
  Table as TableIcon,
  Info,
  ChevronDown,
  ChevronRight,
  Search,
  Hash
} from 'lucide-react';

interface DailyStockReportProps {
  items: ChillerItem[];
  transactions: Transaction[];
}

// Access global libraries from index.html
declare const XLSX: any;
declare const html2pdf: any;

interface StockRow {
  name: string;
  openingKgs: number;
  openingPcs: number;
  inKgs: number;
  inPcs: number;
  outKgs: number;
  outPcs: number;
  endingKgs: number;
  endingPcs: number;
  isWIPGroup?: boolean;
}

const DailyStockReport: React.FC<DailyStockReportProps> = ({ items, transactions }) => {
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [unit, setUnit] = useState<'KGS' | 'PCS'>('KGS');
  const [searchTerm, setSearchTerm] = useState('');
  const [isWIPExpanded, setIsWIPExpanded] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const reportData = useMemo(() => {
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);

    const itemCodes: string[] = Array.from(new Set(items.map(i => i.itemCode)));
    const rows: StockRow[] = [];

    const processGroup = (filterFn: (item: ChillerItem) => boolean, label: string, isWIPGroup = false) => {
      const groupItems = items.filter(filterFn);
      const groupBatchIds = new Set(groupItems.map(i => i.batchId));
      
      const groupTrx = transactions.filter(t => groupBatchIds.has(t.chillerId));
      const sumT = (arr: Transaction[], key: 'kgs' | 'pcs') => arr.reduce((acc, curr) => acc + (curr[key] || 0), 0);

      // Opening Stock: (Total IN before range) - (Total OUT before range)
      const beforeInK = sumT(groupTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'kgs');
      const beforeOutK = sumT(groupTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'kgs');
      const openingKgs = beforeInK - beforeOutK;

      const beforeInP = sumT(groupTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'pcs');
      const beforeOutP = sumT(groupTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'pcs');
      const openingPcs = beforeInP - beforeOutP;

      // Movements during the range
      const dayInTrx = groupTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange);
      const dayOutTrx = groupTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange);

      const inKgs = sumT(dayInTrx, 'kgs');
      const inPcs = sumT(dayInTrx, 'pcs');
      const outKgs = sumT(dayOutTrx, 'kgs');
      const outPcs = sumT(dayOutTrx, 'pcs');

      // Ending Stock
      const endingKgs = openingKgs + inKgs - outKgs;
      const endingPcs = openingPcs + inPcs - outPcs;

      return {
        name: label,
        openingKgs,
        openingPcs,
        inKgs,
        inPcs,
        outKgs,
        outPcs,
        endingKgs,
        endingPcs,
        isWIPGroup
      };
    };

    // Add WIP Overall Row
    const wipRow = processGroup(i => !!i.isWIP, 'TOTAL WIP', true);
    if (wipRow.openingKgs > 0 || wipRow.inKgs > 0 || wipRow.outKgs > 0 || wipRow.openingPcs > 0 || wipRow.inPcs > 0 || wipRow.outPcs > 0) {
      rows.push(wipRow);
    }

    // Add Individual Items Row (Non-WIP)
    itemCodes.forEach((code: string) => {
      const row = processGroup(i => i.itemCode === code && !i.isWIP, code);
      if (row.openingKgs > 0 || row.inKgs > 0 || row.outKgs > 0 || row.openingPcs > 0 || row.inPcs > 0 || row.outPcs > 0) {
        rows.push(row);
      }
    });

    return rows;
  }, [items, startDate, endDate]);

  // Secondary useMemo to get WIP batch breakdown when expanded
  const wipBreakdown = useMemo(() => {
    if (!isWIPExpanded) return [];
    
    const startRange = new Date(startDate).setHours(0, 0, 0, 0);
    const endRange = new Date(endDate).setHours(23, 59, 59, 999);
    
    const wipItems = items.filter(i => !!i.isWIP);
    
    return wipItems.filter(i => {
        const batchTrx = transactions.filter(t => t.chillerId === i.batchId);
        const sumT = (arr: Transaction[], key: 'kgs' | 'pcs') => arr.reduce((acc, curr) => acc + (curr[key] || 0), 0);

        const beforeIn = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'kgs');
        const beforeOut = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'kgs');
        const opening = beforeIn - beforeOut;

        const dayIn = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange), 'kgs');
        const dayOut = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange), 'kgs');

        return opening > 0 || dayIn > 0 || dayOut > 0;
    });
  }, [items, transactions, startDate, endDate, isWIPExpanded]);

  const filteredData = reportData.filter(row => 
    row.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const downloadExcel = () => {
    const headers = ["Item", `Opening Stock (${unit})`, `In (${unit})`, `Out (${unit})`, `Ending Stock (${unit})` ];
    const rows = filteredData.map(r => [
      r.name,
      unit === 'KGS' ? r.openingKgs.toFixed(2) : r.openingPcs,
      unit === 'KGS' ? r.inKgs.toFixed(2) : r.inPcs,
      unit === 'KGS' ? r.outKgs.toFixed(2) : r.outPcs,
      unit === 'KGS' ? r.endingKgs.toFixed(2) : r.endingPcs,
    ]);

    const dateLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
    const worksheet = XLSX.utils.aoa_to_sheet([["LAPORAN STOK HARIAN", dateLabel], [], headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Stock");
    XLSX.writeFile(workbook, `laporan_stok_${dateLabel}.xlsx`);
  };

  const downloadPDF = () => {
    const element = document.getElementById('report-export-area');
    if (!element) return;

    const dateLabel = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
    const opt = {
      margin: 10,
      filename: `laporan_stok_harian_${dateLabel}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Laporan Stok Harian</h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
            Rekapitulasi Pergerakan Barang
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 action-buttons">
          <div className="flex items-center gap-1 bg-white border border-gray-200 p-1 rounded-xl shadow-sm">
            <button onClick={downloadPDF} className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-red-600" title="Download PDF">
              <FileText size={18} />
            </button>
            <div className="w-px h-4 bg-gray-100 mx-1"></div>
            <button onClick={downloadExcel} className="p-2 hover:bg-gray-50 rounded-lg transition-colors text-green-600" title="Download Excel">
              <TableIcon size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5 lg:col-span-1">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
            <Calendar size={12} className="text-red-600" /> Tanggal Laporan
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input 
              type="date"
              className="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none transition-all font-bold text-[10px] text-gray-700"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Dari Tanggal"
            />
            <input 
              type="date"
              className="w-full px-3 py-2 bg-gray-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none transition-all font-bold text-[10px] text-gray-700"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="Sampai Tanggal"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
            <Search size={12} className="text-red-600" /> Cari Item
          </label>
          <div className="relative group">
            <input 
              type="text" 
              placeholder="Cari deskripsi item..."
              className="w-full px-4 py-2.5 bg-gray-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-red-600 outline-none transition-all font-bold text-xs text-gray-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Hash size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
            <Info size={12} className="text-red-600" /> Satuan Tampilan
          </label>
          <div className="flex bg-gray-100 p-1 rounded-xl h-[42px]">
            {(['KGS', 'PCS'] as const).map(u => (
              <button
                key={u}
                onClick={() => setUnit(u)}
                className={`flex-1 rounded-lg text-[10px] font-black transition-all ${unit === u ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden" ref={reportRef}>
        <div className="p-4 border-b border-gray-50 flex items-center justify-between gap-4 print:hidden bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">
              Periode: {startDate === endDate 
                ? new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                : `${new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
              }
            </span>
          </div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest hidden md:block">
            Menampilkan <span className="text-red-600">{filteredData.length}</span> Baris
          </div>
        </div>

        <div id="report-export-area" className="p-2 md:p-4 bg-white">
          <div className="hidden print:block mb-6 border-b-2 border-red-600 pb-4">
             <div className="flex justify-between items-end">
                <div>
                   <h1 className="text-xl font-black text-gray-900 uppercase">Laporan Stok Harian Chiller</h1>
                   <p className="text-xs font-bold text-gray-500 uppercase">Bounty Segar Indonesia</p>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-black text-gray-400 uppercase">Periode Laporan</p>
                   <p className="text-xs font-bold text-gray-900">
                     {startDate === endDate 
                       ? new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                       : `${new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
                     }
                   </p>
                </div>
             </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider w-[240px]">Kode Item</th>
                  <th className="px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right">Opening Stock</th>
                  <th className="px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right text-green-600">In</th>
                  <th className="px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right text-blue-600">Out</th>
                  <th className="px-6 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right bg-red-50/30">Ending Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredData.map((row, idx) => {
                  const isWIPRow = row.isWIPGroup;
                  return (
                    <React.Fragment key={idx}>
                      <tr 
                        onClick={() => isWIPRow && setIsWIPExpanded(!isWIPExpanded)}
                        className={`
                          hover:bg-gray-50 transition-colors 
                          ${isWIPRow ? 'bg-amber-50/40 cursor-pointer group' : ''}
                        `}
                      >
                        <td className="px-6 py-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-1 h-6 rounded-full ${isWIPRow ? 'bg-amber-500' : 'bg-red-500'}`} />
                            <div className="leading-tight">
                              <div className={`text-[11px] font-black uppercase flex items-center gap-2 ${isWIPRow ? 'text-amber-800' : 'text-gray-900'}`}>
                                {isWIPRow && (isWIPExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
                                {row.name}
                              </div>
                              {isWIPRow && <div className="text-[8px] font-bold text-amber-600 tracking-tight uppercase leading-none mt-0.5">Klik untuk detail barang WIP</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right"><span className="text-[11px] font-bold text-gray-600">{unit === 'KGS' ? formatNumber(row.openingKgs, 2) : formatNumber(row.openingPcs, 0)}</span></td>
                        <td className="px-4 py-2 text-right"><span className="text-[11px] font-black text-green-600">{unit === 'KGS' ? formatNumber(row.inKgs, 2) : formatNumber(row.inPcs, 0)}</span></td>
                        <td className="px-4 py-2 text-right"><span className="text-[11px] font-black text-blue-600">{unit === 'KGS' ? formatNumber(row.outKgs, 2) : formatNumber(row.outPcs, 0)}</span></td>
                        <td className="px-6 py-2 text-right bg-red-50/10"><span className="text-[11px] font-black text-red-700">{unit === 'KGS' ? formatNumber(row.endingKgs, 2) : formatNumber(row.endingPcs, 0)}</span></td>
                      </tr>

                      {isWIPRow && isWIPExpanded && wipBreakdown.map((batch, bIdx) => {
                        const startRange = new Date(startDate).setHours(0, 0, 0, 0);
                        const endRange = new Date(endDate).setHours(23, 59, 59, 999);
                        
                        const batchTrx = transactions.filter(t => t.chillerId === batch.batchId);
                        const sumT = (arr: Transaction[], key: 'kgs' | 'pcs') => arr.reduce((acc, curr) => acc + (curr[key] || 0), 0);

                        const opK = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'kgs') - sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'kgs');
                        const opP = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp < startRange), 'pcs') - sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp < startRange), 'pcs');
                        
                        const inK = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange), 'kgs');
                        const inP = sumT(batchTrx.filter(t => t.type === 'IN' && t.timestamp >= startRange && t.timestamp <= endRange), 'pcs');
                        
                        const outK = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange), 'kgs');
                        const outP = sumT(batchTrx.filter(t => t.type === 'OUT' && t.timestamp >= startRange && t.timestamp <= endRange), 'pcs');
                        
                        const edK = opK + inK - outK;
                        const edP = opP + inP - outP;

                        return (
                          <tr key={`wip-batch-${bIdx}`} className="bg-amber-50/10 animate-in slide-in-from-top-1 duration-200">
                            <td className="px-6 py-1.5 pl-12 border-l-2 border-amber-400">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-black text-amber-800 uppercase flex items-center gap-1"><Hash size={10} /> {batch.batchId}</span>
                                <span className="text-[8px] font-bold text-gray-500 uppercase">{batch.itemCode}</span>
                              </div>
                            </td>
                            <td className="px-4 py-1.5 text-right"><span className="text-[10px] font-medium text-gray-500">{unit === 'KGS' ? formatNumber(opK, 2) : formatNumber(opP, 0)}</span></td>
                            <td className="px-4 py-1.5 text-right"><span className="text-[10px] font-bold text-green-500">{unit === 'KGS' ? formatNumber(inK, 2) : formatNumber(inP, 0)}</span></td>
                            <td className="px-4 py-1.5 text-right"><span className="text-[10px] font-bold text-blue-500">{unit === 'KGS' ? formatNumber(outK, 2) : formatNumber(outP, 0)}</span></td>
                            <td className="px-6 py-1.5 text-right bg-red-50/5"><span className="text-[10px] font-black text-red-500/70">{unit === 'KGS' ? formatNumber(edK, 2) : formatNumber(edP, 0)}</span></td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {filteredData.length > 0 && (
                <tfoot className="bg-gray-900 text-white">
                  <tr>
                    <td className="px-6 py-2 text-[10px] font-black uppercase">Grand Total ({unit})</td>
                    <td className="px-4 py-2 text-right text-[11px] font-black">
                      {unit === 'KGS' ? formatNumber(filteredData.reduce((a,b) => a + b.openingKgs, 0), 2) : formatNumber(filteredData.reduce((a,b) => a + b.openingPcs, 0), 0)}
                    </td>
                    <td className="px-4 py-2 text-right text-[11px] font-black text-green-400">
                      {unit === 'KGS' ? formatNumber(filteredData.reduce((a,b) => a + b.inKgs, 0), 2) : formatNumber(filteredData.reduce((a,b) => a + b.inPcs, 0), 0)}
                    </td>
                    <td className="px-4 py-2 text-right text-[11px] font-black text-blue-400">
                      {unit === 'KGS' ? formatNumber(filteredData.reduce((a,b) => a + b.outKgs, 0), 2) : formatNumber(filteredData.reduce((a,b) => a + b.outPcs, 0), 0)}
                    </td>
                    <td className="px-6 py-2 text-right text-[11px] font-black text-red-400">
                      {unit === 'KGS' ? formatNumber(filteredData.reduce((a,b) => a + b.endingKgs, 0), 2) : formatNumber(filteredData.reduce((a,b) => a + b.endingPcs, 0), 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          
          <div className="hidden print:block mt-12">
             <div className="flex justify-between">
                <div className="text-center w-40 border-t border-gray-300 pt-2">
                   <p className="text-[10px] font-black uppercase text-gray-400">Dibuat Oleh</p>
                   <div className="h-16"></div>
                   <p className="text-xs font-bold text-gray-900">( .................... )</p>
                </div>
                <div className="text-center w-40 border-t border-gray-300 pt-2">
                   <p className="text-[10px] font-black uppercase text-gray-400">Disetujui Oleh</p>
                   <div className="h-16"></div>
                   <p className="text-xs font-bold text-gray-900">( .................... )</p>
                </div>
             </div>
          </div>
        </div>
        
        {filteredData.length === 0 && (
          <div className="p-20 text-center">
            <Info className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Tidak Ada Data Untuk Tanggal Ini</h3>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyStockReport;
