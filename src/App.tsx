import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { useEffect } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { ChatOpenProvider } from "@/contexts/ChatOpenContext";
import { VideoCallProvider } from "@/contexts/VideoCallContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlobalCallOverlay } from "@/components/chat/GlobalCallOverlay";
import { initErrorTracking } from "@/lib/sentry";
import { Loader2 } from "lucide-react";
import { UserSettingsProvider } from "@/contexts/UserSettingsContext";
import { MultiAccountProvider } from "@/contexts/MultiAccountContext";
import { AdminProtectedRoute } from "@/components/admin/AdminProtectedRoute";
import { AppearanceRuntimeProvider } from "@/contexts/AppearanceRuntimeContext";
import { runChatSchemaProbeOnce } from "@/lib/chat/schemaProbe";
import { toast } from "sonner";
const HashtagPage = lazy(() => import("@/pages/HashtagPage").then(m => ({ default: m.HashtagPage })));

// Initialize error tracking
initErrorTracking();

// QueryClient is created per active account inside MultiAccountProvider.

// F4: Lazy load heavy pages
const HomePage = lazy(() => import("@/pages/HomePage").then(m => ({ default: m.HomePage })));
const SearchPage = lazy(() => import("@/pages/SearchPage").then(m => ({ default: m.SearchPage })));
const ChatsPage = lazy(() => import("@/pages/ChatsPage").then(m => ({ default: m.ChatsPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage").then(m => ({ default: m.ProfilePage })));
const EditProfilePage = lazy(() => import("@/pages/EditProfilePage").then(m => ({ default: m.EditProfilePage })));
const CreatorAnalyticsDashboard = lazy(() => import("@/pages/CreatorAnalyticsDashboard").then(m => ({ default: m.default })));
const UserProfilePage = lazy(() => import("@/pages/UserProfilePage").then(m => ({ default: m.UserProfilePage })));
const ContactProfilePage = lazy(() => import("@/pages/ContactProfilePage").then(m => ({ default: m.ContactProfilePage })));
const ReelsPage = lazy(() => import("@/pages/ReelsPage").then(m => ({ default: m.ReelsPage })));
const CreateCenterPage = lazy(() => import("@/pages/CreateCenterPage").then(m => ({ default: m.CreateCenterPage })));
const RealEstatePage = lazy(() => import("@/pages/RealEstatePage").then(m => ({ default: m.RealEstatePage })));
const PropertyDetailPage = lazy(() => import("@/pages/PropertyDetailPage").then(m => ({ default: m.PropertyDetailPage })));
const InsurancePage = lazy(() => import("@/pages/InsurancePage").then(m => ({ default: m.InsurancePage })));
const InsurancePoliciesPage = lazy(() => import("@/pages/InsurancePoliciesPage"));
const ExploreFeedPage = lazy(() => import("@/pages/ExploreFeedPage").then(m => ({ default: m.ExploreFeedPage })));
const PostDetailPage = lazy(() => import("@/pages/PostDetailPage").then(m => ({ default: m.PostDetailPage })));
const AuthPage = lazy(() => import("@/pages/AuthPage").then(m => ({ default: m.AuthPage })));
const NotFound = lazy(() => import("@/pages/NotFound"));
const DevPanelPage = lazy(() => import("@/pages/DevPanelPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const CommandPalette = lazy(() => import("@/components/CommandPalette").then(m => ({ default: m.CommandPalette })));
const ARPage = lazy(() => import("@/pages/ARPage").then(m => ({ default: m.ARPage })));

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
  if (!baseUrl || baseUrl === "/") return "/";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
})();

const App = () => {
  useEffect(() => {
    void (async () => {
      const probe = await runChatSchemaProbeOnce();
      if (probe && probe.ok === false) {
        toast.error("Chat service misconfigured (schema probe failed).", {
          description: "Missing chat RPCs/migrations. Chats are disabled until fixed.",
        });
      }
    })();
  }, []);

  return (
    <MultiAccountProvider>
      <AuthProvider>
        <UserSettingsProvider>
          <AppearanceRuntimeProvider>
            <VideoCallProvider>
              <ChatOpenProvider>
                <TooltipProvider>
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
                  <Routes>
                {/* Public route - Auth page */}
                <Route path="/auth" element={
                  <Suspense fallback={<PageLoader />}>
                    <AuthPage />
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
                </Route>
                
                {/* Protected routes - require authentication */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={
                      <Suspense fallback={<PageLoader />}>
                        <HomePage />
                      </Suspense>
                    } />
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
                    <Route path="/chats" element={
                      <Suspense fallback={<PageLoader />}>
                        <ChatsPage />
                      </Suspense>
                    } />
                    <Route path="/profile" element={
                      <Suspense fallback={<PageLoader />}>
                        <ProfilePage />
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
                    <Route path="/settings" element={
                      <Suspense fallback={<PageLoader />}>
                        <SettingsPage />
                      </Suspense>
                    } />

                    <Route path="/ar" element={
                      <Suspense fallback={<PageLoader />}>
                        <ARPage />
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
                        <InsurancePage />
                      </Suspense>
                    } />
                    <Route path="/insurance/policies" element={
                      <Suspense fallback={<PageLoader />}>
                        <InsurancePoliciesPage />
                      </Suspense>
                    } />
                    <Route path="/reels" element={
                      <Suspense fallback={<PageLoader />}>
                        <ReelsPage />
                      </Suspense>
                    } />

                    <Route path="/create" element={
                      <Suspense fallback={<PageLoader />}>
                        <CreateCenterPage />
                      </Suspense>
                    } />
                  </Route>
                </Route>
                
                {/* Dev Panel - public route with its own auth */}
                <Route path="/dev" element={
                  <Suspense fallback={<PageLoader />}>
                    <DevPanelPage />
                  </Suspense>
                } />
                
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={
                  <Suspense fallback={<PageLoader />}>
                    <NotFound />
                  </Suspense>
                } />
                  </Routes>
                  </BrowserRouter>
                </TooltipProvider>
              </ChatOpenProvider>
            </VideoCallProvider>
          </AppearanceRuntimeProvider>
        </UserSettingsProvider>
      </AuthProvider>
    </MultiAccountProvider>
  );
};

export default App;
