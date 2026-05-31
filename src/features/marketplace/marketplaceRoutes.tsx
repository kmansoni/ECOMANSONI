/**
 * Marketplace routes — lazy-loaded marketplace module.
 */
import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const MarketplaceConnectPage = lazy(() => import("../../pages/marketplace/MarketplaceConnectPage"));
const MarketplaceProductsPage = lazy(() => import("../../pages/marketplace/MarketplaceProductsPage"));
const MarketplaceOrdersPage = lazy(() => import("../../pages/marketplace/MarketplaceOrdersPage"));
const MarketplaceAnalyticsPage = lazy(() => import("../../pages/marketplace/MarketplaceAnalyticsPage"));
const MarketplaceProductDetailPage = lazy(() => import("../../pages/marketplace/MarketplaceProductDetailPage"));
const MarketplaceReturnsPage = lazy(() => import("../../pages/marketplace/MarketplaceReturnsPage"));

export const marketplaceRoutes = (): RouteObject[] => [
  { path: "/admin/marketplace/connect", lazy: () => Promise.resolve({ Component: MarketplaceConnectPage }) },
  { path: "/marketplace/products", lazy: () => Promise.resolve({ Component: MarketplaceProductsPage }) },
  { path: "/marketplace/orders", lazy: () => Promise.resolve({ Component: MarketplaceOrdersPage }) },
  { path: "/marketplace/analytics", lazy: () => Promise.resolve({ Component: MarketplaceAnalyticsPage }) },
  { path: "/marketplace/product/:id", lazy: () => Promise.resolve({ Component: MarketplaceProductDetailPage }) },
  { path: "/marketplace/returns", lazy: () => Promise.resolve({ Component: MarketplaceReturnsPage }) },
];