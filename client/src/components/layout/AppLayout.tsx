import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import Header from './Header';
import { accountsApi } from '../../services/accounts.service';
import { useAccountStore } from '../../store/accountStore';

const AppLayout: React.FC = () => {
  const { setAccounts } = useAccountStore();

  const { data } = useQuery({
    queryKey: ['business-accounts'],
    queryFn: () => accountsApi.list(),
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  useEffect(() => {
    if (data?.data) {
      const accounts = Array.isArray(data.data) ? data.data : (data.data as { data?: typeof data.data }).data;
      if (Array.isArray(accounts)) setAccounts(accounts);
    }
  }, [data, setAccounts]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <Header />
      <main
        className="pt-[var(--header-height)] min-h-screen"
        style={{ paddingLeft: 'var(--sidebar-width)' }}
      >
        <div className="p-6 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
