import { useEffect, useState } from "react";

/**
 * Хук для отслеживания онлайн/оффлайн статуса
 * Используется при установке модулей, требующих интернет
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => {
    // Инициализируем текущим статусом
    if (typeof navigator !== "undefined") {
      return navigator.onLine;
    }
    return true; // По умолчанию считаем онлайн ( SSR )
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

export default useOnlineStatus;
