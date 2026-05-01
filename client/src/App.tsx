import { useState, createContext, useContext } from "react";
import { Switch, Route, Router, Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AnalyzerPage from "@/pages/analyzer";
import PricingPage from "@/pages/pricing";
import AdminPage from "@/pages/admin";

// Simple user context to share auth state across pages
interface UserState {
  id: number;
  username: string;
  email: string | null;
  isAdmin: boolean | null;
  tier: string;
  tierExpiresAt: string | null;
  totalScans: number;
  monthlyScans: number;
  [key: string]: any;
}

interface UserContextType {
  user: UserState | null;
  setUser: (u: UserState | null) => void;
}

export const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
});

export function useUser() {
  return useContext(UserContext);
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={AnalyzerPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/admin">
        {() => <AdminPage />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState<UserState | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <UserContext.Provider value={{ user: currentUser, setUser: setCurrentUser }}>
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </UserContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
