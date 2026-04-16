import { OfflineIndicator } from "@/components/common/OfflineIndicator";
import { PageTransition } from "@/components/layout/PageTransition";
import { SwipeBackGesture } from "@/components/layout/SwipeBackGesture";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { ChatsPage } from "@/pages/ChatsPage";
import { useDeepLinks } from "@/hooks/useDeepLinks";
import { SkipToContent } from "@/components/accessibility/SkipToContent";
import { ColorFilterSVG } from "@/components/accessibility/ColorFilterSVG";
import { AuthProvider } from "@/hooks/useAuth";
import { ChatOpenProvider } from "@/contexts/ChatOpenContext";
import { VideoCallProvider } from "@/contexts/VideoCallContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlobalCallOverlay } from "@/components/chat/GlobalCallOverlay";
import { initErrorTracking } from "@/lib/sentry";
import { initAnalytics, trackPageView } from "@/lib/analytics";
import { Loader2 } from "lucide-react";
import { UserSettingsProvider } from "@/contexts/UserSettingsContext";
import { MultiAccountProvider } from "@/contexts/MultiAccountContext";
import { AccountContainerProvider } from "@/contexts/AccountContainerContext";
import { ReelsProvider } from "@/contexts/ReelsContext";
import { ProfilePage } from "@/pages/ProfilePage";
import { AdminProtectedRoute } from "@/components/admin/AdminProtectedRoute";
import { AppearanceRuntimeProvider } from "@/contexts/AppearanceRuntimeContext";
import { UnifiedCounterProvider } from "@/providers/UnifiedCounterProvider";
import { runChatSchemaProbeOnce } from "@/lib/chat/schemaProbe";
import { initOutbox } from "@/lib/chat/messageOutbox";
import { toast } from "sonner";
import { AppErrorBoundary } from "@/components/system/AppErrorBoundary";
import { RouteErrorBoundary } from "@/components/system/RouteErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useAppActivity } from "@/hooks/useAppActivity";

const HashtagPage = lazy(() => import("@/pages/HashtagPage").then(m => ({ default: m.HashtagPage })));
const ExplorePage = lazy(() => import("@/pages/ExplorePage"));
const ProfessionalDashboard = lazy(() => import("@/pages/ProfessionalDashboard"));
const GuidePage = lazy(() => import("@/pages/GuidePage"));
const FollowRequestsPage = lazy(() => import("@/pages/FollowRequestsPage"));
const LocationPage = lazy(() => import("@/pages/LocationPage"));
const AudioTrackPage = lazy(() => import("@/pages/AudioTrackPage"));

// Initialize error tracking
initErrorTracking();

// Initialize external analytics counters (YM + GA4) — async, non-blocking
void initAnalytics();

// QueryClient is created per active account inside MultiAccountProvider.

// F4: Lazy load heavy pages
const HomePage = lazy(() => import("@/pages/HomePage").then(m => ({ default: m.HomePage })));
const SearchPage = lazy(() => import("@/pages/SearchPage").then(m => ({ default: m.SearchPage })));
const SavedMessagesPage = lazy(() => import("@/pages/SavedMessagesPage").then(m => ({ default: m.SavedMessagesPage })));
const EditProfilePage = lazy(() => import("@/pages/EditProfilePage").then(m => ({ default: m.EditProfilePage })));
const CreatorAnalyticsDashboard = lazy(() => import("@/pages/CreatorAnalyticsDashboard").then(m => ({ default: m.default })));
const UserProfilePage = lazy(() => import("@/pages/UserProfilePage").then(m => ({ default: m.UserProfilePage })));
const ContactProfilePage = lazy(() => import("@/pages/ContactProfilePage").then(m => ({ default: m.ContactProfilePage })));
const CreateCenterPage = lazy(() => import("@/pages/CreateCenterPage").then(m => ({ default: m.CreateCenterPage })));
const CreateSurfacePage = lazy(() => import("@/pages/CreateSurfacePage").then(m => ({ default: m.CreateSurfacePage })));
const RealEstatePage = lazy(() => import("@/pages/RealEstatePage").then(m => ({ default: m.RealEstatePage })));
const PropertyDetailPage = lazy(() => import("@/pages/PropertyDetailPage").then(m => ({ default: m.PropertyDetailPage })));
const InsurancePoliciesPage = lazy(() => import("@/pages/InsurancePoliciesPage"));
const InsuranceHomePage = lazy(() => import("./pages/insurance/InsuranceHomePage"));
const OsagoCalculatorPage = lazy(() => import("./pages/insurance/OsagoCalculatorPage"));
const KaskoCalculatorPage = lazy(() => import("./pages/insurance/KaskoCalculatorPage"));
const DmsCalculatorPage = lazy(() => import("./pages/insurance/DmsCalculatorPage"));
const TravelCalculatorPage = lazy(() => import("./pages/insurance/TravelCalculatorPage"));
const PropertyCalculatorPage = lazy(() => import("./pages/insurance/PropertyCalculatorPage"));
const MortgageCalculatorPage = lazy(() => import("./pages/insurance/MortgageCalculatorPage"));
const LifeCalculatorPage = lazy(() => import("./pages/insurance/LifeCalculatorPage"));
const InsuranceComparePage = lazy(() => import("./pages/insurance/InsuranceComparePage"));
const InsuranceCompaniesPage = lazy(() => import("./pages/insurance/InsuranceCompaniesPage"));
const InsuranceCompanyDetailPage = lazy(() => import("./pages/insurance/InsuranceCompanyDetailPage"));
const InsuranceFaqPage = lazy(() => import("./pages/insurance/InsuranceFaqPage"));
const InsuranceDownloadPage = lazy(() => import("./pages/insurance/InsuranceDownloadPage"));
const InsuranceClaimsPage = lazy(() => import("./pages/insurance/InsuranceClaimsPage"));
const InsuranceNewClaimPage = lazy(() => import("./pages/insurance/InsuranceNewClaimPage"));
const InsurancePolicyDetailPage = lazy(() => import("./pages/insurance/InsurancePolicyDetailPage"));
const InsuranceApplyPage = lazy(() => import("./pages/insurance/InsuranceApplyPage"));
const InsuranceSuccessPage = lazy(() => import("./pages/insurance/InsuranceSuccessPage"));
const InsuranceAgentPage = lazy(() => import("./pages/insurance/InsuranceAgentPage"));
const AccessibilitySettingsPage = lazy(() =>
  import("@/components/accessibility/AccessibilitySettings").then(m => ({ default: m.AccessibilitySettings }))
);
const ShopPage = lazy(() => import("@/pages/ShopPage"));
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const ShopDiscoveryPage = lazy(() => import("@/pages/ShopDiscoveryPage"));
const ContentPreferencesPage = lazy(() => import("@/pages/ContentPreferencesPage"));
const ARFilterGalleryPage = lazy(() => import("@/pages/ARFilterGalleryPage"));
const CreatorFundPage = lazy(() => import("@/pages/CreatorFundPage"));
const CreatorSubscriptionsPage = lazy(() => import("@/pages/CreatorSubscriptionsPage"));
const StoryArchivePage = lazy(() => import("@/pages/StoryArchivePage"));
const ExploreFeedPage = lazy(() => import("@/pages/ExploreFeedPage").then(m => ({ default: m.ExploreFeedPage })));
const PostDetailPage = lazy(() => import("@/pages/PostDetailPage").then(m => ({ default: m.PostDetailPage })));
const AuthPage = lazy(() => import("@/pages/AuthPage").then(m => ({ default: m.AuthPage })));
const NotFound = lazy(() => import("@/pages/NotFound"));
const DevPanelPage = lazy(() => import("@/pages/DevPanelPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const CRMPage = lazy(() => import("@/pages/CRMPage").then(m => ({ default: m.CRMPage })));
const CRMDashboard = lazy(() => import("@/pages/CRMDashboard").then(m => ({ default: m.CRMDashboard })));
const CRMHRDashboard = lazy(() => import("@/pages/CRMHRDashboard").then(m => ({ default: m.CRMHRDashboard })));
const CRMAutoDashboard = lazy(() => import("@/pages/CRMAutoDashboard").then(m => ({ default: m.CRMAutoDashboard })));
const CRMRealEstateDashboard = lazy(() => import("@/pages/CRMRealEstateDashboard").then(m => ({ default: m.CRMRealEstateDashboard })));
const EmailPage = lazy(() => import("@/pages/EmailPage").then(m => ({ default: m.EmailPage })));
const EmailSettingsPage = lazy(() => import("@/pages/EmailSettingsPage").then(m => ({ default: m.EmailSettingsPage })));
const CommandPalette = lazy(() => import("@/components/CommandPalette").then(m => ({ default: m.CommandPalette })));
const ARPage = lazy(() => import("@/pages/ARPage").then(m => ({ default: m.ARPage })));
const AudioRoomsPage = lazy(() => import("@/pages/AudioRoomsPage").then(m => ({ default: m.AudioRoomsPage })));
const BotListPage = lazy(() => import("@/pages/BotListPage").then(m => ({ default: m.BotListPage })));
const BotCreatePage = lazy(() => import("@/pages/BotCreatePage").then(m => ({ default: m.BotCreatePage })));
const BotSettingsPage = lazy(() => import("@/pages/BotSettingsPage").then(m => ({ default: m.BotSettingsPage })));
const MiniAppListPage = lazy(() => import("@/pages/MiniAppListPage").then(m => ({ default: m.MiniAppListPage })));
const DeleteAccountPage = lazy(() => import("@/pages/DeleteAccountPage").then(m => ({ default: m.DeleteAccountPage })));
const ReelsPage = lazy(() => import("./pages/ReelsPage"));
const GoLivePage = lazy(() => import("./pages/GoLivePage"));
const LiveViewerPage = lazy(() => import("./pages/LiveViewerPage"));
const LiveExplorePage = lazy(() => import("./pages/LiveExplorePage"));
const PeopleNearbyPage = lazy(() => import("./pages/PeopleNearbyPage").then(m => ({ default: m.PeopleNearbyPage })));
const BusinessAccountPage = lazy(() => import("./pages/BusinessAccountPage"));
const OrderDetailPage = lazy(() => import("@/pages/OrderDetailPage"));
const AIAssistantPage = lazy(() => import("@/pages/AIAssistantPage"));
const GodmodePage = lazy(() => import("@/pages/GodmodePage"));
const ServiceBugsPage = lazy(() => import("@/pages/ServiceBugsPage").then(m => ({ default: m.ServiceBugsPage })));

// Batch 5: new pages
const WebLoginCallbackPage = lazy(() => import("@/pages/WebLoginCallbackPage").then(m => ({ default: m.WebLoginCallbackPage })));

// Batch 6: offline cache + storage settings
const StorageSettingsPage = lazy(() => import("@/pages/StorageSettingsPage").then(m => ({ default: m.StorageSettingsPage })));

// Taxi module (lazy)
const TaxiHomePage = lazy(() => import("./pages/taxi/TaxiHomePage"));
const TaxiHistoryPage = lazy(() => import("./pages/taxi/TaxiHistoryPage"));
const TaxiSettingsPage = lazy(() => import("./pages/taxi/TaxiSettingsPage"));
const TaxiDriverPage = lazy(() => import("./pages/taxi/TaxiDriverPage"));

// Navigation module (lazy)
const NavigationPage = lazy(() => import("@/pages/navigation/NavigationPage"));

// Video Editor module (lazy)
const EditorProjectsPage = lazy(() => import("@/pages/EditorProjectsPage"));
const EditorPage = lazy(() => import("@/pages/EditorPage"));

const NotificationsPage = lazy(() => import("@/pages/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const NotificationSettingsPage = lazy(() => import("@/pages/NotificationSettingsPage").then(m => ({ default: m.NotificationSettingsPage })));

// Admin Console (lazy)
const AdminLoginPage = lazy(() => import("@/pages/admin/AdminLoginPage").then(m => ({ default: m.AdminLoginPage })));
const AdminHomePage = lazy(() => import("@/pages/admin/AdminHomePage").then(m => ({ default: m.AdminHomePage })));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage").then(m => ({ default: m.AdminUsersPage })));
const AdminAuditPage = lazy(() => import("@/pages/admin/AdminAuditPage").then(m => ({ default: m.AdminAuditPage })));
const AdminApprovalsPage = lazy(() => import("@/pages/admin/AdminApprovalsPage").then(m => ({ default: m.AdminApprovalsPage })));
const OwnerConsolePage = lazy(() => import("@/pages/admin/OwnerConsolePage").then(m => ({ default: m.OwnerConsolePage })));
const SecurityAdminJitPage = lazy(() => import("@/pages/admin/SecurityAdminJitPage").then(m => ({ default: m.SecurityAdminJitPage })));
const AdminVerificationsPage = lazy(() => import("@/pages/admin/AdminVerificationsPage").then(m => ({ default: m.AdminVerificationsPage })));
const AdminStaffProfilesPage = lazy(() => import("@/pages/admin/AdminStaffProfilesPage").then(m => ({ default: m.AdminStaffProfilesPage })));
const AdminHashtagModerationPage = lazy(() => import("@/pages/admin/AdminHashtagModerationPage").then(m => ({ default: m.AdminHashtagModerationPage })));
const KpiDashboardPage = lazy(() => import("@/pages/admin/KpiDashboardPage").then(m => ({ default: m.KpiDashboardPage })));
const ModerationQueuePage = lazy(() => import("@/pages/admin/ModerationQueuePage").then(m => ({ default: m.ModerationQueuePage })));
const AppealsPage = lazy(() => import("@/pages/admin/AppealsPage").then(m => ({ default: m.AppealsPage })));

// Deep link handler — must be inside BrowserRouter
function DeepLinkHandler() {
  useDeepLinks();
  return null;
}

// Analytics router — tracks SPA page views on every location change.
// Must be rendered inside <BrowserRouter>.
function AnalyticsRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView({
      url: window.location.href,
      title: document.title,
    });
  }, [location.pathname, location.search]);
  return null;
}

function AppActivityTracker() {
  useAppActivity();
  return null;
}

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

const ROUTER_BASENAME = (() => {
  const baseUrl = import.meta.env.BASE_URL;
  if (!baseUrl || baseUrl === "/" || baseUrl === "./") {
    if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
      const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
      if (firstSegment) return `/${firstSegment}`;
    }
    return "/";
  }
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
})();

const App = () => {
  useEffect(() => {
    // Start offline message outbox flush loop (idempotent, no-op on re-render)
    initOutbox();

    void (async () => {
      const probe = await runChatSchemaProbeOnce();
      const isConfirmedSchemaMismatch =
        probe?.ok === false && probe?.required_objects_present === false;
      if (isConfirmedSchemaMismatch) {
        toast.error("Чат временно недоступен", {
          description: "Мы уже работаем над восстановлением. Попробуйте позже.",
        });
      }
    })();
  }, []);

  return (
    <AppErrorBoundary>
<AccountContainerProvider>
<MultiAccountProvider>
<AuthProvider>
<UserSettingsProvider>
<UnifiedCounterProvider>
<AppearanceRuntimeProvider>
  <ReelsProvider>
  <VideoCallProvider>
    <ChatOpenProvider>
      <TooltipProvider>
        <SkipToContent />
        <ColorFilterSVG />
        {/* aria-live region для screen reader */}
        <div
          id="a11y-live-region"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        />
        <Toaster />
        <Sonner />
        <GlobalCallOverlay />
                    <BrowserRouter
                      basename={ROUTER_BASENAME}
                      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
                    >
                  <Suspense fallback={null}>
                    <CommandPalette />
                  </Suspense>
                  <DeepLinkHandler />
                  <AnalyticsRouteTracker />
                  <AppActivityTracker />
                  <OfflineIndicator />
                  <SwipeBackGesture>
                  <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
                  <PageTransition>
                  <Routes>
                {/* Public route - Auth page */}
                <Route path="/auth" element={
                  <Suspense fallback={<PageLoader />}>
                    <AuthPage />
                  </Suspense>
                } />

                {/* Web Login Widget — public, shown in popup */}
                <Route path="/auth/web-login" element={
                  <Suspense fallback={<PageLoader />}>
                    <WebLoginCallbackPage />
                  </Suspense>
                } />

                {/* Admin Console - login is public, everything else requires admin */}
                <Route path="/admin/login" element={
                  <Suspense fallback={<PageLoader />}>
                    <AdminLoginPage />
                  </Suspense>
                } />
                <Route element={<AdminProtectedRoute />}>
                  <Route path="/admin" element={
                    <Suspense fallback={<PageLoader />}>
                      <AdminHomePage />
                    </Suspense>
                  } />
                  <Route path="/admin/admins" element={
                    <Suspense fallback={<PageLoader />}>
                      <AdminUsersPage />
                    </Suspense>
                  } />
                  <Route path="/admin/audit" element={
                    <Suspense fallback={<PageLoader />}>
                      <AdminAuditPage />
                    </Suspense>
                  } />
                  <Route path="/admin/approvals" element={
                    <Suspense fallback={<PageLoader />}>
                      <AdminApprovalsPage />
                    </Suspense>
                  } />
                  <Route path="/admin/owner" element={
                    <Suspense fallback={<PageLoader />}>
                      <OwnerConsolePage />
                    </Suspense>
                  } />
                  <Route path="/admin/verifications" element={
                    <Suspense fallback={<PageLoader />}>
                      <AdminVerificationsPage />
                    </Suspense>
                  } />
                  <Route path="/admin/staff-profiles" element={
                    <Suspense fallback={<PageLoader />}>
                      <AdminStaffProfilesPage />
                    </Suspense>
                  } />
                  <Route path="/admin/hashtags" element={
                    <Suspense fallback={<PageLoader />}>
                      <AdminHashtagModerationPage />
                    </Suspense>
                  } />
                  <Route path="/admin/jit" element={
                    <Suspense fallback={<PageLoader />}>
                      <SecurityAdminJitPage />
                    </Suspense>
                  } />
                  <Route path="/admin/kpi-dashboard" element={
                    <Suspense fallback={<PageLoader />}>
                      <KpiDashboardPage />
                    </Suspense>
                  } />
                  <Route path="/admin/moderation-queue" element={
                    <Suspense fallback={<PageLoader />}>
                      <ModerationQueuePage />
                    </Suspense>
                  } />
                  <Route path="/admin/appeals" element={
                    <Suspense fallback={<PageLoader />}>
                      <AppealsPage />
                    </Suspense>
                  } />
                </Route>

                {/* G0DM0D3 — публичный, использует свой API key */}
                <Route path="/godmode" element={
                  <Suspense fallback={<PageLoader />}>
                    <GodmodePage />
                  </Suspense>
                } />
                
                {/* Protected routes - require authentication */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={
                      <ErrorBoundary section="Лента">
                        <Suspense fallback={<PageLoader />}>
                          <HomePage />
                        </Suspense>
                      </ErrorBoundary>
                    } />
                    <Route path="/feed" element={<Navigate to="/" replace />} />
                    <Route path="/search" element={
                      <Suspense fallback={<PageLoader />}>
                        <SearchPage />
                      </Suspense>
                    } />

                    <Route path="/hashtag/:tag" element={
                      <Suspense fallback={<PageLoader />}>
                        <HashtagPage />
                      </Suspense>
                    } />
                    <Route path="/explore" element={
                      <Suspense fallback={<PageLoader />}>
                        <ExplorePage />
                      </Suspense>
                    } />
                    <Route path="/explore/:postIndex" element={
                      <Suspense fallback={<PageLoader />}>
                        <ExploreFeedPage />
                      </Suspense>
                    } />
                    <Route path="/post/:id" element={
                      <Suspense fallback={<PageLoader />}>
                        <PostDetailPage />
                      </Suspense>
                    } />
                    <Route path="/notifications" element={
                      <Suspense fallback={<PageLoader />}>
                        <NotificationsPage />
                      </Suspense>
                    } />
                    <Route path="/notifications/settings" element={
                      <Suspense fallback={<PageLoader />}>
                        <NotificationSettingsPage />
                      </Suspense>
                    } />
                    <Route path="/chats" element={
                      <RouteErrorBoundary>
                        <Suspense fallback={<PageLoader />}>
                          <ChatsPage />
                        </Suspense>
                      </RouteErrorBoundary>
                    } />
                    <Route path="/saved-messages" element={
                      <RouteErrorBoundary>
                        <Suspense fallback={<PageLoader />}>
                          <SavedMessagesPage />
                        </Suspense>
                      </RouteErrorBoundary>
                    } />
                    <Route path="/profile" element={
                      <RouteErrorBoundary>
                        <Suspense fallback={<PageLoader />}>
                          <ProfilePage />
                        </Suspense>
                      </RouteErrorBoundary>
                    } />
                    <Route path="/delete-account" element={
                      <Suspense fallback={<PageLoader />}>
                        <DeleteAccountPage />
                      </Suspense>
                    } />
                    <Route path="/people-nearby" element={
                      <Suspense fallback={<PageLoader />}>
                        <PeopleNearbyPage />
                      </Suspense>
                    } />
                    <Route path="/business" element={
                      <Suspense fallback={<PageLoader />}>
                        <BusinessAccountPage />
                      </Suspense>
                    } />
                    <Route path="/profile/edit" element={
                      <Suspense fallback={<PageLoader />}>
                        <EditProfilePage />
                      </Suspense>
                    } />
                    <Route path="/analytics" element={
                      <Suspense fallback={<PageLoader />}>
                        <CreatorAnalyticsDashboard />
                      </Suspense>
                    } />
                    <Route path="/professional-dashboard" element={
                      <Suspense fallback={<PageLoader />}>
                        <ProfessionalDashboard />
                      </Suspense>
                    } />
                    <Route path="/guides/:id" element={
                      <Suspense fallback={<PageLoader />}>
                        <GuidePage />
                      </Suspense>
                    } />
                    <Route path="/follow-requests" element={
                      <Suspense fallback={<PageLoader />}>
                        <FollowRequestsPage />
                      </Suspense>
                    } />
                    <Route path="/location/:id" element={
                      <Suspense fallback={<PageLoader />}>
                        <LocationPage />
                      </Suspense>
                    } />
                    <Route path="/shop" element={
                      <Suspense fallback={<PageLoader />}>
                        <ShopPage />
                      </Suspense>
                    } />
                    <Route path="/shop/:shopId" element={
                      <Suspense fallback={<PageLoader />}>
                        <ShopPage />
                      </Suspense>
                    } />
                    <Route path="/checkout" element={
                      <Suspense fallback={<PageLoader />}>
                        <CheckoutPage />
                      </Suspense>
                    } />
                    <Route path="/shop/discover" element={
                      <Suspense fallback={<PageLoader />}>
                        <ShopDiscoveryPage />
                      </Suspense>
                    } />
                    <Route path="/content-preferences" element={
                      <Suspense fallback={<PageLoader />}>
                        <ContentPreferencesPage />
                      </Suspense>
                    } />
                    <Route path="/ar/gallery" element={
                      <Suspense fallback={<PageLoader />}>
                        <ARFilterGalleryPage />
                      </Suspense>
                    } />
                    <Route path="/orders/:id" element={
                      <Suspense fallback={<PageLoader />}>
                        <OrderDetailPage />
                      </Suspense>
                    } />
                    <Route path="/creator-fund" element={
                      <Suspense fallback={<PageLoader />}>
                        <CreatorFundPage />
                      </Suspense>
                    } />
                    <Route path="/creator-subscriptions" element={
                      <Suspense fallback={<PageLoader />}>
                        <CreatorSubscriptionsPage />
                      </Suspense>
                    } />
                    <Route path="/creator-subscriptions/:creatorId" element={
                      <Suspense fallback={<PageLoader />}>
                        <CreatorSubscriptionsPage />
                      </Suspense>
                    } />
                    <Route path="/story-archive" element={
                      <Suspense fallback={<PageLoader />}>
                        <StoryArchivePage />
                      </Suspense>
                    } />
                    <Route path="/settings" element={
                      <ErrorBoundary section="Настройки">
                        <Suspense fallback={<PageLoader />}>
                          <SettingsPage />
                        </Suspense>
                      </ErrorBoundary>
                    } />
                    <Route path="/settings/accessibility" element={
                      <Suspense fallback={<PageLoader />}>
                        <AccessibilitySettingsPage />
                      </Suspense>
                    } />

                    {/* Batch 5: additional settings & channel routes */}
                    <Route path="/settings/business" element={
                      <Suspense fallback={<PageLoader />}>
                        <BusinessAccountPage />
                      </Suspense>
                    } />

                    <Route path="/create-surface" element={
                      <Suspense fallback={<PageLoader />}>
                        <CreateSurfacePage />
                      </Suspense>
                    } />
                    <Route path="/ar" element={
                      <Suspense fallback={<PageLoader />}>
                        <ARPage />
                      </Suspense>
                    } />
                    <Route path="/audio-rooms" element={
                      <Suspense fallback={<PageLoader />}>
                        <AudioRoomsPage />
                      </Suspense>
                    } />
                    <Route path="/audio-rooms/:roomId" element={
                      <Suspense fallback={<PageLoader />}>
                        <AudioRoomsPage />
                      </Suspense>
                    } />

                    <Route path="/audio/:trackTitle" element={
                      <Suspense fallback={<PageLoader />}>
                        <AudioTrackPage />
                      </Suspense>
                    } />

                    {/* Bot Platform Routes */}
                    <Route path="/bots" element={
                      <Suspense fallback={<PageLoader />}>
                        <BotListPage />
                      </Suspense>
                    } />
                    <Route path="/bots/new" element={
                      <Suspense fallback={<PageLoader />}>
                        <BotCreatePage />
                      </Suspense>
                    } />
                    <Route path="/bots/:id" element={
                      <Suspense fallback={<PageLoader />}>
                        <BotSettingsPage />
                      </Suspense>
                    } />
                    <Route path="/mini-apps" element={
                      <Suspense fallback={<PageLoader />}>
                        <MiniAppListPage />
                      </Suspense>
                    } />

                    <Route path="/user/:username" element={
                      <Suspense fallback={<PageLoader />}>
                        <UserProfilePage />
                      </Suspense>
                    } />
                    <Route path="/contact/:userId" element={
                      <Suspense fallback={<PageLoader />}>
                        <ContactProfilePage />
                      </Suspense>
                    } />
                    <Route path="/realestate" element={
                      <Suspense fallback={<PageLoader />}>
                        <RealEstatePage />
                      </Suspense>
                    } />
                    <Route path="/realestate/:id" element={
                      <Suspense fallback={<PageLoader />}>
                        <PropertyDetailPage />
                      </Suspense>
                    } />
                    <Route path="/insurance" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceHomePage />
                      </Suspense>
                    } />
                    <Route path="/insurance/osago" element={
                      <Suspense fallback={<PageLoader />}>
                        <OsagoCalculatorPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/kasko" element={
                      <Suspense fallback={<PageLoader />}>
                        <KaskoCalculatorPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/dms" element={
                      <Suspense fallback={<PageLoader />}>
                        <DmsCalculatorPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/travel" element={
                      <Suspense fallback={<PageLoader />}>
                        <TravelCalculatorPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/property" element={
                      <Suspense fallback={<PageLoader />}>
                        <PropertyCalculatorPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/mortgage" element={
                      <Suspense fallback={<PageLoader />}>
                        <MortgageCalculatorPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/life" element={
                      <Suspense fallback={<PageLoader />}>
                        <LifeCalculatorPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/compare" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceComparePage />
                      </Suspense>
                    } />
                    <Route path="/insurance/companies" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceCompaniesPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/policies" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsurancePoliciesPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/policy/:id" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsurancePolicyDetailPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/apply/:productId" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceApplyPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/apply" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceApplyPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/success/:policyId" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceSuccessPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/agent" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceAgentPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/company/:slug" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceCompanyDetailPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/faq" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceFaqPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/download" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceDownloadPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/claims" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceClaimsPage />
                      </Suspense>
                    } />
                    <Route path="/insurance/claims/new" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsuranceNewClaimPage />
                      </Suspense>
                    } />
                    <Route path="/crm" element={
                      <Suspense fallback={<PageLoader />}>
                        <CRMPage />
                      </Suspense>
                    } />
                    <Route path="/crm/dashboard" element={
                      <Suspense fallback={<PageLoader />}>
                        <CRMDashboard />
                      </Suspense>
                    } />
                    <Route path="/crm/hr" element={
                      <Suspense fallback={<PageLoader />}>
                        <CRMHRDashboard />
                      </Suspense>
                    } />
                    <Route path="/crm/auto" element={
                      <Suspense fallback={<PageLoader />}>
                        <CRMAutoDashboard />
                      </Suspense>
                    } />
                    <Route path="/crm/realestate" element={
                      <Suspense fallback={<PageLoader />}>
                        <CRMRealEstateDashboard />
                      </Suspense>
                    } />
                    <Route path="/email/settings" element={
                      <Suspense fallback={<PageLoader />}>
                        <EmailSettingsPage />
                      </Suspense>
                    } />
                    <Route path="/email" element={
                      <ErrorBoundary section="Почта">
                        <Suspense fallback={<PageLoader />}>
                          <EmailPage />
                        </Suspense>
                      </ErrorBoundary>
                    } />
                    <Route path="/services/bugs" element={
                      <Suspense fallback={<PageLoader />}>
                        <ServiceBugsPage />
                      </Suspense>
                    } />
                    {/* ─── Taxi Module ─────────────────────── */}
                    <Route path="/taxi" element={
                      <Suspense fallback={<PageLoader />}>
                        <TaxiHomePage />
                      </Suspense>
                    } />
                    <Route path="/taxi/history" element={
                      <Suspense fallback={<PageLoader />}>
                        <TaxiHistoryPage />
                      </Suspense>
                    } />
                    <Route path="/taxi/settings" element={
                      <Suspense fallback={<PageLoader />}>
                        <TaxiSettingsPage />
                      </Suspense>
                    } />
                    <Route path="/taxi/driver" element={
                      <Suspense fallback={<PageLoader />}>
                        <TaxiDriverPage />
                      </Suspense>
                    } />
                    <Route path="/ai-assistant" element={
                      <Suspense fallback={<PageLoader />}>
                        <AIAssistantPage />
                      </Suspense>
                    } />

                    <Route path="/create" element={
                      <Suspense fallback={<PageLoader />}>
                        <CreateCenterPage />
                      </Suspense>
                    } />
                    <Route path="/reels" element={
                      <RouteErrorBoundary>
                        <Suspense fallback={<PageLoader />}>
                          <ReelsPage />
                        </Suspense>
                      </RouteErrorBoundary>
                    } />

                    {/* ─── Livestream Module ────────────────── */}
                    <Route path="/live" element={
                      <Suspense fallback={<PageLoader />}>
                        <GoLivePage />
                      </Suspense>
                    } />
                    <Route path="/live/explore" element={
                      <Suspense fallback={<PageLoader />}>
                        <LiveExplorePage />
                      </Suspense>
                    } />
                    <Route path="/live/:sessionId" element={
                      <Suspense fallback={<PageLoader />}>
                        <LiveViewerPage />
                      </Suspense>
                    } />

                    {/* ─── Video Editor Module ────────────── */}
                    <Route path="/editor" element={
                      <Suspense fallback={<PageLoader />}>
                        <EditorProjectsPage />
                      </Suspense>
                    } />
                  </Route>

                  {/* Video Editor — fullscreen, outside AppLayout */}
                  <Route path="/editor/:projectId" element={
                    <Suspense fallback={<PageLoader />}>
                      <EditorPage />
                    </Suspense>
                  } />

                  {/* Navigation — fullscreen, outside AppLayout */}
                  <Route path="/navigation" element={
                    <Suspense fallback={<PageLoader />}>
                      <NavigationPage />
                    </Suspense>
                  } />
                </Route>
                
                {/* Dev Panel - public route with its own auth */}
                <Route path="/dev" element={
                  <Suspense fallback={<PageLoader />}>
                    <DevPanelPage />
                  </Suspense>
                } />
                
                {/* Batch 6: Storage Settings */}
                <Route path="/storage-settings" element={
                  <Suspense fallback={<PageLoader />}>
                    <StorageSettingsPage />
                  </Suspense>
                } />

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={
                  <Suspense fallback={<PageLoader />}>
                    <NotFound />
                  </Suspense>
                } />
                  </Routes>
                  </PageTransition>
                  </div>
                  </SwipeBackGesture>
                    </BrowserRouter>
                  </TooltipProvider>
                </ChatOpenProvider>
              </VideoCallProvider>
            </ReelsProvider>
            </AppearanceRuntimeProvider>
          </UnifiedCounterProvider>
          </UserSettingsProvider>
        </AuthProvider>
      </MultiAccountProvider>
          </AccountContainerProvider>
    </AppErrorBoundary>
  );
};

export default App;
