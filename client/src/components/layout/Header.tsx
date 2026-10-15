import React, { useEffect, useState, useRef } from 'react';
import { Bell, LogOut, ChevronDown, Building2, Layers, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { useAccountStore } from '../../store/accountStore';
import { useUIStore } from '../../store/uiStore';
import { accountsApi } from '../../services/accounts.service';

const Header: React.FC = () => {
  const { logout } = useAuthStore();
  const { activeAccountId, accounts, setActiveAccountId, setAccounts } = useAccountStore();
  const { toggleMobileSidebar } = useUIStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
  });

  useEffect(() => {
    if (data?.data?.data) {
      setAccounts(data.data.data);
    }
  }, [data, setAccounts]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeAccount =
    activeAccountId === 'all' ? null : accounts.find((a) => a._id === activeAccountId);

  return (
    <header
      className="fixed top-0 left-0 lg:left-64 right-0 bg-white border-b border-gray-100 flex items-center justify-between px-3 sm:px-6 z-20"
      style={{ height: 'var(--header-height)' }}
    >
      {/* Left: Mobile hamburger & GSTIN Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Hamburger button on mobile */}
        <button
          onClick={toggleMobileSidebar}
          className="lg:hidden p-2 -ml-1 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Toggle navigation drawer"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* GSTIN Switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-white text-xs sm:text-sm font-medium text-gray-700 transition-all max-w-[170px] sm:max-w-xs"
          >
            {activeAccountId === 'all' ? (
              <>
                <Layers className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <span className="truncate">All Accounts</span>
              </>
            ) : (
              <>
                <Building2 className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <span className="truncate">
                  {activeAccount?.tradeName || activeAccount?.name || 'Account'}
                </span>
              </>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          </button>

          {/* Touch-Friendly Dropdown */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-64 sm:w-72 bg-white rounded-xl border border-gray-100 shadow-xl z-50 p-2 animate-fade-in">
              <button
                onClick={() => {
                  setActiveAccountId('all');
                  setIsDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs sm:text-sm transition-all ${
                  activeAccountId === 'all'
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Layers className="w-4 h-4 text-primary-500" />
                <div className="text-left">
                  <p className="font-medium">All Accounts</p>
                  <p className="text-[10px] text-gray-400">Consolidated view</p>
                </div>
              </button>

              <div className="my-1 border-t border-gray-100" />

              {accounts.map((account) => (
                <button
                  key={account._id}
                  onClick={() => {
                    setActiveAccountId(account._id);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs sm:text-sm transition-all ${
                    activeAccountId === account._id
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <Building2 className="w-4 h-4 text-primary-500 flex-shrink-0" />
                  <div className="text-left truncate">
                    <p className="font-medium truncate">{account.tradeName || account.name}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{account.gstin}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active GSTIN Pill (hidden on very small mobile) */}
        {activeAccountId !== 'all' && activeAccount && (
          <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-gray-100 text-gray-700">
            GSTIN: {activeAccount.gstin}
          </span>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all font-medium"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
