import React, { useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, PackageCheck, RotateCcw, ShoppingCart, Menu
} from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';
import { accountsApi } from '../../services/accounts.service';
import { useAccountStore } from '../../store/accountStore';
import { useUIStore } from '../../store/uiStore';

const AppLayout: React.FC = () => {
  const { setAccounts } = useAccountStore();
  const { openMobileSidebar } = useUIStore();

  const { data } = useQuery({
    queryKey: ['business-accounts'],
    queryFn: () => accountsApi.list(),
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  useEffect(() => {
    if (data?.data) {
      const accounts = Array.isArray(data.data) ? data.data : (data.data as any)?.data;
      if (Array.isArray(accounts)) setAccounts(accounts);
    }
  }, [data, setAccounts]);

  const mobileNavItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/packing', icon: PackageCheck, label: 'Packing' },
    { to: '/returns', icon: RotateCcw, label: 'Returns' },
    { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Sidebar />
      <Header />

      {/* Main Content Area */}
      <main className="flex-1 pt-[var(--header-height)] pl-0 lg:pl-64 pb-20 lg:pb-6 transition-all duration-300">
        <div className="p-3 sm:p-5 lg:p-6 page-enter max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (Visible only on mobile/tablet screens < 1024px) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-200 px-2 py-1.5 flex items-center justify-around shadow-lg"
        aria-label="Mobile Bottom Navigation"
      >
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-primary-600 font-bold bg-primary-50/70'
                  : 'text-gray-500 hover:text-gray-900 font-medium'
              }`
            }
          >
            <item.icon className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </NavLink>
        ))}

        {/* 5th Button: Open Full Slide Drawer Menu */}
        <button
          onClick={openMobileSidebar}
          className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-gray-500 hover:text-gray-900 font-medium transition-all"
          aria-label="More menu items"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">More</span>
        </button>
      </nav>
    </div>
  );
};

export default AppLayout;
