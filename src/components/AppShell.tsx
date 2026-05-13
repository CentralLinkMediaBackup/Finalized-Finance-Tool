import { type ReactNode, useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, PlusCircle, MessageSquare, BarChart3,
  CalendarDays, Calendar as CalIcon, PiggyBank, Settings as SettingsIcon,
  Moon, Sun, CreditCard, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SettingsDrawer } from "./SettingsDrawer";
import { useApp } from "@/contexts/AppContext";

const tabs = [
  { to: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { to: "/log",       label: "Log Spend",  icon: PlusCircle },
  { to: "/afterpay",  label: "Afterpay",   icon: CreditCard },
  { to: "/wishlist",  label: "Wish List",  icon: Star },
  { to: "/savings",   label: "Savings",    icon: PiggyBank },
  { to: "/jarvis",    label: "Ask Jarvis", icon: MessageSquare },
  { to: "/charts",    label: "Charts",     icon: BarChart3 },
  { to: "/calendar",  label: "Calendar",   icon: CalIcon },
  { to: "/yearly",    label: "Yearly",     icon: CalendarDays },
];

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { settings, updateSettings } = useApp();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = settings.theme;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useDark = stored ? stored === "dark" : prefersDark;
    setDark(useDark);
    document.documentElement.classList.toggle("dark", useDark);
  }, [settings.theme]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    updateSettings({ theme: next ? "dark" : "light" });
  };

  const activeTab = tabs.find((t) => t.to === loc.pathname);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground p-4 gap-1 sticky top-0 h-screen">
        <div className="px-2 py-3 mb-2">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Zack's</div>
          <div className="font-bold text-lg leading-tight">Financial<br />Command Center</div>
        </div>
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-sidebar-accent text-sidebar-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </NavLink>
          );
        })}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 h-14 border-b border-border bg-background/80 backdrop-blur">
          <div className="md:hidden font-semibold text-sm">Command Center</div>
          <div className="hidden md:block text-sm text-muted-foreground">
            {activeTab?.label || ""}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(true)} aria-label="Settings">
              <SettingsIcon className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-6 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — scrollable */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="flex overflow-x-auto scrollbar-none">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium flex-shrink-0 px-3",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {t.label.split(" ")[0]}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <SettingsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

export function PageWrap({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
