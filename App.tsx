
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

const SESSION_DURATION = 8 * 60 * 60 * 1000;

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('bsi_auth') === 'true';
  });

  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('bsi_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [activeView, setActiveView] = useState<ViewState>('DASHBOARD');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const createLog = (action: string, details: string, transactionId?: string) => {
    if (!user) return;
    const newLog: SystemLog = {
      id: generateId('LOG'),
      userId: user.id,
      transactionId,
      action,
      details,
      timestamp: Date.now()
    };
    setLogTable(prev => [newLog, ...prev]);
  };

  const handleLogin = (userData: User) => {
    setIsAuthenticated(true);
    setUser(userData);
    localStorage.setItem('bsi_auth', 'true');
    localStorage.setItem('bsi_user', JSON.stringify(userData));
    createLog('LOGIN', `User ${userData.username} logged in.`);
  };

  const handleLogout = () => {
    createLog('LOGOUT', `User ${user?.username} logged out.`);
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('bsi_auth');
    localStorage.removeItem('bsi_user');
  };

  const handleInflow = (newItems: Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status'>[]) => {
    if (!user) return;
    
    newItems.forEach(item => {
      const chillerId = generateId('CHL');
      const batchId = `BSI-${Date.now().toString().slice(-6)}`;
      
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
      createLog('INFLOW', `Batch ${batchId} entered chiller.`, newTransaction.id);
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
      createLog('OUTFLOW_REQUEST', `Request to move ${item.batchId} to Condem.`, newTransaction.id);
    } else {
      if (actualPcs >= item.pcs) {
        // Set exitTimestamp when item is completely out
        setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, status: 'OUT_CHILLER', exitTimestamp: Date.now() } : i));
      } else {
        setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, pcs: i.pcs - actualPcs, kgs: i.kgs - actualKgs } : i));
      }
      createLog('OUTFLOW', `Item ${item.batchId} exited to ${destination}.`, newTransaction.id);
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
      // Set exitTimestamp when QC approval moves item out
      setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, status: 'OUT_CHILLER', exitTimestamp: Date.now() } : i));
      createLog('QC_APPROVAL', `Admin approved Condem for ${item.batchId}`, newTransaction.id);
    } else {
      setChillerTable(prev => prev.map(i => i.id === chillerId ? { ...i, status: 'IN_CHILLER' } : i));
      createLog('QC_REJECTION', `Admin rejected Condem for ${item.batchId}`, newTransaction.id);
    }
  };

  const currentInventory = useMemo(() => 
    chillerTable.filter(item => item.status === 'IN_CHILLER' || item.status === 'PENDING_QC'), 
  [chillerTable]);

  const navigation = [
    { name: 'Dashboard', view: 'DASHBOARD' as ViewState, icon: LayoutDashboard },
    { name: 'Input Batch', view: 'INFLOW' as ViewState, icon: ArrowDownToLine },
    { name: 'Stok Chiller', view: 'INVENTORY' as ViewState, icon: ThermometerSnowflake },
    { name: 'Laporan & Log', view: 'REPORTS' as ViewState, icon: ClipboardList },
    { name: 'Stok Harian', view: 'DAILY_REPORT' as ViewState, icon: BarChart3 },
  ];

  if (!isAuthenticated) return <LoginForm onLogin={handleLogin} />;

  const renderView = () => {
    switch (activeView) {
      case 'DASHBOARD': return <Dashboard items={chillerTable} onNavigate={setActiveView} />;
      case 'INFLOW': return <InflowForm onSubmitBatch={handleInflow} />;
      case 'INVENTORY': return <InventoryList user={user} items={currentInventory} onOut={handleOutflow} onBatchOut={()=>{}} onQCApprove={(id)=>handleQCAction(id,'APPROVE')} onQCReject={(id)=>handleQCAction(id,'REJECT')} />;
      case 'REPORTS': return <Reports items={chillerTable} transactions={transactionTable} logs={logTable} users={[user!]} />;
      case 'DAILY_REPORT': return <DailyStockReport items={chillerTable} />;
      default: return <Dashboard items={chillerTable} onNavigate={setActiveView} />;
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 overflow-hidden">
      <aside className={`bg-[#c01e1e] text-white transition-all duration-300 ${sidebarCollapsed ? 'w-20' : 'w-64'} hidden md:flex flex-col`}>
        <div className="p-6 flex items-center gap-3">
          <div className="bg-white p-2 rounded-xl w-10 h-10 flex items-center justify-center">
             <img src="/logo2.png" className="max-w-full" />
          </div>
          {!sidebarCollapsed && <span className="font-brand font-bold italic text-lg">BSI CMS</span>}
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navigation.map(item => (
            <button key={item.name} onClick={() => setActiveView(item.view)} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${activeView === item.view ? 'bg-white text-[#c01e1e]' : 'hover:bg-white/10'}`}>
              <item.icon size={20} />
              {!sidebarCollapsed && <span className="text-[11px] font-black uppercase tracking-widest">{item.name}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button onClick={handleLogout} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/10 rounded-xl transition-all">
            <LogOut size={20} />
            {!sidebarCollapsed && <span className="text-[11px] font-black uppercase tracking-widest">Logout</span>}
          </button>
        </div>
      </aside>
      <main className="flex-1 h-screen overflow-y-auto p-4 md:p-8">
        {renderView()}
      </main>
    </div>
  );
};

export default App;