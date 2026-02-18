import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { ChatOpenProvider } from "@/contexts/ChatOpenContext";
import { VideoCallProvider } from "@/contexts/VideoCallContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlobalCallOverlay } from "@/components/chat/GlobalCallOverlay";
import { createQueryClient } from "@/lib/queryClient";
import { initErrorTracking } from "@/lib/sentry";
import { Loader2 } from "lucide-react";

// Initialize error tracking
initErrorTracking();

// Create query client with circuit breaker
const queryClient = createQueryClient();

// F4: Lazy load heavy pages
const HomePage = lazy(() => import("@/pages/HomePage").then(m => ({ default: m.HomePage })));
const SearchPage = lazy(() => import("@/pages/SearchPage").then(m => ({ default: m.SearchPage })));
const ChatsPage = lazy(() => import("@/pages/ChatsPage").then(m => ({ default: m.ChatsPage })));
const ProfilePage = lazy(() => import("@/pages/ProfilePage").then(m => ({ default: m.ProfilePage })));
const EditProfilePage = lazy(() => import("@/pages/EditProfilePage").then(m => ({ default: m.EditProfilePage })));
const UserProfilePage = lazy(() => import("@/pages/UserProfilePage").then(m => ({ default: m.UserProfilePage })));
const ContactProfilePage = lazy(() => import("@/pages/ContactProfilePage").then(m => ({ default: m.ContactProfilePage })));
const ReelsPage = lazy(() => import("@/pages/ReelsPage").then(m => ({ default: m.ReelsPage })));
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <VideoCallProvider>
        <ChatOpenProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <GlobalCallOverlay />
            <BrowserRouter basename={ROUTER_BASENAME}>
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
                    <Route path="/settings" element={
                      <Suspense fallback={<PageLoader />}>
                        <SettingsPage />
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
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
