
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  ArrowDownToLine, 
  ArrowUpFromLine, 
  ClipboardList, 
  Menu, 
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ThermometerSnowflake,
  BarChart3
} from 'lucide-react';
import { ViewState, ChillerItem, InflowSource, OutflowDestination } from './types';
import Dashboard from './components/Dashboard';
import InflowForm from './components/InflowForm';
import InventoryList from './components/InventoryList';
import Reports from './components/Reports';
import DailyStockReport from './components/DailyStockReport';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewState>('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [items, setItems] = useState<ChillerItem[]>(() => {
    const saved = localStorage.getItem('chiller_data');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('chiller_data', JSON.stringify(items));
  }, [items]);

  const generateBatchId = (prodDate: string, slaughterDate: string) => {
    const format = (d: string) => {
      const parts = d.split('-');
      return `${parts[2]}${parts[1]}${parts[0].slice(-2)}`;
    };
    const baseId = `BSI-${format(prodDate)}${format(slaughterDate)}`;
    const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${baseId}-${suffix}`;
  };

  const handleAddBatch = (newItems: Omit<ChillerItem, 'id' | 'entryTimestamp' | 'status'>[]) => {
    const entries: ChillerItem[] = newItems.map(item => ({
      ...item,
      id: generateBatchId(item.productionDate, item.slaughteringDate),
      entryTimestamp: Date.now(),
      status: 'IN_CHILLER'
    }));
    setItems(prev => [...entries, ...prev]);
    setActiveView('INVENTORY');
  };

  const handleOutItem = (id: string, destination: OutflowDestination, outPcs?: number, outKgs?: number) => {
    setItems(prev => {
      const itemIndex = prev.findIndex(item => item.id === id);
      if (itemIndex === -1) return prev;

      const item = prev[itemIndex];
      const actualOutPcs = outPcs ?? item.pcs;
      const actualOutKgs = outKgs ?? item.kgs;

      // Full Outflow
      if (actualOutPcs >= item.pcs) {
        return prev.map(it => 
          it.id === id 
            ? { ...it, status: 'OUT_CHILLER', exitTimestamp: Date.now(), destination } 
            : it
        );
      }

      // Partial Outflow: Split the batch
      // 1. Create a new record for the portion leaving
      const outflowRecord: ChillerItem = {
        ...item,
        id: `${item.id}-P${Date.now().toString().slice(-4)}`, // Unique partial ID
        pcs: actualOutPcs,
        kgs: actualOutKgs,
        status: 'OUT_CHILLER',
        exitTimestamp: Date.now(),
        destination
      };

      // 2. Update the original portion remaining in chiller
      const updatedList = prev.map(it => 
        it.id === id 
          ? { ...it, pcs: it.pcs - actualOutPcs, kgs: it.kgs - actualOutKgs } 
          : it
      );

      return [outflowRecord, ...updatedList];
    });
  };

  const handleBatchOut = (ids: string[], destination: OutflowDestination) => {
    setItems(prev => prev.map(item => 
      ids.includes(item.id)
        ? { ...item, status: 'OUT_CHILLER', exitTimestamp: Date.now(), destination }
        : item
    ));
  };

  const currentInventory = useMemo(() => 
    items.filter(item => item.status === 'IN_CHILLER'), 
  [items]);

  const navigation = [
    { name: 'Dashboard', view: 'DASHBOARD' as ViewState, icon: LayoutDashboard },
    { name: 'Input Batch', view: 'INFLOW' as ViewState, icon: ArrowDownToLine },
    { name: 'Stok Chiller', view: 'INVENTORY' as ViewState, icon: ThermometerSnowflake },
    { name: 'Mutasi Detail', view: 'REPORTS' as ViewState, icon: ClipboardList },
    { name: 'Stok Harian', view: 'DAILY_REPORT' as ViewState, icon: BarChart3 },
  ];

  const renderView = () => {
    switch (activeView) {
      case 'DASHBOARD':
        return <Dashboard items={items} onNavigate={setActiveView} />;
      case 'INFLOW':
        return <InflowForm onSubmitBatch={handleAddBatch} />;
      case 'INVENTORY':
        return <InventoryList items={currentInventory} onOut={handleOutItem} onBatchOut={handleBatchOut} />;
      case 'REPORTS':
        return <Reports items={items} />;
      case 'DAILY_REPORT':
        return <DailyStockReport items={items} />;
      default:
        return <Dashboard items={items} onNavigate={setActiveView} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-hidden bg-gray-50">
      {/* Mobile Header (Sticky) - Menu button on the right with gradient */}
      <div className={`md:hidden bg-gradient-to-r from-[#c01e1e] to-[#a51a1a] text-white p-3 flex justify-between items-center shadow-lg sticky top-0 z-40 ${sidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex items-center gap-3">
          <div className="bg-white p-1 rounded-lg shrink-0 w-9 h-9 flex items-center justify-center shadow-sm">
            <img src="/logo2.png" alt="Logo" className="max-w-full max-h-full object-contain" />
          </div>
          <div className="flex flex-col leading-none">
            <h1 className="text-[7px] font-black uppercase tracking-wider mb-0.5 opacity-80">Chiller Management System</h1>
            <h2 className="text-[12px] font-brand font-medium italic">Bounty Segar Indonesia</h2>
          </div>
        </div>
        <button onClick={() => setSidebarOpen(true)} className="p-2 transition-transform active:scale-90">
          <Menu size={24} />
        </button>
      </div>

      {/* Sidebar with Premium Vertical Gradient */}
      <aside className={`
        fixed inset-y-0 z-50 bg-gradient-to-b from-[#c01e1e] via-[#b01a1a] to-[#8b1515] text-white transition-all duration-300 transform md:static md:translate-x-0
        ${sidebarOpen ? 'translate-x-0 w-[280px] sm:w-[320px] shadow-2xl right-0' : 'translate-x-full md:translate-x-0 right-0'}
        ${sidebarCollapsed ? 'md:w-20' : 'md:w-[260px]'}
        md:left-0 md:right-auto md:block
      `}>
        <div className="h-full flex flex-col pt-0 md:pt-6">
          
          {/* Mobile Only: Drawer Header */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 mb-4 bg-black/10">
            <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
              <X size={24} />
            </button>
            <div className="flex flex-col leading-none text-right">
              <h1 className="text-[6px] font-black uppercase tracking-wider text-white/60">Bounty Segar Indonesia</h1>
              <h2 className="text-[10px] font-brand font-bold italic">Chiller System</h2>
            </div>
          </div>

          {/* Desktop Only: Collapse Toggle & Logo Section */}
          <div className="hidden md:block px-4">
            <div className="flex justify-end mb-2">
              <button 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/60"
              >
                {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>

            <div className="mb-8">
              <div className={`
                bg-white rounded-2xl shadow-lg flex items-center justify-center overflow-hidden transition-all duration-300 mx-auto
                ${sidebarCollapsed ? 'w-12 h-12 p-1.5' : 'w-full h-32 p-4'}
              `}>
                <img 
                  src="/logo2.png" 
                  alt="Bounty Segar Indonesia" 
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              
              {!sidebarCollapsed && (
                <div className="mt-5 text-center px-1">
                  <h1 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/90 leading-tight">CHILLER MANAGEMENT SYSTEM</h1>
                  <h2 className="text-[18px] font-brand font-bold italic text-white mt-1">Bounty Segar Indonesia</h2>
                </div>
              )}
            </div>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 space-y-2 px-4">
            {navigation.map((item) => (
              <button
                key={item.name}
                onClick={() => {
                  setActiveView(item.view);
                  setSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-200 group
                  ${activeView === item.view 
                    ? 'bg-white text-[#c01e1e] shadow-xl md:translate-x-1' 
                    : 'hover:bg-white/5 text-white/80'}
                  ${sidebarCollapsed ? 'md:justify-center md:px-0' : ''}
                `}
              >
                <item.icon size={20} className={`${activeView === item.view ? 'text-[#c01e1e]' : 'text-white/60 group-hover:text-white'}`} />
                {(!sidebarCollapsed || sidebarOpen) && (
                  <span className="truncate text-[11px] font-black uppercase tracking-widest text-left">
                    {item.name}
                  </span>
                )}
              </button>
            ))}
          </nav>
          
          {/* Version Footer */}
          {(!sidebarCollapsed || sidebarOpen) && (
            <div className="mt-auto pb-8 pt-4 border-t border-white/10 px-4 text-center">
              <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">OPERATIONAL EXCELLENCE</p>
              <p className="text-[8px] text-white/30 font-medium mt-0.5">v2.1.0-stable</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto overflow-x-hidden relative">
        <div className="p-4 md:p-8 lg:p-10">
          {renderView()}
        </div>
      </main>

      {/* Backdrop for mobile drawer */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[45] md:hidden backdrop-blur-sm animate-in fade-in duration-300" 
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
