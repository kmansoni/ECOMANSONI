import { Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { logger } from "@/lib/logger";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.warn("[NotFound] Redirect from non-existent route", { path: location.pathname });
  }, [location.pathname]);

  return <Navigate to="/" replace />;
};

export default NotFound;
