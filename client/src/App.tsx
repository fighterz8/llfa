import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";
import MissionConsole from "@/pages/MissionConsole";
import LeadsPage from "@/pages/Leads";
import ListsPage from "@/pages/Lists";
import ListDetailPage from "@/pages/ListDetail";
import SettingsPage from "@/pages/Settings";

function Router() {
  return (
    <Switch>
      <Route path="/" component={MissionConsole} />
      <Route path="/leads" component={LeadsPage} />
      <Route path="/lists" component={ListsPage} />
      <Route path="/lists/:id" component={ListDetailPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppLayout>
          <Router />
        </AppLayout>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
