
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  ArrowDownToLine, 
  ThermometerSnowflake,
  ClipboardList, 
  BarChart3,
  Menu, 
  X,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User as UserIcon
} from 'lucide-react';
import { ViewState, ChillerItem, Transaction, SystemLog, User, OutflowDestination } from './types';
import Dashboard from './components/Dashboard';
import InflowForm from './components/InflowForm';
import InventoryList from './components/InventoryList';
import Reports from './components/Reports';
import DailyStockReport from './components/DailyStockReport';
import LoginForm from './components/LoginForm';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('bsi_auth') === 'true';
  });

  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('bsi_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [activeView, setActiveView] = useState<ViewState>('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false); // Untuk Mobile Drawer (Kanan)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // Untuk Desktop/Tablet

  // Database Tables (Mock)
  const [chillerTable, setChillerTable] = useState<ChillerItem[]>(() => {
    const saved = localStorage.getItem('bsi_chiller_table');
    return saved ? JSON.parse(saved) : [];
  });
  const [transactionTable, setTransactionTable] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('bsi_transaction_table');
    return saved ? JSON.parse(saved) : [];
  });
  const [logTable, setLogTable] = useState<SystemLog[]>(() => {
    const saved = localStorage.getItem('bsi_log_table');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('bsi_chiller_table', JSON.stringify(chillerTable));
    localStorage.setItem('bsi_transaction_table', JSON.stringify(transactionTable));
    localStorage.setItem('bsi_log_table', JSON.stringify(logTable));
  }, [chillerTable, transactionTable, logTable]);

  const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  const handleLogin = (userData: User) => {
    setIsAuthenticated(true);
    setUser(userData);
    localStorage.setItem('bsi_auth', 'true');
    localStorage.setItem('bsi_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('bsi_auth');
    localStorage.removeItem('bsi_user');
  };

  const handleInflow = (newItems: Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status'>[]) => {
    if (!user) return;
    newItems.forEach(item => {
      const chillerId = generateId('CHL');
      
      const formatDateForBatch = (dateStr: string) => {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return "000000";
        const [y, m, d] = parts;
        return `${d}${m}${y.slice(-2)}`;
      };

      const uniquePart = Math.floor(Math.random() * 900 + 100).toString();
      const batchId = `BSI-${formatDateForBatch(item.productionDate)}${formatDateForBatch(item.slaughteringDate)}-${uniquePart}`;

      const newChillerEntry: ChillerItem = {
        ...item,
        id: chillerId,
        batchId,
        entryTimestamp: Date.now(),
        status: 'IN_CHILLER'
      };
      const newTransaction: Transaction = {
        id: generateId('TRX'),
        chillerId,
        userId: user.id,
        type: 'IN',
        pcs: item.pcs,
        kgs: item.kgs,
        timestamp: Date.now()
      };
      setChillerTable(prev => [newChillerEntry, ...prev]);
      setTransactionTable(prev => [newTransaction, ...prev]);
    });
    setActiveView('INVENTORY');
  };

  const handleOutflow = (chillerId: string, destination: OutflowDestination, outPcs?: number, outKgs?: number) => {
    if (!user) return;
    const item = chillerTable.find(i => i.id === chillerId);
    if (!item) return;

    const actualPcs = outPcs ?? item.pcs;
    const actualKgs = outKgs ?? item.kgs;
    const isCondem = destination === 'Condem';
    const isUserRole = user.role === 'USER';
    const trxType = (isCondem && isUserRole) ? 'QC_PENDING' : 'OUT';

    const newTransaction: Transaction = {
      id: generateId('TRX'),
      chillerId,
      userId: user.id,
      type: trxType,
      destination,
      pcs: actualPcs,
      kgs: actualKgs,
      timestamp: Date.now()
    };

    setTransactionTable(prev => [newTransaction, ...prev]);

    if (trxType === 'QC_PENDING') {
      setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, status: 'PENDING_QC' } : i));
    } else {
      if (actualPcs >= item.pcs) {
        setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, status: 'OUT_CHILLER', exitTimestamp: Date.now() } : i));
      } else {
        setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, pcs: i.pcs - actualPcs, kgs: i.kgs - actualKgs } : i));
      }
    }
  };

  const handleQCAction = (chillerId: string, action: 'APPROVE' | 'REJECT') => {
    if (!user || user.role !== 'ADMIN') return;
    const item = chillerTable.find(i => i.id === chillerId);
    if (!item) return;

    const newTransaction: Transaction = {
      id: generateId('TRX'),
      chillerId,
      userId: user.id,
      type: action === 'APPROVE' ? 'QC_APPROVED' : 'QC_REJECTED',
      pcs: item.pcs,
      kgs: item.kgs,
      timestamp: Date.now()
    };

    setTransactionTable(prev => [newTransaction, ...prev]);
    if (action === 'APPROVE') {
      setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, status: 'OUT_CHILLER', exitTimestamp: Date.now() } : i));
    } else {
      setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, status: 'IN_CHILLER' } : i));
    }
  };

  const currentInventory = useMemo(() => 
    chillerTable.filter(item => item.status === 'IN_CHILLER' || item.status === 'PENDING_QC'), 
  [chillerTable]);

  const navigation = [
    { name: 'Dashboard', view: 'DASHBOARD' as ViewState, icon: LayoutDashboard },
    { name: 'Input', view: 'INFLOW' as ViewState, icon: ArrowDownToLine },
    { name: 'Stok Chiller', view: 'INVENTORY' as ViewState, icon: ThermometerSnowflake },
    { name: 'Laporan & Log', view: 'REPORTS' as ViewState, icon: ClipboardList },
    { name: 'Stok Harian', view: 'DAILY_REPORT' as ViewState, icon: BarChart3 },
  ];

  if (!isAuthenticated) return <LoginForm onLogin={handleLogin} />;

  const NavContent = () => {
    const isCollapsed = sidebarCollapsed && !sidebarOpen;
    const showText = !isCollapsed;

    return (
      <>
        {/* Sidebar Header */}
        <div className={`flex flex-col gap-4 border-b border-white/10 ${isCollapsed ? 'p-2' : 'p-4 md:p-6'}`}>
          <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'justify-between gap-3'}`}>
            <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
              <div className="bg-white p-2 rounded-xl w-10 h-10 flex items-center justify-center shrink-0 shadow-lg">
                 <img src="/logo2.png" className="max-w-full" />
              </div>
              {showText && (
                <div className="flex flex-col leading-tight overflow-hidden">
                  <span className="text-[7px] font-black uppercase tracking-[0.2em] opacity-80 whitespace-nowrap">Chiller Management</span>
                  <span className="font-brand font-bold italic text-[14px] whitespace-nowrap leading-none mt-0.5">Bounty Segar Indonesia</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Navigation Items */}
        <nav className="flex-1 px-2 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {navigation.map(item => (
            <button 
              key={item.name} 
              onClick={() => {
                setActiveView(item.view);
                if (sidebarOpen) setSidebarOpen(false);
              }} 
              title={item.name}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${activeView === item.view ? 'bg-white text-[#c01e1e] shadow-lg font-bold' : 'hover:bg-white/10'} ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              <item.icon size={20} className="shrink-0" />
              {showText && <span className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">{item.name}</span>}
            </button>
          ))}
        </nav>

        {/* User & Logout Section */}
        <div className={`border-t border-white/10 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          <div className={`flex items-center gap-3 px-3 py-3 mb-2 rounded-xl bg-white/5 ${isCollapsed ? 'justify-center' : ''}`}>
            <UserIcon size={20} className="shrink-0" />
            {showText && (
              <div className="flex flex-col truncate">
                <span className="text-[10px] font-black uppercase tracking-tight truncate">{user?.fullName}</span>
                <span className="text-[8px] font-bold opacity-50 uppercase tracking-widest">{user?.role}</span>
              </div>
            )}
          </div>
          <button 
            onClick={handleLogout} 
            className={`w-full flex items-center gap-4 px-4 py-3 hover:bg-red-500 rounded-xl transition-all ${isCollapsed ? 'justify-center px-0' : ''}`}
          >
            <LogOut size={20} className="shrink-0" />
            {showText && <span className="text-[11px] font-black uppercase tracking-widest">Logout</span>}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 overflow-hidden">
      {/* Mobile Header (Menu Button di Kanan) */}
      <header className="md:hidden bg-[#c01e1e] text-white p-4 flex items-center justify-between shadow-md z-50">
        <div className="flex items-center gap-3">
          <img src="/logo2.png" className="w-8 h-8 bg-white p-1 rounded-lg shadow-sm" />
          <div className="flex flex-col leading-none">
            <span className="text-[6px] font-black uppercase tracking-widest opacity-80">Chiller Management</span>
            <span className="font-brand font-bold italic text-xs">Bounty Segar Indonesia</span>
          </div>
        </div>
        <button 
          onClick={() => setSidebarOpen(true)} 
          className="p-2 hover:bg-white/10 rounded-lg active:scale-90 transition-transform"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] animate-in fade-in duration-300" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar - Desktop: Left side, Mobile: Right Drawer slide-in */}
      <aside className={`
        fixed inset-y-0 z-[70] md:relative md:flex flex-col bg-[#c01e1e] text-white transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'right-0 translate-x-0 w-64 shadow-2xl' : 'right-0 translate-x-full md:left-0 md:right-auto md:translate-x-0'}
        ${sidebarCollapsed ? 'md:w-20' : 'md:w-64'}
      `}>
        {/* Tombol Collapse Desktop Melayang (Floating on edge) */}
        <button 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex absolute -right-4 top-24 w-8 h-8 bg-white text-[#c01e1e] rounded-full items-center justify-center shadow-lg border border-gray-100 hover:scale-110 active:scale-95 transition-all z-[80] group"
          title={sidebarCollapsed ? "Tampilkan Sidebar" : "Sembunyikan Sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        {/* Close Button Mobile (Top-Left of drawer) */}
        {sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(false)} 
            className="absolute top-4 left-4 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg md:hidden"
          >
            <X size={20} />
          </button>
        )}
        <NavContent />
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 h-screen overflow-y-auto p-4 md:p-8 pt-6 md:pt-8 transition-all duration-300">
        <div className="max-w-7xl mx-auto">
          {(() => {
            switch (activeView) {
              case 'DASHBOARD': return <Dashboard items={chillerTable} onNavigate={setActiveView} />;
              case 'INFLOW': return <InflowForm onSubmitBatch={handleInflow} />;
              case 'INVENTORY': return <InventoryList user={user} items={currentInventory} onOut={handleOutflow} onBatchOut={()=>{}} onQCApprove={(id)=>handleQCAction(id,'APPROVE')} onQCReject={(id)=>handleQCAction(id,'REJECT')} />;
              case 'REPORTS': return <Reports items={chillerTable} transactions={transactionTable} logs={logTable} users={[user!]} />;
              case 'DAILY_REPORT': return <DailyStockReport items={chillerTable} />;
              default: return <Dashboard items={chillerTable} onNavigate={setActiveView} />;
            }
          })()}
        </div>
      </main>
    </div>
  );
};

export default App;
