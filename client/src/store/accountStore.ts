import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BusinessAccount } from '../types';

interface AccountStore {
  activeAccountId: string; // 'all' or specific account _id
  accounts: BusinessAccount[];
  setActiveAccountId: (id: string) => void;
  setAccounts: (accounts: BusinessAccount[]) => void;
  getActiveAccount: () => BusinessAccount | null;
}

export const useAccountStore = create<AccountStore>()(
  persist(
    (set, get) => ({
      activeAccountId: 'all',
      accounts: [],
      setActiveAccountId: (id) => set({ activeAccountId: id }),
      setAccounts: (accounts) => set({ accounts }),
      getActiveAccount: () => {
        const { activeAccountId, accounts } = get();
        if (activeAccountId === 'all') return null;
        return accounts.find((a) => a._id === activeAccountId) || null;
      },
    }),
    {
      name: 'account-storage',
      partialize: (state) => ({ activeAccountId: state.activeAccountId }),
    }
  )
);
