import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageLoader } from "@/components/ui/loading";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OrganizationProvider, useOrganization } from "./contexts/OrganizationContext";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Users from "./pages/Users";
import Rooms from "./pages/Rooms";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PublicCalendar from "./pages/PublicCalendar";
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
  const { loading: orgLoading, currentOrganization } = useOrganization();

  if (loading || orgLoading) {
    return <PageLoader message="Authenticating..." />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!currentOrganization) {
    return <PageLoader message="Loading organization..." />;
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
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <Routes>
            <Route path="/" element={<Navigate to="/public" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/public" element={<PublicCalendar />} />
            <Route path="/public/:slug" element={<PublicCalendar />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute adminOnly>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rooms"
              element={
                <ProtectedRoute adminOnly>
                  <Rooms />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
            </Routes>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
