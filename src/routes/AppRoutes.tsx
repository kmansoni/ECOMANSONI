/**
 * AppRoutes — Modular route configuration.
 *
 * Extracts route definitions from App.tsx for maintainability.
 * Routes are organized by feature module and loaded via lazy().
 */

import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

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
  { path: "/legal/terms", lazy: async () => ({ Component: (await import("@/pages/TermsOfServicePage")).TermsOfServicePage }) },
  { path: "/legal/privacy", lazy: async () => ({ Component: (await import("@/pages/PrivacyPolicyPage")).PrivacyPolicyPage }) },
  { path: "/auth/web-login", lazy: async () => ({ Component: (await import("@/pages/WebLoginCallbackPage")).WebLoginCallbackPage }) },
  { path: "/preview/icons", lazy: async () => ({ Component: (await import("@/pages/IconPreviewPage")).IconPreviewPage }) },
  { path: "/preview/design", lazy: async () => ({ Component: (await import("@/pages/DesignSystemPage")).DesignSystemPage }) },
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
  { path: "/feed", lazy: async () => ({ Component: () => (await import("react-router-dom")).Navigate({ to: "/", replace: true }) }) },
  { path: "/search", lazy: async () => ({ Component: (await import("@/pages/SearchPage")).SearchPage }) },
  { path: "/hashtag/:tag", lazy: async () => ({ Component: (await import("@/pages/HashtagPage")).HashtagPage }) },
  { path: "/explore", lazy: async () => ({ Component: (await import("@/pages/ExplorePage")).ExplorePage }) },
  { path: "/notifications", lazy: async () => ({ Component: (await import("@/pages/NotificationsPage")).NotificationsPage }) },
  { path: "/chats", lazy: async () => ({ Component: (await import("@/pages/ChatsPage")).ChatsPage }) },
  { path: "/profile", lazy: async () => ({ Component: (await import("@/pages/ProfilePage")).ProfilePage }) },
  { path: "/settings", lazy: async () => ({ Component: (await import("@/pages/SettingsPage")).SettingsPage }) },
  { path: "/reels", lazy: async () => ({ Component: (await import("@/pages/ReelsPage")).default }) },
  { path: "/dev", lazy: async () => ({ Component: (await import("@/pages/DevPanelPage")).DevPanelPage }) },
  { path: "/crisis-mesh", lazy: async () => ({ Component: (await import("@/pages/CrisisMeshPage")).CrisisMeshPage }) },
  // Real estate
  { path: "/realestate", lazy: async () => ({ Component: (await import("@/pages/RealEstatePage")).default }) },
  { path: "/realestate/:id", lazy: async () => ({ Component: (await import("@/pages/PropertyDetailPage")).default }) },
  { path: "/location/:id", lazy: async () => ({ Component: (await import("@/pages/LocationPage")).LocationPage }) },
  { path: "/professional-dashboard", lazy: async () => ({ Component: (await import("@/pages/ProfessionalDashboard")).ProfessionalDashboard }) },
  { path: "/guides/:id", lazy: async () => ({ Component: (await import("@/pages/GuidePage")).GuidePage }) },
  { path: "/create-surface", lazy: async () => ({ Component: (await import("@/pages/CreateSurfacePage")).CreateSurfacePage }) },
  // Shop core
  { path: "/shop", lazy: async () => ({ Component: (await import("@/pages/ShopPage")).ShopPage }) },
  { path: "/shop/:shopId", lazy: async () => ({ Component: (await import("@/pages/ShopPage")).ShopPage }) },
  { path: "/checkout", lazy: async () => ({ Component: (await import("@/pages/CheckoutPage")).CheckoutPage }) },
  { path: "/shop/orders", lazy: async () => ({ Component: (await import("@/pages/ShopOrdersPage")).ShopOrdersPage }) },
  { path: "/shop/returns", lazy: async () => ({ Component: (await import("@/pages/ShopReturnsPage")).ShopReturnsPage }) },
  { path: "/shop/discover", lazy: async () => ({ Component: (await import("@/pages/ShopDiscoveryPage")).ShopDiscoveryPage }) },
  { path: "/orders/:id", lazy: async () => ({ Component: (await import("@/pages/OrderDetailPage")).OrderDetailPage }) },
  { path: "/content-preferences", lazy: async () => ({ Component: (await import("@/pages/ContentPreferencesPage")).ContentPreferencesPage }) },
  { path: "/ar/gallery", lazy: async () => ({ Component: (await import("@/pages/ARFilterGalleryPage")).ARFilterGalleryPage }) },
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
  { path: "*", lazy: async () => ({ Component: (await import("@/pages/NotFound")).NotFound }) },
];