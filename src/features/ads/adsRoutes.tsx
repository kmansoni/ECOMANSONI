/**
 * Ads routes — lazy-loaded advertising module.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const AdManagerPage = lazy(() => import("../../pages/AdManagerPage").then(m => ({ default: m.default })));
const AdCampaignDetailPage = lazy(() => import("../../pages/ads/AdCampaignDetailPage").then(m => ({ default: m.default })));

export const adsRoutes = (): RouteObject[] => [
  { path: "/ads", lazy: () => Promise.resolve({ Component: AdManagerPage }) },
  { path: "/ads/:id", lazy: () => Promise.resolve({ Component: AdCampaignDetailPage }) },
];