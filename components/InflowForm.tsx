
import React, { useState } from 'react';
import { ChillerItem, InflowSource } from '../types';
import { INFLOW_SOURCES } from '../constants';
import { 
  Save, 
  Calendar, 
  ChevronDown, 
  Package2, 
  Scale, 
  Calculator, 
  ArrowDownToLine,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  Layers,
  Zap,
  Info
} from 'lucide-react';

interface InflowFormProps {
  // Corrected Omit to exclude batchId which is generated on submission
  onSubmitBatch: (items: Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status'>[]) => void;
}

const InflowForm: React.FC<InflowFormProps> = ({ onSubmitBatch }) => {
  const [isBatchMode, setIsBatchMode] = useState(false);
  // Corrected state type to match Omit requirements
  const [draftItems, setDraftItems] = useState<Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status'>[]>([]);
  const [formData, setFormData] = useState({
    itemName: '',
    pcs: 0,
    kgs: 0,
    productionDate: new Date().toISOString().split('T')[0],
    slaughteringDate: new Date().toISOString().split('T')[0],
    source: 'FPS' as InflowSource,
    isWIP: false
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.itemName || formData.pcs <= 0 || formData.kgs <= 0) {
      alert('Mohon lengkapi data item dengan valid.');
      return;
    }

    if (isBatchMode) {
      // Form data satisfies the required fields after Omit
      setDraftItems(prev => [...prev, { ...formData }]);
      setFormData(prev => ({ ...prev, itemName: '', pcs: 0, kgs: 0, isWIP: false }));
    } else {
      onSubmitBatch([{ ...formData }]);
    }
  };

  const removeDraftItem = (index: number) => {
    setDraftItems(prev => prev.filter((_, i) => i !== index));
  };

  const submitFinalBatch = () => {
    if (draftItems.length === 0) return;
    onSubmitBatch(draftItems);
    setDraftItems([]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-bottom duration-500">
      <div className={`${isBatchMode ? 'lg:col-span-5' : 'lg:col-span-8 lg:col-start-3'} space-y-6 transition-all duration-300`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Input Barang Masuk</h2>
            <p className="text-gray-500 text-sm font-medium">Registrasi pemindahan produk ke Chiller</p>
          </div>

          <div className="inline-flex bg-gray-200 p-1 rounded-xl self-start md:self-center">
            <button
              onClick={() => setIsBatchMode(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${!isBatchMode ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Zap size={14} />
              SINGLE
            </button>
            <button
              onClick={() => setIsBatchMode(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${isBatchMode ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Layers size={14} />
              BATCH
            </button>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1 flex-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Package2 size={14} className="text-red-600" />
                  Nama Produk
                </label>
                <input
                  type="text"
                  required
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:ring-4 focus:ring-red-100 focus:border-red-600 transition-all outline-none font-bold"
                  placeholder="Ex: Paha Atas Marinasi"
                  value={formData.itemName}
                  onChange={(e) => setFormData(prev => ({ ...prev, itemName: e.target.value }))}
                />
              </div>
              <div className="pt-5">
                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-4 py-3 rounded-xl border-2 border-gray-100 select-none hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                    checked={formData.isWIP}
                    onChange={(e) => setFormData(prev => ({ ...prev, isWIP: e.target.checked }))}
                  />
                  <span className="text-xs font-black text-gray-700 uppercase">WIP</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Calculator size={14} className="text-red-600" />
                  Qty (Pcs)
                </label>
                <input
                  type="number"
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 transition-all outline-none font-bold"
                  value={formData.pcs || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, pcs: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Scale size={14} className="text-red-600" />
                  Berat (Kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 transition-all outline-none font-bold"
                  value={formData.kgs || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, kgs: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                   <Calendar size={14} className="text-red-600" />
                   Tgl Produksi
                 </label>
                 <input
                   type="date"
                   className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 outline-none font-bold"
                   value={formData.productionDate}
                   onChange={(e) => setFormData(prev => ({ ...prev, productionDate: e.target.value }))}
                 />
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                   <Calendar size={14} className="text-red-600" />
                   Tgl Potong
                 </label>
                 <input
                   type="date"
                   className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 outline-none font-bold"
                   value={formData.slaughteringDate}
                   onChange={(e) => setFormData(prev => ({ ...prev, slaughteringDate: e.target.value }))}
                 />
               </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <ArrowDownToLine size={14} className="text-red-600" />
                Sumber Barang
              </label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-red-600 outline-none font-bold cursor-pointer"
                  value={formData.source}
                  onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value as InflowSource }))}
                >
                  {INFLOW_SOURCES.map(src => <option key={src} value={src}>{src}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className={`w-full text-white font-black py-4 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 uppercase text-sm ${isBatchMode ? 'bg-orange-600 hover:bg-orange-700 shadow-orange-100' : 'bg-red-600 hover:bg-red-700 shadow-red-100'}`}
          >
            {isBatchMode ? <Plus className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {isBatchMode ? 'Tambahkan Ke Daftar Batch' : 'Simpan Langsung ke Chiller'}
          </button>
        </form>
      </div>

      {isBatchMode && (
        <div className="lg:col-span-7 flex flex-col space-y-4 animate-in slide-in-from-right duration-300">
          <div className="flex justify-between items-center">
             <h3 className="text-lg font-bold text-gray-800 uppercase flex items-center gap-3">
               Antrian Batch
               <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full">{draftItems.length}</span>
             </h3>
             {draftItems.length > 0 && (
               <button 
                  onClick={() => setDraftItems([])}
                  className="text-[10px] font-bold text-gray-400 hover:text-red-600 flex items-center gap-1 uppercase"
               >
                  <Trash2 size={12} /> Hapus Semua
               </button>
             )}
          </div>

          <div className="flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
            <div className="overflow-y-auto flex-1">
              {draftItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 p-10 text-center">
                  <Layers size={48} className="mb-4 opacity-10" />
                  <p className="font-bold text-xs uppercase tracking-widest">Daftar Kosong</p>
                  <p className="text-[10px] mt-1">Gunakan form di samping untuk mulai antrian batch.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                    <tr>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider text-right">Qty/Wght</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider">Source</th>
                      <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {draftItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] font-bold text-gray-800 leading-tight">{item.itemName}</div>
                            {item.isWIP && <span className="text-[8px] font-black bg-amber-100 text-amber-700 px-1 rounded">WIP</span>}
                          </div>
                          <div className="text-[8px] text-gray-400 font-medium">POT: {item.slaughteringDate}</div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="text-[11px] font-black text-gray-700">{item.pcs} Pcs</div>
                          <div className="text-[9px] font-bold text-gray-400">{item.kgs.toFixed(2)} Kg</div>
                        </td>
                        <td className="px-4 py-2">
                          <span className="bg-gray-100 text-gray-600 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase">{item.source}</span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => removeDraftItem(idx)} className="text-gray-300 hover:text-red-600 transition-colors">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {draftItems.length > 0 && (
              <div className="p-4 bg-red-50 border-t border-red-100">
                 <button
                  onClick={submitFinalBatch}
                  className="w-full bg-red-600 text-white font-black py-3 rounded-xl shadow-xl shadow-red-200 hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-3 uppercase text-xs"
                 >
                   <CheckCircle2 className="w-5 h-5" />
                   Konfirmasi & Simpan Batch
                 </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InflowForm;