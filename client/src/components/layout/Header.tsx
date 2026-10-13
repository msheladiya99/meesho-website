import React, { useEffect } from 'react';
import { Bell, LogOut, ChevronDown, Building2, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { useAccountStore } from '../../store/accountStore';
import { accountsApi } from '../../services/accounts.service';

const Header: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { activeAccountId, accounts, setActiveAccountId, setAccounts } = useAccountStore();

  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
  });

  useEffect(() => {
    if (data?.data?.data) {
      setAccounts(data.data.data);
    }
  }, [data, setAccounts]);

  const activeAccount = activeAccountId === 'all'
    ? null
    : accounts.find(a => a._id === activeAccountId);

  return (
    <header
      className="fixed top-0 right-0 bg-white border-b border-gray-100 flex items-center justify-between px-6 z-20"
      style={{ left: 'var(--sidebar-width)', height: 'var(--header-height)' }}
    >
      {/* GSTIN Switcher */}
      <div className="flex items-center gap-2">
        <div className="relative group">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-white text-sm font-medium text-gray-700 transition-all">
            {activeAccountId === 'all' ? (
              <>
                <Layers className="w-4 h-4 text-primary-500" />
                <span>All Accounts</span>
              </>
            ) : (
              <>
                <Building2 className="w-4 h-4 text-primary-500" />
                <span>{activeAccount?.tradeName || activeAccount?.name || 'Account'}</span>
                <span className="text-xs text-gray-400 font-mono">{activeAccount?.gstin}</span>
              </>
            )}
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl border border-gray-100 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
            <div className="p-2">
              <button
                onClick={() => setActiveAccountId('all')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  activeAccountId === 'all' ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Layers className="w-4 h-4" />
                <div className="text-left">
                  <p className="font-medium">All Accounts</p>
                  <p className="text-xs text-gray-400">Consolidated view</p>
                </div>
              </button>
              {accounts.map((account) => (
                <button
                  key={account._id}
                  onClick={() => setActiveAccountId(account._id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    activeAccountId === account._id ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <div className="text-left">
                    <p className="font-medium">{account.tradeName || account.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{account.gstin}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active account badge */}
        {activeAccountId !== 'all' && activeAccount && (
          <span className="text-xs text-gray-500">
            GSTIN: <span className="font-mono font-medium text-gray-800">{activeAccount.gstin}</span>
          </span>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors relative">
          <Bell className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-gray-100" />
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:block">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
