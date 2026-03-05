/**
 * Training Seed 02: React TypeScript Component
 * =============================================
 * Паттерны: Custom hook + Zustand store + Error Boundary + Accessibility
 * Strict TypeScript: noImplicitAny, strictNullChecks
 * Архитектурные решения:
 *   - Разделение UI-компонента и логики через custom hook
 *   - Мемоизация дорогостоящих вычислений (useMemo/useCallback)
 *   - Оптимистичные обновления в Zustand store
 *   - Error Boundary перехватывает ошибки рендера (не async!)
 *   - ARIA атрибуты для screen readers
 */

import React, {
  Component,
  ErrorInfo,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------
interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface UserStore {
  users: User[];
  isLoading: boolean;
  error: string | null;
  selectedId: string | null;
  setUsers: (users: User[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectUser: (id: string | null) => void;
  addUser: (user: User) => void;
  removeUser: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Zustand store — персистентный, с devtools
// ---------------------------------------------------------------------------
const useUserStore = create<UserStore>()(
  devtools(
    persist(
      (set) => ({
        users: [],
        isLoading: false,
        error: null,
        selectedId: null,
        setUsers: (users) => set({ users }, false, "setUsers"),
        setLoading: (isLoading) => set({ isLoading }, false, "setLoading"),
        setError: (error) => set({ error }, false, "setError"),
        selectUser: (selectedId) => set({ selectedId }, false, "selectUser"),
        addUser: (user) =>
          set((state) => ({ users: [...state.users, user] }), false, "addUser"),
        removeUser: (id) =>
          set(
            (state) => ({ users: state.users.filter((u) => u.id !== id) }),
            false,
            "removeUser"
          ),
      }),
      { name: "user-store" }
    )
  )
);

// ---------------------------------------------------------------------------
// Custom hook — инкапсулирует логику загрузки
// ---------------------------------------------------------------------------
interface UseUsersResult {
  users: User[];
  isLoading: boolean;
  error: string | null;
  selectedUser: User | undefined;
  filteredUsers: User[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleSelect: (id: string) => void;
  handleRemove: (id: string) => void;
  refresh: () => Promise<void>;
}

function useUsers(apiUrl: string): UseUsersResult {
  const { users, isLoading, error, selectedId, setUsers, setLoading, setError, selectUser, removeUser } =
    useUserStore();
  const [searchQuery, setSearchQuery] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    // Отменяем предыдущий незавершённый запрос (race condition protection)
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl, { signal: abortRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: User[] = await res.json();
      setUsers(data);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [apiUrl, setUsers, setLoading, setError]);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort(); // cleanup on unmount
  }, [refresh]);

  // Мемоизируем фильтрацию — не пересчитываем при каждом ре-рендере
  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.email.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [users, searchQuery]
  );

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedId),
    [users, selectedId]
  );

  const handleSelect = useCallback((id: string) => selectUser(id), [selectUser]);
  const handleRemove = useCallback((id: string) => removeUser(id), [removeUser]);

  return {
    users,
    isLoading,
    error,
    selectedUser,
    filteredUsers,
    searchQuery,
    setSearchQuery,
    handleSelect,
    handleRemove,
    refresh,
  };
}

// ---------------------------------------------------------------------------
// Error Boundary — перехватывает ошибки рендера дочерних компонентов
// ---------------------------------------------------------------------------
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class UserListErrorBoundary extends Component<
  React.PropsWithChildren<{ fallback?: React.ReactNode }>,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{ fallback?: React.ReactNode }>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // В проде — отправить в Sentry/Datadog
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-semibold">Что-то пошло не так</p>
          <p className="text-red-500 text-sm mt-1">{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// UI-компоненты (мемоизированы для предотвращения лишних ре-рендеров)
// ---------------------------------------------------------------------------
const UserCard = memo<{ user: User; isSelected: boolean; onSelect: (id: string) => void; onRemove: (id: string) => void }>(
  ({ user, isSelected, onSelect, onRemove }) => (
    <article
      role="listitem"
      aria-selected={isSelected}
      aria-label={`Пользователь ${user.name}`}
      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
      }`}
      onClick={() => onSelect(user.id)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(user.id)}
      tabIndex={0}
    >
      <img
        src={user.avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`}
        alt={`Аватар ${user.name}`}
        className="w-10 h-10 rounded-full object-cover"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{user.name}</p>
        <p className="text-sm text-gray-500 truncate">{user.email}</p>
      </div>
      <button
        aria-label={`Удалить пользователя ${user.name}`}
        className="ml-auto p-1 text-gray-400 hover:text-red-500 rounded"
        onClick={(e) => { e.stopPropagation(); onRemove(user.id); }}
      >
        ✕
      </button>
    </article>
  )
);
UserCard.displayName = "UserCard";

// ---------------------------------------------------------------------------
// Главный компонент
// ---------------------------------------------------------------------------
interface UserListProps {
  apiUrl?: string;
}

const UserList: React.FC<UserListProps> = ({ apiUrl = "/api/users" }) => {
  const {
    isLoading,
    error,
    filteredUsers,
    selectedUser,
    searchQuery,
    setSearchQuery,
    handleSelect,
    handleRemove,
    refresh,
  } = useUsers(apiUrl);

  return (
    <section aria-label="Список пользователей" className="max-w-md mx-auto p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Пользователи</h1>
        <button
          onClick={() => void refresh()}
          disabled={isLoading}
          aria-label="Обновить список"
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {isLoading ? "Загрузка..." : "Обновить"}
        </button>
      </header>

      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Поиск по имени или email..."
        aria-label="Поиск пользователей"
        className="w-full px-3 py-2 mb-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {selectedUser && (
        <div aria-live="polite" className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
          Выбран: <strong>{selectedUser.name}</strong>
        </div>
      )}

      <div role="list" aria-busy={isLoading} className="space-y-2">
        {filteredUsers.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            isSelected={selectedUser?.id === user.id}
            onSelect={handleSelect}
            onRemove={handleRemove}
          />
        ))}
        {!isLoading && filteredUsers.length === 0 && (
          <p className="text-center text-gray-500 py-8">Пользователи не найдены</p>
        )}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Экспорт с Error Boundary (рекомендуемый паттерн)
// ---------------------------------------------------------------------------
export const UserListWithBoundary: React.FC<UserListProps> = (props) => (
  <UserListErrorBoundary>
    <UserList {...props} />
  </UserListErrorBoundary>
);

export { useUserStore, useUsers, UserList, UserListErrorBoundary };
export type { User, UserStore };
export default UserListWithBoundary;
