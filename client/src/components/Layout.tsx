import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useThemeCleanup } from "./ThemeToggle";

type IconName = "home" | "bolt" | "users" | "mail" | "send" | "sequence" | "shield" | "globe" | "pin" | "briefcase" | "workflow" | "team" | "check" | "server" | "ban" | "settings" | "menu" | "chevron" | "plus" | "logout";

function NavIcon({ name, className = "h-[18px] w-[18px]" }: { name: IconName; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, JSX.Element> = {
    home: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"/>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 8 8 5a2 2 0 0 0 2 0l8-5"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    sequence: <><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3" cy="6" r=".5" fill="currentColor"/><circle cx="3" cy="12" r=".5" fill="currentColor"/><circle cx="3" cy="18" r=".5" fill="currentColor"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></>,
    workflow: <><rect x="3" y="3" width="6" height="6" rx="2"/><rect x="15" y="15" width="6" height="6" rx="2"/><path d="M9 6h3a3 3 0 0 1 3 3v6M12 18H9a3 3 0 0 1-3-3V9"/></>,
    team: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4.6V21"/></>,
    check: <><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    server: <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></>,
    ban: <><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

interface NavItem { label: string; to: string; icon: IconName; }
interface NavGroup { section: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
  { section: "Workspace", items: [{ label: "Command Center", to: "/command-center", icon: "bolt" }, { label: "Overview", to: "/dashboard", icon: "home" }] },
  { section: "Lead Pipeline", items: [{ label: "Prospects", to: "/leads", icon: "users" }, { label: "Discovery", to: "/lead-engine", icon: "pin" }, { label: "Audits", to: "/audit-tools/hub", icon: "shield" }, { label: "Outreach", to: "/email/campaigns", icon: "send" }, { label: "Meetings", to: "/meetings", icon: "briefcase" }] },
  { section: "Automation", items: [{ label: "Workflows", to: "/automation", icon: "workflow" }, { label: "Sequences", to: "/email/sequences", icon: "sequence" }] },
  { section: "Administration", items: [{ label: "Sender Accounts", to: "/email/senders", icon: "server" }, { label: "Suppression", to: "/email/suppression", icon: "ban" }, { label: "API Setup", to: "/settings/api", icon: "bolt" }, { label: "Settings", to: "/settings/profile", icon: "settings" }] },
];

const pageNames: Array<[string, string]> = [
  ["/command-center", "Command Center"], ["/dashboard", "Overview"], ["/meetings", "Meetings"], ["/lead-engine", "Lead Engine"], ["/leads", "Lead Directory"], ["/email/dashboard", "Email Overview"], ["/email/campaigns", "Campaigns"], ["/email/sequences", "Sequences"], ["/email/senders", "Sender Accounts"], ["/email/suppression", "Suppression"], ["/audit-tools/hub", "Audit Hub"], ["/audit-tools/website", "Website Audit"], ["/audit-tools/gmb", "Local & GBP Audit"], ["/seo/dashboard", "SEO Workspace"], ["/seo/clients", "Clients"], ["/seo/team", "Team"], ["/seo/checklist-templates", "Checklist Templates"], ["/automation", "Workflows"], ["/settings/api", "API Setup"], ["/settings", "Settings"],
];

export function AppLayout() {
  useThemeCleanup();
  const { user, tenant, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("smbify-sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const brandName = "SMBify OS";

  const pageName = useMemo(() => pageNames.find(([path]) => location.pathname.startsWith(path))?.[1] || "Workspace", [location.pathname]);

  function toggleSidebar() {
    setCollapsed((value) => { const next = !value; localStorage.setItem("smbify-sidebar", next ? "collapsed" : "expanded"); return next; });
  }

  const navItem = (item: NavItem, mobile = false) => (
    <NavLink key={item.to} to={item.to} title={collapsed && !mobile ? item.label : undefined} className={({ isActive }) => ["app-nav-item", isActive ? "app-nav-item-active" : "", collapsed && !mobile ? "justify-center px-0" : ""].filter(Boolean).join(" ")}>
      <NavIcon name={item.icon} />
      {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
    </NavLink>
  );

  return (
    <div className="app-shell">
      <aside className={["app-sidebar hidden md:flex", collapsed ? "w-[76px]" : "w-[248px]"].join(" ")}>
        <div className={["flex h-[72px] items-center border-b border-white/10", collapsed ? "justify-center px-3" : "px-4"].join(" ")}>
          <Link to="/command-center" className="flex min-w-0 items-center gap-3">
            <div className="brand-mark">SO</div>
            {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{brandName}</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">Growth workspace</p></div>}
          </Link>
        </div>

        <nav className="app-sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => <div key={group.section} className="mb-4">
            {!collapsed && <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{group.section}</p>}
            <div className="space-y-1">{group.items.map((item) => navItem(item))}</div>
          </div>)}
        </nav>

        <div className="border-t border-white/10 p-3">
          {user && <div className={["mb-2 flex items-center gap-2.5 rounded-xl bg-white/[.06] p-2", collapsed ? "justify-center" : ""].join(" ")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-400/20 text-[11px] font-bold text-indigo-200">{user.name.slice(0, 2).toUpperCase()}</div>
            {!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{user.name}</p><p className="truncate text-[10px] text-slate-400">{tenant?.plan || "workspace"} plan</p></div>}
            {!collapsed && <button type="button" onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Sign out"><NavIcon name="logout" className="h-4 w-4" /></button>}
          </div>}
          <button type="button" onClick={toggleSidebar} className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-medium text-slate-400 hover:bg-white/[.06] hover:text-white"><NavIcon name="chevron" className={["h-4 w-4 transition-transform", collapsed ? "" : "rotate-180"].join(" ")} />{!collapsed && "Collapse sidebar"}</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="app-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} className="topbar-icon md:hidden" aria-label="Open navigation"><NavIcon name="menu" /></button>
            <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-400">{brandName}</p><h1 className="truncate text-sm font-semibold text-slate-900">{pageName}</h1></div>
          </div>
          <div className="flex items-center gap-2">
            
            <Link to="/command-center" className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"><NavIcon name="plus" className="h-4 w-4" /><span className="hidden sm:inline">New command</span></Link>
            <Link to="/settings/profile" className="topbar-icon hidden sm:flex" aria-label="Settings"><NavIcon name="settings" /></Link>
          </div>
        </header>

        <main className="app-main"><div className="mx-auto w-full max-w-[1480px]"><Outlet /></div></main>
      </div>

      {mobileOpen && <div className="fixed inset-0 z-50 md:hidden">
        <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        <aside className="app-sidebar relative flex h-full w-[286px] flex-col shadow-2xl">
          <div className="flex h-[72px] items-center justify-between border-b border-white/10 px-4"><div className="flex items-center gap-3"><div className="brand-mark">SO</div><div><p className="text-sm font-semibold text-white">{brandName}</p><p className="text-[10px] uppercase tracking-wider text-slate-400">Growth workspace</p></div></div><button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close"><span className="text-xl leading-none">×</span></button></div>
          <nav className="app-sidebar-scroll flex-1 overflow-y-auto px-3 py-4">{navGroups.map((group) => <div key={group.section} className="mb-4"><p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{group.section}</p><div className="space-y-1">{group.items.map((item) => navItem(item, true))}</div></div>)}</nav>
        </aside>
      </div>}
    </div>
  );
}