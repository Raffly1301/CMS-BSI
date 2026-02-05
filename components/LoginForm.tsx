
import React, { useState } from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, LogIn, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

interface LoginFormProps {
  onLogin: (user: User) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simulate API delay
    setTimeout(() => {
      if (username === 'admin' && password === 'admin') {
        onLogin({ username: 'admin', role: 'ADMIN', fullName: 'System Administrator' });
      } else if (username === 'user' && password === 'user') {
        onLogin({ username: 'user', role: 'USER', fullName: 'Staff Produksi' });
      } else {
        setError('Username atau password salah.');
        setIsLoading(false);
      }
    }, 1000);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gray-50 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100">
          {/* Brand Header */}
          <div className="bg-gradient-to-b from-[#c01e1e] to-[#8b1515] p-10 text-center text-white relative">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none overflow-hidden">
               <div className="absolute -top-10 -left-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
               <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
            </div>
            
            <div className="bg-white p-4 rounded-2xl w-24 h-24 mx-auto mb-6 shadow-xl flex items-center justify-center relative z-10">
              <img src="/logo2.png" alt="BSI Logo" className="max-w-full max-h-full object-contain" />
            </div>
            <h1 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80 mb-1">Chiller Management</h1>
            <h2 className="text-2xl font-brand font-bold italic tracking-tight">Bounty Segar Indonesia</h2>
          </div>

          <div className="p-8 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-3 text-red-600 animate-in shake duration-300">
                  <AlertCircle size={18} />
                  <span className="text-xs font-bold uppercase tracking-tight">{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Username</label>
                  <div className="relative group">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-600 transition-colors" size={18} />
                    <input
                      type="text"
                      required
                      autoFocus
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-red-600 outline-none transition-all font-bold text-gray-800"
                      placeholder="Masukkan username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-600 transition-colors" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      className="w-full pl-12 pr-12 py-3.5 bg-gray-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-red-600 outline-none transition-all font-bold text-gray-800"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition-colors focus:outline-none"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-[#c01e1e] to-[#8b1515] text-white font-black py-4 rounded-2xl shadow-xl shadow-red-100 hover:shadow-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase text-sm tracking-widest disabled:opacity-70 disabled:grayscale disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <LogIn size={20} />
                    Masuk Sekarang
                  </>
                )}
              </button>
            </form>
          </div>
          
          <div className="p-6 bg-gray-50 text-center border-t border-gray-100">
             <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-loose">
               Sistem Khusus Operasional Internal <br/>
               © 2026 Bounty Segar Indonesia
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
