"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  Calculator,
  CircleHelp,
  LayoutDashboard,
  Menu,
  Newspaper,
  Radar,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HealthProvider, useHealth } from "./health-provider";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/markets", label: "Market scanner", icon: Radar },
  { href: "/news", label: "News center", icon: Newspaper },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/money-management", label: "Money management", icon: Calculator },
  { href: "/alerts", label: "Alerts center", icon: Bell },
  { href: "/analyst", label: "AI analyst", icon: Sparkles },
  { href: "/intelligence", label: "Intelligence", icon: ChartNoAxesCombined },
];
function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const resize = () => {
      setMobile(media.matches);
      setMenuOpen(false);
    };
    resize();
    media.addEventListener("change", resize);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        toggle.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      media.removeEventListener("change", resize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  const { report, connected } = useHealth();
  const infrastructureReady = connected && report?.status === "healthy";
  return (
    <div className={`app-shell ${collapsed ? "rail-mode" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="brand-group">
          <button
            ref={toggle}
            className="icon-button menu-toggle"
            aria-label={
              mobile
                ? menuOpen
                  ? "Close menu"
                  : "Open menu"
                : collapsed
                  ? "Expand sidebar"
                  : "Collapse sidebar"
            }
            aria-controls="workspace-navigation"
            aria-expanded={mobile ? menuOpen : !collapsed}
            onClick={() =>
              mobile ? setMenuOpen(!menuOpen) : setCollapsed(!collapsed)
            }
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link
            className="brand"
            href="/"
            aria-label="ITrade overview"
            onClick={() => setMenuOpen(false)}
          >
            <span className="brand-mark">
              <ChartNoAxesCombined size={23} strokeWidth={2.5} />
            </span>
            <span>
              itrade<span className="brand-period">.</span>
            </span>
          </Link>
        </div>
        <form
          action="/markets"
          method="get"
          className="global-search"
          role="search"
        >
          <input
            name="search"
            aria-label="Search market symbols"
            placeholder="Search markets"
            autoComplete="off"
            maxLength={20}
          />
          <button type="submit" aria-label="Search markets">
            <Search size={20} />
          </button>
        </form>
        <div className="topbar-right">
          <Link
            href="/settings#connections"
            className={`connection-pill ${infrastructureReady ? "healthy" : ""}`}
          >
            <span className="status-dot" />
            {infrastructureReady
              ? "System online"
              : connected
                ? "Setup needed"
                : "Checking system"}
          </Link>
          <Link href="/alerts" className="icon-button" aria-label="Open alerts">
            <Bell size={21} />
          </Link>
          <Link
            href="/settings"
            className="avatar"
            aria-label="Workspace settings"
          >
            M
          </Link>
        </div>
      </header>
      {menuOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => {
            setMenuOpen(false);
            toggle.current?.focus();
          }}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
      >
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href === "/markets" && pathname.startsWith("/assets/"));
            return (
              <Link
                key={href}
                href={href}
                title={label}
                onClick={() => setMenuOpen(false)}
                className={`nav-item ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={21} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/settings"
            title="Settings"
            onClick={() => setMenuOpen(false)}
            className={`nav-item ${pathname === "/settings" ? "active" : ""}`}
            aria-current={pathname === "/settings" ? "page" : undefined}
          >
            <Settings2 size={21} />
            <span>Settings</span>
          </Link>
          <a
            className="nav-item"
            title="System diagnostics"
            href="/api/health"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={21} />
            <span>System diagnostics</span>
            <ArrowUpRight className="external-icon" size={14} />
          </a>
          <div className="research-note">
            <ShieldCheck size={20} />
            <strong>
              Your decisions.
              <br />
              Your control.
            </strong>
            <p>
              Spot research and monitoring.
              <br />
              Every trade stays with you.
            </p>
          </div>
          <div className="sidebar-version">Personal workspace · v0.1</div>
        </div>
      </aside>
      <div className="workspace">
        <main id="main">{children}</main>
        <footer className="footer">
          <span>
            <ShieldCheck size={14} />
            Read-only research · No trade execution
          </span>
          <span>
            <Activity size={14} />
            {connected && report
              ? `System checked ${new Date(report.checkedAt).toLocaleTimeString()}`
              : "Health connection unavailable"}
          </span>
        </footer>
      </div>
    </div>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <HealthProvider>
      <ShellContent>{children}</ShellContent>
    </HealthProvider>
  );
}
