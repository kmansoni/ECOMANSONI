---
name: capacitor-offline
description: |
  Офлайн-режим для мобильных приложений: IndexedDB/SQLite sync, conflict resolution,
  background sync, Capacitor plugins. Use when: mobile offline, capacitor offline,
  sync queue, conflict resolution.
license: Apache 2.0
---

# Capacitor Offline — Мобильный офлайн-режим

Офлайн-функционал для Capacitor мобильных приложений. Sync queue + conflict resolution.

## Когда использовать

- Приложение должно работать без интернета
- Синхронизация данных при reconnected
- Conflict resolution при конфликтных изменениях
- Background sync на мобильных

## IndexedDB Setup

```typescript
// src/lib/offline/db.ts
import { openDB } from 'idb';

const DB_NAME = 'app-db';
const DB_VERSION = 1;

export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Pending operations queue
      const store = db.createObjectStore('pendingOps', { 
        keyPath: 'id',
        autoIncrement: true 
      });
      store.createIndex('byStatus', 'status');
      store.createIndex('byTimestamp', 'timestamp');
      
      // Cached data
      const cache = db.createObjectStore('cache', { keyPath: 'url' });
      cache.createIndex('byExpiry', 'expiry');
      
      // Outbox for messages
      const outbox = db.createObjectStore('outbox', { 
        keyPath: 'id',
        autoIncrement: true 
      });
    }
  });
}
```

## Sync Queue

```typescript
// src/lib/offline/syncQueue.ts
interface PendingOperation {
  id?: number;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  table: string;
  data: any;
  timestamp: number;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  retries: number;
}

class SyncQueue {
  private db = initDB();
  
  async enqueue(op: Omit<PendingOperation, 'id' | 'status' | 'retries'>) {
    const db = await this.db;
    return db.add('pendingOps', {
      ...op,
      status: 'pending',
      retries: 0,
      timestamp: Date.now()
    });
  }
  
  async processQueue() {
    const db = await this.db;
    const tx = db.transaction('pendingOps', 'readwrite');
    const store = tx.objectStore('pendingOps');
    
    for await (const cursor of store.index('byStatus').iterate('pending')) {
      const op = cursor.value;
      try {
        await store.put({ ...op, status: 'syncing' });
        await this.executeOperation(op);
        await store.delete(op.id!);
      } catch (error) {
        await store.put({ 
          ...op, 
          status: 'failed',
          retries: op.retries + 1 
        });
      }
    }
  }
  
  private async executeOperation(op: PendingOperation) {
    const { table, type, data } = op;
    
    switch (type) {
      case 'CREATE':
        await supabase.from(table).insert(data);
        break;
      case 'UPDATE':
        await supabase.from(table).update(data).eq('id', data.id);
        break;
      case 'DELETE':
        await supabase.from(table).delete().eq('id', data.id);
        break;
    }
  }
}
```

## Conflict Resolution

```typescript
// src/lib/offline/conflictResolution.ts
interface VersionedData {
  id: string;
  version: number;
  data: any;
  lastModified: number;
  modifiedBy?: string;
}

type ConflictResolver = 'client-wins' | 'server-wins' | 'merge' | 'prompt';

class ConflictResolver {
  resolve<T extends VersionedData>(
    local: T, 
    server: T, 
    strategy: ConflictResolver = 'server-wins'
  ): T {
    switch (strategy) {
      case 'client-wins':
        return local;
      
      case 'server-wins':
        return server;
      
      case 'merge':
        return this.mergeChanges(local, server);
      
      case 'prompt':
        // Store conflict for user resolution
        return this.promptUser(local, server);
    }
  }
  
  private mergeChanges<T extends VersionedData>(local: T, server: T): T {
    // Last-write-wins for each field
    const merged = { ...server };
    const localKeys = Object.keys(local.data);
    
    for (const key of localKeys) {
      if (local.lastModified > server.lastModified) {
        merged.data[key] = local.data[key];
      }
    }
    
    return {
      ...merged,
      version: Math.max(local.version, server.version) + 1,
      lastModified: Date.now()
    };
  }
  
  private promptUser<T extends VersionedData>(local: T, server: T): T {
    // Store conflict record
    localStorage.setItem(`conflict-${local.id}`, JSON.stringify({
      local,
      server,
      timestamp: Date.now()
    }));
    
    // Return server as default
    return server;
  }
}
```

## Network Status Detection

```typescript
// src/lib/offline/networkStatus.ts
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

class NetworkMonitor {
  private callbacks: Array<(online: boolean) => void> = [];
  
  constructor() {
    if (Capacitor.isNativePlatform()) {
      Network.addListener('networkStatusChange', status => {
        this.notifyListeners(status.connected);
        if (status.connected) {
          this.triggerSync();
        }
      });
    } else {
      window.addEventListener('online', () => {
        this.notifyListeners(true);
        this.triggerSync();
      });
      window.addEventListener('offline', () => {
        this.notifyListeners(false);
      });
    }
  }
  
  private notifyListeners(online: boolean) {
    this.callbacks.forEach(cb => cb(online));
  }
  
  private async triggerSync() {
    await new SyncQueue().processQueue();
  }
  
  subscribe(callback: (online: boolean) => void) {
    this.callbacks.push(callback);
  }
}
```

## Background Sync

```typescript
// src/lib/offline/backgroundSync.ts
import { BackgroundTask } from '@capacitor/background-task';

class BackgroundSync {
  async scheduleSync() {
    if (!Capacitor.isNativePlatform()) return;
    
    const task = await BackgroundTask.beforeExit(async () => {
      await new SyncQueue().processQueue();
      task.complete();
    });
  }
}
```

## Hook Integration

```typescript
// src/hooks/useOffline.ts
import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingOps, setPendingOps] = useState(0);
  
  useEffect(() => {
    const unsubscribe = Network.addListener('networkStatusChange', status => {
      setIsOnline(status.connected);
    });
    
    return () => unsubscribe.remove();
  }, []);
  
  const sync = async () => {
    if (isOnline) {
      await new SyncQueue().processQueue();
      const count = await getPendingCount();
      setPendingOps(count);
    }
  };
  
  return { isOnline, pendingOps, sync };
}
```

## Checklist

- [ ] IndexedDB schema с pendingOps и cache
- [ ] Sync queue с retry логикой
- [ ] Network status detection
- [ ] Conflict resolution (last-write-wins или merge)
- [ ] Background sync с Capacitor plugin
- [ ] UI indicator для pending операций
- [ ] Outbox pattern для сообщений