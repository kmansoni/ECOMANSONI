import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMultiAccount } from "@/contexts/MultiAccountContext";

const DEV_GUEST_FLAG_KEY = "dev_guest_mode";

function isDevGuest(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(DEV_GUEST_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function ProtectedRoute() {
  const { user, loading: authLoading } = useAuth();
  const { loading: accountsLoading } = useMultiAccount();
  const loading = authLoading || accountsLoading;

  // DEV-only: allow navigating the app UI without auth (useful when Phone/SMS OTP isn't configured).
  if (!user && isDevGuest()) {
    return <Outlet />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}
