
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, 
  ArrowDownToLine, 
  ThermometerSnowflake, 
  ClipboardList, 
  BarChart3, 
  Menu, 
  X, 
  LogOut, 
  User as UserIcon, 
  ChevronLast, 
  ChevronFirst 
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

  const itemsCache = useRef<Record<string, {name: string, code: string}>>({});
  const usersCache = useRef<Record<string, string>>({});

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const { data: itemsData } = await supabase.from('items').select('id, code, description');
      if (itemsData) {
        itemsData.forEach(item => { 
          itemsCache.current[item.id] = { name: item.description, code: item.code };
        });
      }

      const { data: usersData } = await supabase.from('users').select('id, username');
      if (usersData) {
        usersData.forEach(u => { usersCache.current[u.id] = u.username; });
      }

      const [stockRes, trxRes] = await Promise.all([
        supabase.from('chiller_stock').select('*').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*').order('transaction_time', { ascending: false })
      ]);
      
      if (stockRes.error) throw stockRes.error;
      if (trxRes.error) throw trxRes.error;

      const mappedTrx: Transaction[] = (trxRes.data || []).map(item => ({
        id: String(item.id),
        chillerId: String(item.batch_id || 'N/A'),
        itemCode: item.note || undefined,
        userId: usersCache.current[item.user_id] || item.user_id,
        type: (item.transaction_type || '').toUpperCase() as any,
        destination: item.destination as OutflowDestination,
        pcs: Number(item.quantity_pcs),
        kgs: Number(item.quantity_kgs),
        timestamp: new Date(item.transaction_time).getTime()
      }));

      const mappedStock: ChillerItem[] = (stockRes.data || []).map(item => {
        const batchId = item.batch_id;
        const lastOut = mappedTrx.find(t => t.chillerId === batchId && t.type === 'OUT');

        return {
          id: item.id ? String(item.id) : String(item.batch_id),
          batchId: item.batch_id,
          itemsId: item.items_id,
          itemCode: itemsCache.current[item.items_id]?.code || 'N/A',
          itemName: itemsCache.current[item.items_id]?.name || item.items_id,
          pcs: Number(item.quantity_pcs),
          kgs: Number(item.quantity_kgs),
          productionDate: item.production_date,
          slaughteringDate: item.slaughtering_date,
          source: item.source || 'FPS',
          entryTimestamp: new Date(item.created_at).getTime(),
          exitTimestamp: lastOut ? lastOut.timestamp : undefined,
          status: (
            item.status === 'OUT' || item.status === 'OUT_CHILLER' ? 'OUT_CHILLER' : 
            item.status === 'PENDING' || item.status === 'QC_PENDING' ? 'PENDING_QC' : 
            'IN_CHILLER'
          ),
          isWIP: item.status_WIP === true || item.status_WIP === 'true'
        };
      });

      setChillerTable(mappedStock);
      setTransactionTable(mappedTrx);
      setLogTable(mappedTrx.map(t => ({
        id: `LOG-${t.id}`,
        userId: t.userId,
        action: t.type,
        details: `${t.type} untuk Batch ${t.chillerId} (${t.pcs} Pcs / ${t.kgs.toFixed(2)} Kg)`,
        timestamp: t.timestamp
      })));
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      const channel = supabase.channel('bsi-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chiller_stock' }, () => fetchData(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchData(true))
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [isAuthenticated, fetchData]);

  const handleInflow = async (newItems: Omit<ChillerItem, 'id' | 'batchId' | 'entryTimestamp' | 'status' | 'itemCode'>[]) => {
    if (!user) return;
    for (const item of newItems) {
      const formatDateForBatch = (d: string) => {
        const parts = d.split('-');
        return parts[2] + parts[1] + parts[0].slice(-2);
      };

      const pdFmt = formatDateForBatch(item.productionDate);
      const sdFmt = formatDateForBatch(item.slaughteringDate);
      const datePart = pdFmt === sdFmt ? pdFmt : `${pdFmt}${sdFmt}`;
      const batchId = `BSI-${datePart}-${Math.floor(Math.random() * 900 + 100)}`;
      const currentItemCode = itemsCache.current[item.itemsId]?.code || 'N/A';
      
      try {
        const { error: stockErr } = await supabase.from('chiller_stock').insert({
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
        });
        if (stockErr) throw stockErr;

        const { error: trxErr } = await supabase.from('transactions').insert({
          batch_id: batchId,
          note: currentItemCode,
          destination: 'Chiller',
          quantity_pcs: item.pcs,
          quantity_kgs: item.kgs,
          transaction_type: 'in', 
          user_id: user.id,
          transaction_time: new Date().toISOString()
        });
        if (trxErr) throw trxErr;
      } catch (err) { console.error("Inflow Error:", err); }
    }
    fetchData(true);
    setActiveView('INVENTORY');
  };

  const handleOutflow = async (id: string, destination: OutflowDestination, outPcs?: number, outKgs?: number) => {
    if (!user) return;
    const item = chillerTable.find(i => i.id === id);
    if (!item) return;

    const actualPcs = outPcs ?? item.pcs;
    const actualKgs = outKgs ?? item.kgs;
    const userRole = user.role.toUpperCase();

    if (destination === 'Condem' && (userRole === 'USER' || userRole === 'ADMIN')) {
      try {
        const { error: stockErr } = await supabase.from('chiller_stock')
          .update({ status: 'PENDING' })
          .eq(item.id.includes('-') ? 'id' : 'batch_id', item.id);
        
        if (stockErr) throw stockErr;

        const { error: trxErr } = await supabase.from('transactions').insert({
          batch_id: item.batchId,
          note: item.itemCode,
          destination: 'Condem',
          quantity_pcs: actualPcs,
          quantity_kgs: actualKgs,
          transaction_type: 'qc_pending', 
          user_id: user.id,
          transaction_time: new Date().toISOString()
        });
        if (trxErr) throw trxErr;
        
        fetchData(true);
        return;
      } catch (err) {
        console.error("Condem Request Error:", err);
        return;
      }
    }

    try {
      if (actualPcs >= item.pcs) {
        const { error: upErr } = await supabase.from('chiller_stock')
          .update({ 
            status: 'OUT',
            quantity_pcs: 0,
            quantity_kgs: 0
          })
          .eq(item.id.includes('-') ? 'id' : 'batch_id', item.id);
        if (upErr) throw upErr;
      } else {
        const { error: upErr } = await supabase.from('chiller_stock')
          .update({ 
            quantity_pcs: item.pcs - actualPcs, 
            quantity_kgs: item.kgs - actualKgs 
          })
          .eq(item.id.includes('-') ? 'id' : 'batch_id', item.id);
        if (upErr) throw upErr;
      }

      const { error: trxErr } = await supabase.from('transactions').insert({
        batch_id: item.batchId,
        note: item.itemCode,
        destination: destination,
        quantity_pcs: actualPcs,
        quantity_kgs: actualKgs,
        transaction_type: 'out', 
        user_id: user.id,
        transaction_time: new Date().toISOString()
      });
      
      if (trxErr) throw trxErr;
      fetchData(true);
    } catch (err) { 
      console.error("Outflow Error:", err);
      alert("Gagal memproses pengeluaran stok.");
    }
  };

  const handleBatchOut = async (ids: string[], destination: OutflowDestination) => {
    for (const id of ids) {
      await handleOutflow(id, destination);
    }
  };

  const handleQCAction = async (id: string, action: 'APPROVE' | 'REJECT') => {
    const role = user?.role?.toUpperCase();
    if (!user || (role !== 'ADMINQC' && role !== 'SUPERADMIN')) return;
    const item = chillerTable.find(i => i.id === id);
    if (!item) return;

    try {
      const { data: trxList } = await supabase
        .from('transactions')
        .select('*')
        .eq('batch_id', item.batchId)
        .eq('transaction_type', 'qc_pending')
        .order('transaction_time', { ascending: false })
        .limit(1);

      const lastTrx = trxList && trxList.length > 0 ? trxList[0] : null;

      if (lastTrx && lastTrx.destination === 'Condem') {
        if (action === 'APPROVE') {
          if (lastTrx.quantity_pcs >= item.pcs) {
            await supabase.from('chiller_stock').update({
              status: 'OUT',
              quantity_pcs: 0,
              quantity_kgs: 0
            }).eq('batch_id', item.batchId);
          } else {
            await supabase.from('chiller_stock').update({
              quantity_pcs: item.pcs - lastTrx.quantity_pcs,
              quantity_kgs: item.kgs - lastTrx.quantity_kgs,
              status: 'IN'
            }).eq('batch_id', item.batchId);
          }
          
          await supabase.from('transactions').insert({
            batch_id: item.batchId,
            note: item.itemCode,
            destination: 'Condem',
            quantity_pcs: lastTrx.quantity_pcs,
            quantity_kgs: lastTrx.quantity_kgs,
            transaction_type: 'out',
            user_id: user.id,
            transaction_time: new Date().toISOString()
          });
        } else {
          await supabase.from('chiller_stock')
            .update({ status: 'IN' })
            .eq('batch_id', item.batchId);
            
          await supabase.from('transactions').insert({
            batch_id: item.batchId,
            note: item.itemCode,
            destination: 'Chiller',
            quantity_pcs: item.pcs,
            quantity_kgs: item.kgs,
            transaction_type: 'qc_rejected',
            user_id: user.id,
            transaction_time: new Date().toISOString()
          });
        }
      } else {
        const { error: stockErr } = await supabase.from('chiller_stock')
          .update({ status: action === 'APPROVE' ? 'APPROVED' : 'IN' })
          .eq(item.id.includes('-') ? 'id' : 'batch_id', item.id);

        if (stockErr) throw stockErr;

        const { error: trxErr } = await supabase.from('transactions').insert({
          batch_id: item.batchId,
          note: item.itemCode,
          destination: 'Chiller',
          quantity_pcs: item.pcs,
          quantity_kgs: item.kgs,
          transaction_type: action === 'APPROVE' ? 'qc_approved' : 'qc_rejected',
          user_id: user.id,
          transaction_time: new Date().toISOString()
        });
        if (trxErr) throw trxErr;
      }

      fetchData(true);
    } catch (err) { console.error("QC Action Error:", err); }
  };

  const handleLogin = (u: User) => {
    setIsAuthenticated(true);
    setUser(u);
    localStorage.setItem('bsi_auth', 'true');
    localStorage.setItem('bsi_user', JSON.stringify(u));
    fetchData();
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('bsi_auth');
    localStorage.removeItem('bsi_user');
  };

  const currentInventory = useMemo(() => 
    chillerTable.filter(item => item.status === 'IN_CHILLER' || item.status === 'PENDING_QC'), 
  [chillerTable]);

  const navigation = [
    { name: 'Dashboard', view: 'DASHBOARD' as ViewState, icon: LayoutDashboard },
    { name: 'Input', view: 'INFLOW' as ViewState, icon: ArrowDownToLine },
    { name: 'Stok Chiller', view: 'INVENTORY' as ViewState, icon: ThermometerSnowflake },
    ...(user?.role?.toUpperCase() !== 'USER' ? [{ name: 'Laporan & Log', view: 'REPORTS' as ViewState, icon: ClipboardList }] : []),
    { name: 'Stok Harian', view: 'DAILY_REPORT' as ViewState, icon: BarChart3 },
  ];

  if (!isAuthenticated) return <LoginForm onLogin={handleLogin} />;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 overflow-hidden relative">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] md:hidden animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Header (Top bar) */}
      <header className="md:hidden bg-[#c01e1e] text-white p-4 flex items-center justify-between shadow-lg z-50">
        <button 
          onClick={() => setSidebarOpen(true)} 
          className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
        >
          <Menu size={24} />
        </button>
        <div className="flex items-center gap-3">
          <img src="/logo2.png" className="w-8 h-8 bg-white p-1 rounded-lg" />
          <span className="font-brand font-bold italic text-xs uppercase tracking-wider">BSI CMS</span>
        </div>
      </header>
      
      {/* Sidebar Aside Panel */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-[70] md:relative md:flex flex-col bg-[#c01e1e] text-white 
          transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} 
          ${sidebarCollapsed ? 'md:w-20' : 'md:w-64'}
          w-[280px] md:w-auto
        `}
      >
        <div className="p-4 md:p-6 border-b border-white/10 flex items-center gap-4">
          <button 
            onClick={() => {
              if (window.innerWidth < 768) setSidebarOpen(false);
              else setSidebarCollapsed(!sidebarCollapsed);
            }} 
            className="p-2 hover:bg-white/10 rounded-xl transition-all shrink-0"
          >
            <div className="md:hidden">
              <X size={22} className="text-white" />
            </div>
            <div className="hidden md:block">
              {sidebarCollapsed ? <ChevronLast size={20} /> : <ChevronFirst size={20} />}
            </div>
          </button>

          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-white p-1.5 rounded-xl w-10 h-10 shrink-0 flex items-center justify-center shadow-lg">
              <img src="/logo2.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0 animate-in slide-in-from-left-2">
                <span className="font-brand font-bold italic text-sm whitespace-nowrap leading-tight">
                  Bounty Segar Indonesia
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider opacity-60">
                  Chiller Management System
                </span>
              </div>
            )}
          </div>
        </div>
        
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto">
          {navigation.map(item => (
            <button 
              key={item.name} 
              onClick={() => { setActiveView(item.view); setSidebarOpen(false); }} 
              className={`
                w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all group
                ${activeView === item.view 
                  ? 'bg-white text-[#c01e1e] font-black shadow-[0_10px_20px_-5px_rgba(255,255,255,0.3)]' 
                  : 'hover:bg-white/10 text-white/80 hover:text-white'
                }
              `}
            >
              <item.icon size={20} className={activeView === item.view ? 'text-[#c01e1e]' : 'group-hover:scale-110 transition-transform'} />
              {(!sidebarCollapsed || (window.innerWidth < 768)) && (
                <span className="text-[11px] font-black uppercase tracking-widest">{item.name}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User Profile Section */}
        {user && (
          <div className="px-4 py-6 border-t border-white/10 mx-2 mb-1 bg-white/5 rounded-3xl m-3">
            <div className={`flex items-center gap-3 ${sidebarCollapsed && window.innerWidth >= 768 ? 'justify-center' : ''}`}>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 border border-white/10">
                <UserIcon size={20} className="text-white" />
              </div>
              {(!sidebarCollapsed || window.innerWidth < 768) && (
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black uppercase truncate leading-tight text-white">{user.fullName || user.username}</p>
                  <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest mt-0.5">{user.role}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleLogout} 
            className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-red-500 rounded-2xl transition-all text-white/70 hover:text-white group"
          >
            <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
            {(!sidebarCollapsed || window.innerWidth < 768) && (
              <span className="text-[11px] font-black uppercase tracking-widest">Logout</span>
            )}
          </button>
        </div>
      </aside>

      <main className="flex-1 h-screen overflow-y-auto p-4 md:p-8 bg-gray-50">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4">
            <div className="w-12 h-12 border-4 border-red-100 border-t-red-600 rounded-full animate-spin"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Meyinkronkan Data...</span>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto pb-20 md:pb-0">
            {activeView === 'DASHBOARD' && <Dashboard items={chillerTable} transactions={transactionTable} onNavigate={setActiveView} />}
            {activeView === 'INFLOW' && <InflowForm onSubmitBatch={handleInflow} />}
            {activeView === 'INVENTORY' && <InventoryList user={user} items={currentInventory} onOut={handleOutflow} onBatchOut={handleBatchOut} onQCApprove={(id)=>handleQCAction(id,'APPROVE')} onQCReject={(id)=>handleQCAction(id,'REJECT')} />}
            {activeView === 'REPORTS' && <Reports items={chillerTable} transactions={transactionTable} logs={logTable} users={[user!]} />}
            {activeView === 'DAILY_REPORT' && <DailyStockReport items={chillerTable} transactions={transactionTable} />}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
