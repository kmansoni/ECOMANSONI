/**
 * AppRoutes — Modular route configuration.
 *
 * Extracts route definitions from App.tsx for maintainability.
 * Routes are organized by feature module and loaded via lazy().
 */

import { lazy } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { adsRoutes } from "../features/ads/adsRoutes";
import { chatRoutes } from "../features/chat/chatRoutes";
import { crmRoutes } from "../features/crm/crmRoutes";
import { editorRoutes } from "../features/editor/editorRoutes";
import { insuranceRoutes } from "../features/insurance/insuranceRoutes";
import { livestreamRoutes } from "../features/livestream/livestreamRoutes";
import { marketplaceRoutes } from "../features/marketplace/marketplaceRoutes";
import { navigationRoutes } from "../features/navigation/navigationRoutes";
import { socialRoutes } from "../features/social/socialRoutes";
import { taxiRoutes } from "../features/taxi/taxiRoutes";

// ─── Lazy-loaded page factories ───────────────────────────────────────────────
const lazyPage = (importFn: () => Promise<{ default: React.ComponentType<any> }>) => 
  lazy(() => importFn().then(m => ({ default: m.default })));

const lazyNamedPage = <T extends Record<string, React.ComponentType<any>>>(
  importFn: () => Promise<T>, 
  exportName: keyof T
) => lazy(() => importFn().then(m => ({ default: m[exportName] })));

// ─── Public Routes ───────────────────────────────────────────────────────────
export const publicRoutes = (): RouteObject[] => [
  { path: "/auth", lazy: async () => ({ Component: (await import("@/pages/AuthPage")).AuthPage }) },
  { path: "/legal/terms", lazy: async () => ({ Component: (await import("@/pages/TermsOfServicePage")).default }) },
  { path: "/legal/privacy", lazy: async () => ({ Component: (await import("@/pages/PrivacyPolicyPage")).default }) },
  { path: "/auth/web-login", lazy: async () => ({ Component: (await import("@/pages/WebLoginCallbackPage")).WebLoginCallbackPage }) },
  { path: "/preview/icons", lazy: async () => ({ Component: (await import("@/pages/IconPreviewPage")).default }) },
  { path: "/preview/design", lazy: async () => ({ Component: (await import("@/pages/DesignSystemPage")).default }) },
  { path: "/demo/video-call", lazy: async () => ({ Component: (await import("@/pages/VideoCallDemoPage")).VideoCallDemoPage }) },
  { path: "/admin/login", lazy: async () => ({ Component: (await import("@/pages/admin/AdminLoginPage")).AdminLoginPage }) },
  { path: "/godmode", lazy: async () => ({ Component: (await import("@/pages/GodmodePage")).GodmodePage }) },
];

// ─── Admin Routes ────────────────────────────────────────────────────────────
export const adminRoutes = (): RouteObject[] => [
  { path: "/admin", lazy: async () => ({ Component: (await import("@/pages/admin/AdminHomePage")).AdminHomePage }) },
  { path: "/admin/admins", lazy: async () => ({ Component: (await import("@/pages/admin/AdminUsersPage")).AdminUsersPage }) },
  { path: "/admin/audit", lazy: async () => ({ Component: (await import("@/pages/admin/AdminAuditPage")).AdminAuditPage }) },
  { path: "/admin/approvals", lazy: async () => ({ Component: (await import("@/pages/admin/AdminApprovalsPage")).AdminApprovalsPage }) },
  { path: "/admin/owner", lazy: async () => ({ Component: (await import("@/pages/admin/OwnerConsolePage")).OwnerConsolePage }) },
  { path: "/admin/verifications", lazy: async () => ({ Component: (await import("@/pages/admin/AdminVerificationsPage")).AdminVerificationsPage }) },
  { path: "/admin/staff-profiles", lazy: async () => ({ Component: (await import("@/pages/admin/AdminStaffProfilesPage")).AdminStaffProfilesPage }) },
  { path: "/admin/hashtags", lazy: async () => ({ Component: (await import("@/pages/admin/AdminHashtagModerationPage")).AdminHashtagModerationPage }) },
  { path: "/admin/business-moderation", lazy: async () => ({ Component: (await import("@/pages/admin/AdminBusinessModerationPage")).AdminBusinessModerationPage }) },
  { path: "/admin/jit", lazy: async () => ({ Component: (await import("@/pages/admin/SecurityAdminJitPage")).SecurityAdminJitPage }) },
  { path: "/admin/kpi-dashboard", lazy: async () => ({ Component: (await import("@/pages/admin/KpiDashboardPage")).KpiDashboardPage }) },
  { path: "/admin/moderation-queue", lazy: async () => ({ Component: (await import("@/pages/admin/ModerationQueuePage")).ModerationQueuePage }) },
  { path: "/admin/appeals", lazy: async () => ({ Component: (await import("@/pages/admin/AppealsPage")).AppealsPage }) },
  { path: "/admin/insurance-soglasie", lazy: async () => ({ Component: (await import("@/pages/admin/AdminSoglasieSettingsPage")).AdminSoglasieSettingsPage }) },
  { path: "/admin/biz-registrations", lazy: async () => ({ Component: (await import("@/pages/admin/AdminBusinessRegistrationsPage")).AdminBusinessRegistrationsPage }) },
];

// ─── Protected Routes (main app) ─────────────────────────────────────────────
export const protectedRoutes = (): RouteObject[] => [
  { path: "/", lazy: async () => ({ Component: (await import("@/pages/HomePage")).HomePage }) },
  { path: "/feed", lazy: async () => ({ Component: () => <Navigate to="/" replace /> }) },
  { path: "/search", lazy: async () => ({ Component: (await import("@/pages/SearchPage")).SearchPage }) },
  { path: "/hashtag/:tag", lazy: async () => ({ Component: (await import("@/pages/HashtagPage")).HashtagPage }) },
  { path: "/explore", lazy: async () => ({ Component: (await import("@/pages/ExplorePage")).default }) },
  { path: "/notifications", lazy: async () => ({ Component: (await import("@/pages/NotificationsPage")).NotificationsPage }) },
  { path: "/chats", lazy: async () => ({ Component: (await import("@/pages/ChatsPage")).ChatsPage }) },
  { path: "/profile", lazy: async () => ({ Component: (await import("@/pages/ProfilePage")).ProfilePage }) },
  { path: "/settings", lazy: async () => ({ Component: (await import("@/pages/SettingsPage")).SettingsPage }) },
  { path: "/reels", lazy: async () => ({ Component: (await import("@/pages/ReelsPage")).default }) },
  { path: "/dev", lazy: async () => ({ Component: (await import("@/pages/DevPanelPage")).default }) },
  { path: "/crisis-mesh", lazy: async () => ({ Component: (await import("@/pages/CrisisMeshPage")).default }) },
  // Real estate
  { path: "/realestate", lazy: async () => ({ Component: (await import("@/pages/RealEstatePage")).default }) },
  { path: "/realestate/:id", lazy: async () => ({ Component: (await import("@/pages/PropertyDetailPage")).default }) },
  { path: "/location/:id", lazy: async () => ({ Component: (await import("@/pages/LocationPage")).default }) },
  { path: "/professional-dashboard", lazy: async () => ({ Component: (await import("@/pages/ProfessionalDashboard")).default }) },
  { path: "/guides/:id", lazy: async () => ({ Component: (await import("@/pages/GuidePage")).default }) },
  { path: "/create-surface", lazy: async () => ({ Component: (await import("@/pages/CreateSurfacePage")).CreateSurfacePage }) },
  // Shop core
  { path: "/shop", lazy: async () => ({ Component: (await import("@/pages/ShopPage")).default }) },
  { path: "/shop/:shopId", lazy: async () => ({ Component: (await import("@/pages/ShopPage")).default }) },
  { path: "/checkout", lazy: async () => ({ Component: (await import("@/pages/CheckoutPage")).default }) },
  { path: "/shop/orders", lazy: async () => ({ Component: (await import("@/pages/ShopOrdersPage")).default }) },
  { path: "/shop/returns", lazy: async () => ({ Component: (await import("@/pages/ShopReturnsPage")).default }) },
  { path: "/shop/discover", lazy: async () => ({ Component: (await import("@/pages/ShopDiscoveryPage")).default }) },
  { path: "/orders/:id", lazy: async () => ({ Component: (await import("@/pages/OrderDetailPage")).default }) },
  { path: "/content-preferences", lazy: async () => ({ Component: (await import("@/pages/ContentPreferencesPage")).default }) },
  { path: "/ar/gallery", lazy: async () => ({ Component: (await import("@/pages/ARFilterGalleryPage")).default }) },
];

// ─── Feature Module Route Groups ─────────────────────────────────────
export { insuranceRoutes } from "../features/insurance/insuranceRoutes";
export { taxiRoutes } from "../features/taxi/taxiRoutes";
export { marketplaceRoutes } from "../features/marketplace/marketplaceRoutes";
export { livestreamRoutes } from "../features/livestream/livestreamRoutes";
export { navigationRoutes } from "../features/navigation/navigationRoutes";
export { editorRoutes } from "../features/editor/editorRoutes";
export { chatRoutes } from "../features/chat/chatRoutes";
export { crmRoutes } from "../features/crm/crmRoutes";
export { socialRoutes } from "../features/social/socialRoutes";
export { adsRoutes } from "../features/ads/adsRoutes";

// ─── All app routes ────────────────────────────────────────────────────────────
export const allAppRoutes = (): RouteObject[] => [
  ...publicRoutes(),
  ...adminRoutes().map(r => ({ ...r, handle: { admin: true } })),
  ...protectedRoutes().map(r => ({ ...r, handle: { protected: true } })),
  ...insuranceRoutes(),
  ...taxiRoutes(),
  ...marketplaceRoutes(),
  ...livestreamRoutes(),
  ...navigationRoutes(),
  ...editorRoutes(),
  ...chatRoutes(),
  ...crmRoutes(),
  ...socialRoutes(),
  ...adsRoutes(),
  { path: "*", lazy: async () => ({ Component: (await import("@/pages/NotFound")).default }) },
];
