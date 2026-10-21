import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, RotateCcw, Package, Warehouse,
  TruckIcon, DollarSign, Users, TrendingUp, BarChart2, FileText,
  Settings, Shield, ScrollText, ChevronRight, Flame, PackageCheck, X
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/packing', icon: PackageCheck, label: 'Packing & Dispatch' },
  { to: '/returns', icon: RotateCcw, label: 'Returns' },
  { to: '/perfume-sales', icon: Flame, label: 'Perfume Sell & Return' },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/inventory', icon: Warehouse, label: 'Inventory' },
  { to: '/stock-purchases', icon: TruckIcon, label: 'Stock Purchases' },
  { to: '/vendors', icon: TruckIcon, label: 'Vendors' },
  { to: '/expenses', icon: DollarSign, label: 'Expenses' },
  { to: '/partners', icon: Users, label: 'Partners' },
  { to: '/pnl', icon: TrendingUp, label: 'Profit & Loss' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/reports', icon: FileText, label: 'Reports' },
];

const adminNavItems = [
  { to: '/settings', icon: Settings, label: 'GSTIN Settings' },
  { to: '/users', icon: Shield, label: 'User Management' },
  { to: '/audit', icon: ScrollText, label: 'Audit Logs' },
];

const Sidebar: React.FC = () => {
  const { user } = useAuthStore();
  const { isMobileSidebarOpen, closeMobileSidebar } = useUIStore();
  const isAdmin = user?.role === 'admin';

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar (Desktop fixed, Mobile sliding drawer) */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-100 flex flex-col z-50 w-64 shadow-xl lg:shadow-none transition-transform duration-300 ease-in-out ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo & Close button on mobile */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-brand-600 rounded-lg flex items-center justify-center shadow-xs">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">Perfume</p>
              <p className="text-[11px] text-gray-400 font-medium">Business Manager</p>
            </div>
          </div>

          <button
            onClick={closeMobileSidebar}
            className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={closeMobileSidebar}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                  />
                  <span className="flex-1">{item.label}</span>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-primary-400" />}
                </>
              )}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Administration
                </p>
              </div>
              <div className="space-y-0.5">
                {adminNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={closeMobileSidebar}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                        isActive
                          ? 'bg-primary-50 text-primary-700 font-semibold'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={`w-4 h-4 flex-shrink-0 ${
                            isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
                          }`}
                        />
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </nav>

        {/* User info footer */}
        <div className="p-3.5 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary-700">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{user?.name}</p>
              <p className="text-[10px] text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
