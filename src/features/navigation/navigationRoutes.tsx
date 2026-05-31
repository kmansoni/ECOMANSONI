/**
 * Navigation routes — lazy-loaded navigation/AR module.
 */
import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";

const AmapPage = lazy(() => import("../../pages/amap/AmapPage"));
const TripHistoryPage = lazy(() => import("../../pages/navigation/TripHistoryPage"));
const QuantumTransportLabPage = lazy(() => import("../../pages/navigation/QuantumTransportLabPage"));

const NavigationRedirect = () => <Navigate to="/amap" replace />;

export const navigationRoutes = (): RouteObject[] => [
  { path: "/amap", lazy: () => Promise.resolve({ Component: AmapPage }) },
  { path: "/navigation", lazy: () => Promise.resolve({ Component: NavigationRedirect }) },
  { path: "/trip-history", lazy: () => Promise.resolve({ Component: TripHistoryPage }) },
];