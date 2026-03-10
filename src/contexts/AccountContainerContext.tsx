/**
 * AccountContainerProvider — Device account context
 *
 * Provides account container state to entire app.
 * Does NOT participate in auth logic.
 * Works alongside AuthProvider.
 */

import React, { createContext, useContext } from 'react';
import { useAccountContainer, type StoredAccount } from '@/hooks/useAccountContainer';

interface AccountContainerContextType {
  accounts: StoredAccount[];
  activeAccountId: string | null;
  deviceId: string;
  switchAccount: (userId: string) => void;
  addAccount: (userId: string, sessionId: string, profile?: StoredAccount['profile']) => void;
  removeAccount: (userId: string) => void;
  updateAccount: (userId: string, updates: Partial<StoredAccount>) => void;
  getActiveAccount: () => StoredAccount | null;
  getAccount: (userId: string) => StoredAccount | null;
}

const AccountContainerContext = createContext<AccountContainerContextType | null>(null);

export function AccountContainerProvider({ children }: { children: React.ReactNode }) {
  const container = useAccountContainer();

  return (
    <AccountContainerContext.Provider value={container}>{children}</AccountContainerContext.Provider>
  );
}

export function useAccountContainerContext(): AccountContainerContextType {
  const context = useContext(AccountContainerContext);
  if (!context) {
    throw new Error('useAccountContainerContext must be used within AccountContainerProvider');
  }
  return context;
}
