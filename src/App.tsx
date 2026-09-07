import { Toaster } from "@/shared/components/ui/toaster";
import { Toaster as Sonner } from "@/shared/components/ui/sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { PageLoader } from "@/shared/components/ui/loading";
import { Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import {
  AuthProvider,
  useAuth,
  OrganizationProvider,
  useOrganization,
} from "@/shared/contexts";
import { SearchProvider } from "@/shared/contexts/SearchContext";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import type { Capability } from "@/shared/lib/capabilities";

// Module page imports
import {
  LandingPage,
  AboutPage,
  LocationsPage,
  MinistriesPage,
  MissionPage,
  ConnectPage,
  GivePage,
} from "@/modules/landing";
import { Dashboard, PublicCalendar } from "@/modules/calendar";
import { Admin } from "@/modules/admin";
import { Auth, ForgotPassword, ResetPassword } from "@/modules/auth";
import { Rooms } from "@/modules/rooms";
import { Users } from "@/modules/users";
import { InventoryDashboard } from "@/modules/inventory";
import { BudgetDashboard } from "@/modules/budget";
import {
  MembersDashboard,
  MemberRegistrationPage,
  MemberProfilePage,
  MemberImportPage,
  HouseholdsPage,
} from "@/modules/members";
import { CheckInStationPage, KidsDashboardPage } from "@/modules/kids";
import { GivingDashboard, GivingImportPage } from "@/modules/giving";
import { WorkflowsPage } from "@/modules/workflows";
import { MyChurchPage } from "@/modules/portal";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent background refetches on window focus / reconnect from
      // triggering re-renders that unmount open dialogs & forms.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);
  return null;
}

import { usePasswordChangeRequired } from "@/shared/hooks/usePasswordChangeRequired";
import { ForcePasswordChange } from "@/shared/components/ForcePasswordChange";

const ProtectedRoute = ({
  children,
  adminOnly = false,
  staffOnly = false,
  requireAny,
  fallbackTo = "/dashboard",
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  /**
   * Require a staff app_role tier — admin, contributor, treasury or finance.
   *
   * Everything internal carries this. Without it these routes were gated on
   * authentication alone, so anyone holding the 'member' floor tier could open
   * the budget, the inventory and the approval agenda. The RESTRICTIVE policies
   * in 20260321001600 are what actually deny the data; this stops the app
   * rendering a shell full of empty tables on top of them.
   */
  staffOnly?: boolean;
  /**
   * Module capabilities, any one of which admits the user. Omit for routes
   * gated only by authentication (or by `adminOnly`). Existing call sites are
   * unaffected.
   */
  requireAny?: Capability[];
  /** Where to send an authenticated user who lacks the capability. */
  fallbackTo?: string;
}) => {
  const { user, loading, isAdmin, isStaff } = useAuth();
  const {
    loading: orgLoading,
    currentOrganization,
    error: orgError,
  } = useOrganization();
  const { canAny, loading: capabilitiesLoading } = useCapabilities();
  const {
    required: mustChangePassword,
    loading: passwordCheckLoading,
    recheck: recheckPassword,
  } = usePasswordChangeRequired();

  // Only block on capability loading for routes that actually gate on them,
  // so existing routes keep their current timing.
  if (loading || orgLoading || (requireAny && capabilitiesLoading)) {
    return <PageLoader message="Authenticating..." />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Before ANY other check, including the organization ones below.
  //
  // Someone handed a temporary password must replace it before they reach the
  // app, and they must not be shown "No Organization Found" first — that reads
  // as a broken account and sends them to an administrator instead of to the
  // one screen that would fix it. Placed inside ProtectedRoute so it covers
  // every authenticated route at once, with no URL to skip past.
  if (!passwordCheckLoading && mustChangePassword) {
    return <ForcePasswordChange onChanged={() => void recheckPassword()} />;
  }

  if (orgError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-xl font-semibold text-red-600 mb-2">
          Organization Error
        </h1>
        <p className="text-gray-600 mb-4">{orgError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!currentOrganization) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <h1 className="text-xl font-semibold mb-2">No Organization Found</h1>
        <p className="text-gray-600">
          You are not a member of any organization. Please contact an
          administrator.
        </p>
      </div>
    );
  }

  // Before adminOnly and requireAny. Not to "/" — that would dump somebody
  // back on the public site for the crime of being a member. /my is the
  // portal: their household, their giving, their children's check-ins and
  // their own contact details. It used to be /members, which rendered a
  // self-only panel inside a screen built for the directory.
  if (staffOnly && !isStaff) {
    return <Navigate to="/my" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireAny && !canAny(requireAny)) {
    return <Navigate to={fallbackTo} replace />;
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <OrganizationProvider>
            <SearchProvider>
              <ScrollToTop />
              <Suspense fallback={<PageLoader message="Loading…" />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/locations" element={<LocationsPage />} />
                <Route path="/ministries" element={<MinistriesPage />} />
                <Route path="/mission" element={<MissionPage />} />
                <Route path="/connect" element={<ConnectPage />} />
                <Route path="/give" element={<GivePage />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/public" element={<PublicCalendar />} />
                <Route path="/public/:slug" element={<PublicCalendar />} />

                {/* Calendar module routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute staffOnly>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Admin module routes - staff tiers only */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute staffOnly>
                      <Admin />
                    </ProtectedRoute>
                  }
                />

                {/* Event Review route - staff tiers only */}
                <Route
                  path="/event-reviews"
                  element={
                    <ProtectedRoute staffOnly>
                      <Admin />
                    </ProtectedRoute>
                  }
                />

                {/* Users module routes */}
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute adminOnly>
                      <Users />
                    </ProtectedRoute>
                  }
                />

                {/* Rooms module routes */}
                <Route
                  path="/rooms"
                  element={
                    <ProtectedRoute adminOnly>
                      <Rooms />
                    </ProtectedRoute>
                  }
                />

                {/* Inventory module routes (Coming Soon) - staff tiers only */}
                <Route
                  path="/inventory"
                  element={
                    <ProtectedRoute staffOnly>
                      <InventoryDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Budget module routes (Coming Soon) - staff tiers only */}
                <Route
                  path="/budget"
                  element={
                    <ProtectedRoute staffOnly>
                      <BudgetDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Members module. Deliberately NOT staffOnly — this is the
                    one internal route a 'member' may open, because the page
                    renders the full directory for admins and grant holders and
                    a self-only "My Information" view for everyone else. It is
                    where staffOnly redirects a member to. */}
                <Route
                  path="/members"
                  element={
                    <ProtectedRoute>
                      <MembersDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/members/new"
                  element={
                    <ProtectedRoute requireAny={["members.write"]}>
                      <MemberRegistrationPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/members/import"
                  element={
                    <ProtectedRoute requireAny={["members.import", "members.write"]}>
                      <MemberImportPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/members/households"
                  element={
                    <ProtectedRoute requireAny={["members.read"]}>
                      <HouseholdsPage />
                    </ProtectedRoute>
                  }
                />

                {/* Declared AFTER the literal /members/* paths so they win
                    over the :memberId parameter. */}
                <Route
                  path="/members/:memberId"
                  element={
                    <ProtectedRoute requireAny={["members.read"]}>
                      <MemberProfilePage />
                    </ProtectedRoute>
                  }
                />

                {/* Kids Ministry leader view: live board, classrooms,
                    volunteers and reports. Requires kids.read, which a
                    kids_volunteer deliberately does NOT hold — a volunteer at
                    the desk can check children in but cannot browse the
                    ministry's records. */}
                <Route
                  path="/kids"
                  element={
                    <ProtectedRoute requireAny={["kids.read", "kids.write"]}>
                      <KidsDashboardPage />
                    </ProtectedRoute>
                  }
                />

                {/* Kids check-in station — full-screen kiosk, deliberately
                    OUTSIDE DashboardLayout so there is no nav to wander into. */}
                <Route
                  path="/checkin"
                  element={
                    <ProtectedRoute requireAny={["kids.checkin", "kids.write"]}>
                      <CheckInStationPage />
                    </ProtectedRoute>
                  }
                />

                {/* 404 */}
                {/* Giving module routes.
                    Gated on the giving capability rather than a staff tier: a
                    counter who is otherwise a plain member holds giving_admin
                    additively, exactly as a check-in volunteer holds
                    kids_volunteer, and staffOnly would lock out the people
                    these screens are for. */}
                <Route
                  path="/giving"
                  element={
                    <ProtectedRoute requireAny={["giving.read"]} fallbackTo="/my">
                      <GivingDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/giving/import"
                  element={
                    <ProtectedRoute requireAny={["giving.write"]} fallbackTo="/giving">
                      <GivingImportPage />
                    </ProtectedRoute>
                  }
                />

                {/* Follow-up workflows. members.read admits the connections
                    team; a volunteer holding only assigned cards sees them on
                    /my instead, because church.workflow_board narrows itself
                    to their own cards when they cannot read the module. */}
                <Route
                  path="/workflows"
                  element={
                    <ProtectedRoute requireAny={["members.read"]} fallbackTo="/my">
                      <WorkflowsPage />
                    </ProtectedRoute>
                  }
                />

                {/* The member portal. Authentication only — this is the one
                    internal route every signed-in person is entitled to, and
                    it is where the other guards send somebody who is not. */}
                <Route
                  path="/my"
                  element={
                    <ProtectedRoute>
                      <MyChurchPage />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </SearchProvider>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
