/**
 * Taxi routes — lazy-loaded taxi module.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const TaxiHomePage = lazy(() => import("../../pages/taxi/TaxiHomePage"));
const TaxiHistoryPage = lazy(() => import("../../pages/taxi/TaxiHistoryPage"));
const TaxiSettingsPage = lazy(() => import("../../pages/taxi/TaxiSettingsPage"));
const TaxiDriverPage = lazy(() => import("../../pages/taxi/TaxiDriverPage"));

export const taxiRoutes = (): RouteObject[] => [
  { path: "/taxi", lazy: () => Promise.resolve({ Component: TaxiHomePage }) },
  { path: "/taxi/history", lazy: () => Promise.resolve({ Component: TaxiHistoryPage }) },
  { path: "/taxi/settings", lazy: () => Promise.resolve({ Component: TaxiSettingsPage }) },
  { path: "/taxi/driver", lazy: () => Promise.resolve({ Component: TaxiDriverPage }) },
];