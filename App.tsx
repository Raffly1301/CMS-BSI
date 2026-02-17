
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
import { supabase } from './lib/supabase';

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
  const [isLoading, setIsLoading] = useState(true);

  const [chillerTable, setChillerTable] = useState<ChillerItem[]>([]);
  const [transactionTable, setTransactionTable] = useState<Transaction[]>([]);
  const [logTable, setLogTable] = useState<SystemLog[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Items for client-side lookup
      const { data: itemsData } = await supabase.from('items').select('id, code, description');
      const itemsLookup: Record<string, string> = {};
      const itemsCodeLookup: Record<string, string> = {};
      if (itemsData) {
        itemsData.forEach(item => { 
          itemsLookup[item.id] = item.description; 
          itemsCodeLookup[item.id] = item.code;
        });
      }

      // 2. Fetch Users for resolving UUIDs to usernames in UI
      const { data: usersData } = await supabase.from('users').select('id, username');
      const usersLookup: Record<string, string> = {};
      if (usersData) usersData.forEach(u => { usersLookup[u.id] = u.username; });

      // 3. Fetch Chiller Stock
      const { data: stockData, error: stockError } = await supabase
        .from('chiller_stock')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (stockError) throw stockError;
      
      const mappedStock: ChillerItem[] = (stockData || []).map(item => ({
        id: String(item.batch_id),
        batchId: item.batch_id,
        itemsId: item.items_id,
        itemCode: itemsCodeLookup[item.items_id] || 'N/A',
        itemName: itemsLookup[item.items_id] || item.items_id,
        pcs: Number(item.quantity_pcs),
        kgs: Number(item.quantity_kgs),
        productionDate: item.production_date,
        slaughteringDate: item.slaughtering_date,
        source: item.source || 'FPS',
        entryTimestamp: new Date(item.created_at).getTime(),
        status: (
          item.status === 'OUT' || item.status === 'OUT_CHILLER' ? 'OUT_CHILLER' : 
          item.status === 'PENDING' || item.status === 'QC_PENDING' ? 'PENDING_QC' : 
          'IN_CHILLER'
        ),
        isWIP: item.status_WIP === true || item.status_WIP === 'true'
      }));

      // 4. Fetch Transactions
      const { data: trxData, error: trxError } = await supabase
        .from('transactions')
        .select('*')
        .order('transaction_time', { ascending: false });
      
      if (trxError) throw trxError;

      const mappedTrx: Transaction[] = (trxData || []).map(item => ({
        id: String(item.id || Math.random()),
        chillerId: String(item.batch_id || item.note || 'N/A'),
        userId: usersLookup[item.user_id] || item.user_id,
        type: item.transaction_type as any,
        destination: item.destination as OutflowDestination,
        pcs: Number(item.quantity_pcs),
        kgs: Number(item.quantity_kgs),
        timestamp: new Date(item.transaction_time).getTime()
      }));

      setChillerTable(mappedStock);
      setTransactionTable(mappedTrx);
      
      setLogTable(mappedTrx.map(t => ({
        id: `LOG-${t.id}`,
        userId: t.userId,
        action: t.type,
        details: `Transaksi ${t.type} untuk Batch ${t.chillerId} ke ${t.destination || 'Chiller'}`,
        timestamp: t.timestamp
      })));
    } catch (err) {
      console.error("Supabase Sync Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (userData: User) => {
    setIsAuthenticated(true);
    setUser(userData);
    localStorage.setItem('bsi_auth', 'true');
    localStorage.setItem('bsi_user', JSON.stringify(userData));
    fetchData();
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('bsi_auth');
    localStorage.removeItem('bsi_user');
  };

  const handleInflow = async (newItems: Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status' | 'itemCode'>[]) => {
    if (!user) return;
    
    for (const item of newItems) {
      const formatDateForBatch = (dateStr: string) => {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return "000000";
        const [y, m, d] = parts;
        return `${d}${m}${y.slice(-2)}`;
      };

      const uniquePart = Math.floor(Math.random() * 900 + 100).toString();
      const batchId = `BSI-${formatDateForBatch(item.productionDate)}${formatDateForBatch(item.slaughteringDate)}-${uniquePart}`;

      try {
        const payload = {
          batch_id: batchId,
          items_id: item.itemsId, 
          quantity_pcs: item.pcs,
          quantity_kgs: item.kgs,
          production_date: item.productionDate,
          slaughtering_date: item.slaughteringDate,
          status: 'IN',
          created_by: user.id, 
          source: item.source,
          status_WIP: item.isWIP || false
        };

        const { error: stockError } = await supabase
          .from('chiller_stock')
          .insert(payload);

        if (stockError) throw stockError;

        await supabase.from('transactions').insert({
          destination: 'Chiller',
          quantity_pcs: item.pcs,
          quantity_kgs: item.kgs,
          transaction_type: 'IN',
          user_id: user.id,
          transaction_time: new Date().toISOString(),
          note: batchId
        });

      } catch (err) {
        console.error("Supabase Insert Error:", err);
        const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
        if (errorMsg.includes('status_check')) {
           alert("DATABASE ERROR: Constraint 'status' di database memblokir nilai 'IN'. Harap jalankan SQL Fix di Supabase Editor.");
        } else {
           alert(`Gagal menyimpan data. Detail: ${errorMsg}`);
        }
      }
    }
    fetchData();
    setActiveView('INVENTORY');
  };

  const handleOutflow = async (batchId: string, destination: OutflowDestination, outPcs?: number, outKgs?: number) => {
    if (!user) return;
    const item = chillerTable.find(i => i.batchId === batchId);
    if (!item) return;

    const actualPcs = outPcs ?? item.pcs;
    const actualKgs = outKgs ?? item.kgs;

    try {
      await supabase.from('transactions').insert({
        destination: destination,
        quantity_pcs: actualPcs,
        quantity_kgs: actualKgs,
        transaction_type: 'OUT',
        user_id: user.id,
        transaction_time: new Date().toISOString(),
        note: batchId
      });

      if (actualPcs >= item.pcs) {
        await supabase.from('chiller_stock').delete().eq('batch_id', batchId);
      } else {
        await supabase.from('chiller_stock')
          .update({ 
            quantity_pcs: item.pcs - actualPcs, 
            quantity_kgs: item.kgs - actualKgs 
          })
          .eq('batch_id', batchId);
      }
      fetchData();
    } catch (err) {
      console.error("Supabase Outflow Error:", err);
    }
  };

  const handleQCAction = async (batchId: string, action: 'APPROVE' | 'REJECT') => {
    if (!user || user.role !== 'ADMIN') return;
    try {
      await supabase.from('chiller_stock')
        .update({ 
          status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
        })
        .eq('batch_id', batchId);
      fetchData();
    } catch (err) {
      console.error("QC Action Error:", err);
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

      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] animate-in fade-in duration-300" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      <aside className={`
        fixed inset-y-0 z-[70] md:relative md:flex flex-col bg-[#c01e1e] text-white transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'right-0 translate-x-0 w-64 shadow-2xl' : 'right-0 translate-x-full md:left-0 md:right-auto md:translate-x-0'}
        ${sidebarCollapsed ? 'md:w-20' : 'md:w-64'}
      `}>
        <button 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex absolute -right-4 top-24 w-8 h-8 bg-white text-[#c01e1e] rounded-full items-center justify-center shadow-lg border border-gray-100 hover:scale-110 active:scale-95 transition-all z-[80] group"
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

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

      <main className="flex-1 h-screen overflow-y-auto p-4 md:p-8 pt-6 md:pt-8 transition-all duration-300">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4">
             <div className="w-12 h-12 border-4 border-red-100 border-t-red-600 rounded-full animate-spin"></div>
             <span className="text-xs font-black uppercase tracking-widest">Sinkronisasi Data...</span>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {(() => {
              switch (activeView) {
                case 'DASHBOARD': return <Dashboard items={chillerTable} transactions={transactionTable} onNavigate={setActiveView} />;
                case 'INFLOW': return <InflowForm onSubmitBatch={handleInflow} />;
                case 'INVENTORY': return <InventoryList user={user} items={currentInventory} onOut={handleOutflow} onBatchOut={()=>{}} onQCApprove={(id)=>handleQCAction(id,'APPROVE')} onQCReject={(id)=>handleQCAction(id,'REJECT')} />;
                case 'REPORTS': return <Reports items={chillerTable} transactions={transactionTable} logs={logTable} users={[user!]} />;
                case 'DAILY_REPORT': return <DailyStockReport items={chillerTable} />;
                default: return <Dashboard items={chillerTable} transactions={transactionTable} onNavigate={setActiveView} />;
              }
            })()}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
