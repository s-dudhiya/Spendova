import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Admin from "./pages/Admin.tsx";
import Auth from "./pages/Auth.tsx";
import Index from "./pages/Index.tsx";
import InviteAccept from "./pages/InviteAccept.tsx";
import Maintenance from "./pages/Maintenance.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const location = useLocation();
  const [maintenance, setMaintenance] = useState(false);
  const [checkingMaintenance, setCheckingMaintenance] = useState(true);
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    let active = true;
    const checkMaintenance = async () => {
      try {
        const { data, error } = await supabase.from("site_settings").select("is_maintenance_mode").eq("id", 1).single();
        if (error) throw error;
        if (active) setMaintenance(Boolean(data?.is_maintenance_mode));
      } catch (error) {
        console.error("Failed to check maintenance mode", error);
        if (active) setMaintenance(false);
      } finally {
        if (active) setCheckingMaintenance(false);
      }
    };

    checkMaintenance();
    const interval = window.setInterval(checkMaintenance, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (checkingMaintenance && !isAdminRoute) {
    return <div className="grid min-h-screen place-items-center bg-background text-foreground">Loading Spendova...</div>;
  }

  if (maintenance && !isAdminRoute) return <Maintenance />;

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/dashboard" element={<Index />} />
      <Route path="/split" element={<Index />} />
      <Route path="/split/friend/:id" element={<Index />} />
      <Route path="/split/group/:id" element={<Index />} />
      <Route path="/admin" element={<Admin view="root" />} />
      <Route path="/admin/login" element={<Admin view="login" />} />
      <Route path="/admin/dashboard" element={<Admin view="dashboard" />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route path="/forgot-password" element={<Auth mode="forgot" />} />
      <Route path="/reset-password" element={<Auth mode="reset" />} />
      <Route path="/auth" element={<Auth mode="login" />} />
      <Route path="/invite" element={<InviteAccept />} />
      <Route path="/accept-invite" element={<InviteAccept />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
