/**
 * CRM routes — lazy-loaded CRM module.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const CRMPage = lazy(() => import("../../pages/CRMPage").then(m => ({ default: m.default })));
const CRMDashboard = lazy(() => import("../../pages/CRMDashboard").then(m => ({ default: m.default })));
const CRMHRDashboard = lazy(() => import("../../pages/CRMHRDashboard").then(m => ({ default: m.default })));
const CRMAutoDashboard = lazy(() => import("../../pages/CRMAutoDashboard").then(m => ({ default: m.default })));
const CRMRealEstateDashboard = lazy(() => import("../../pages/CRMRealEstateDashboard").then(m => ({ default: m.default })));
const CRMInsuranceDashboard = lazy(() => import("../../pages/CRMInsuranceDashboard").then(m => ({ default: m.default })));

export const crmRoutes = (): RouteObject[] => [
  { path: "/crm", lazy: () => Promise.resolve({ Component: CRMPage }) },
  { path: "/crm/dashboard", lazy: () => Promise.resolve({ Component: CRMDashboard }) },
  { path: "/crm/hr", lazy: () => Promise.resolve({ Component: CRMHRDashboard }) },
  { path: "/crm/auto", lazy: () => Promise.resolve({ Component: CRMAutoDashboard }) },
  { path: "/crm/realestate", lazy: () => Promise.resolve({ Component: CRMRealEstateDashboard }) },
  { path: "/crm/insurance", lazy: () => Promise.resolve({ Component: CRMInsuranceDashboard }) },
];