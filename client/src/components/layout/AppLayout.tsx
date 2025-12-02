import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  Activity, 
  Zap,
  Terminal,
  ListChecks
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Mission Console" },
    { href: "/leads", icon: Users, label: "Leads Database" },
    { href: "/lists", icon: ListChecks, label: "My Lists" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <span className="font-bold text-lg tracking-tight">LLFA</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground font-mono">
            v1.0.0-beta // LOCAL
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="bg-muted/50 rounded-md p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
              <Terminal className="h-3 w-3" />
              <span>System Status</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs text-foreground font-mono">Agent Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
