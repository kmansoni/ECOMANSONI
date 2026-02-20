import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminMe } from "@/hooks/useAdminMe";

export function AdminProtectedRoute() {
  const { user, loading: authLoading } = useAuth();
  const { me, loading: meLoading } = useAdminMe();
  const location = useLocation();

  if (authLoading || meLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  if (!me) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname, notAdmin: true }} />;
  }

  return <Outlet />;
}
