import { Toaster } from "@/shared/components/ui/toaster";
import { Toaster as Sonner } from "@/shared/components/ui/sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { PageLoader } from "@/shared/components/ui/loading";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import {
  AuthProvider,
  useAuth,
  OrganizationProvider,
  useOrganization,
} from "@/shared/contexts";
import { SearchProvider } from "@/shared/contexts/SearchContext";

// Module page imports
import { Dashboard, PublicCalendar } from "@/modules/calendar";
import { Admin } from "@/modules/admin";
import { Auth, ForgotPassword, ResetPassword } from "@/modules/auth";
import { Rooms } from "@/modules/rooms";
import { Users } from "@/modules/users";
import { InventoryDashboard } from "@/modules/inventory";
import { BudgetDashboard } from "@/modules/budget";
import { MembersDashboard } from "@/modules/members";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) => {
  const { user, loading, isAdmin } = useAuth();
  const {
    loading: orgLoading,
    currentOrganization,
    error: orgError,
  } = useOrganization();

  if (loading || orgLoading) {
    return <PageLoader message="Authenticating..." />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
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

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
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
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Navigate to="/public" replace />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/public" element={<PublicCalendar />} />
                <Route path="/public/:slug" element={<PublicCalendar />} />

                {/* Calendar module routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Admin module routes - accessible to all authenticated users */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <Admin />
                    </ProtectedRoute>
                  }
                />

                {/* Event Review route - accessible to all authenticated users */}
                <Route
                  path="/event-reviews"
                  element={
                    <ProtectedRoute>
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

                {/* Inventory module routes (Coming Soon) - accessible to all authenticated users */}
                <Route
                  path="/inventory"
                  element={
                    <ProtectedRoute>
                      <InventoryDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Budget module routes (Coming Soon) - accessible to all authenticated users */}
                <Route
                  path="/budget"
                  element={
                    <ProtectedRoute>
                      <BudgetDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Members module routes (Coming Soon) */}
                <Route
                  path="/members"
                  element={
                    <ProtectedRoute adminOnly>
                      <MembersDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </SearchProvider>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
