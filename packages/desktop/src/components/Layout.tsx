import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Users, ArrowLeftRight, BarChart2,
  BookOpen, FileText, LayoutDashboard, Settings,
  LogOut, RefreshCw, Wifi, WifiOff, Menu, X, Sun, Moon, Monitor, Building2, AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { useThemeStore, type Theme } from '../store/themeStore';
import { clsx } from 'clsx';
import InstallBanner from './InstallBanner';

const nav = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard',   perm: null },
  { to: '/employees',   icon: Users,            label: 'Staff',       perm: 'staff_profiles:read' },
  { to: '/transfers',   icon: ArrowLeftRight,   label: 'Transfers',   perm: 'transfers:read' },
  { to: '/performance', icon: BarChart2,         label: 'Performance', perm: 'performance:read' },
  { to: '/training',    icon: BookOpen,          label: 'Training',    perm: 'training:read' },
  { to: '/staff-gaps',  icon: AlertTriangle,     label: 'Staff Gaps',  perm: null },
  { to: '/reports',     icon: FileText,          label: 'Reports',     perm: 'reports:read' },
  { to: '/campuses',    icon: Building2,         label: 'Settings',    perm: null },
  { to: '/users',       icon: Settings,          label: 'Users',       perm: 'user_management:read' },
];

export default function Layout() {
  const { user, permissions, logout } = useAuthStore();
  const { syncStatus, triggerSync } = useSyncStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const hasP = (perm: string | null) => !perm || permissions.includes(perm);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const syncIcon = syncStatus.status === 'syncing'
    ? <RefreshCw size={14} className="animate-spin text-brand-400" />
    : syncStatus.status === 'error'
    ? <WifiOff size={14} className="text-red-400" />
    : <Wifi size={14} className="text-emerald-500 dark:text-emerald-400" />;

  const themeOptions: { value: Theme; icon: React.ReactNode; label: string }[] = [
    { value: 'light',  icon: <Sun size={13} />,     label: 'Light' },
    { value: 'dark',   icon: <Moon size={13} />,    label: 'Dark' },
    { value: 'system', icon: <Monitor size={13} />, label: 'System' },
  ];

  /** Shared sidebar inner content used in both desktop aside and mobile drawer */
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/sak.jpg" alt="SAK" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest leading-none">SAK Schools</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">Staff System</p>
            <p className="text-[9px] text-slate-400 dark:text-slate-500">Since 1996</p>
          </div>
        </div>
        {/* Close button — mobile drawer only */}
        <button
          className="md:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded transition-colors flex-shrink-0"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.filter((n) => hasP(n.perm)).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              isActive
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            )}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer — sync status only on desktop */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={triggerSync}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors w-full"
        >
          {syncIcon}
          <span>
            {syncStatus.status === 'syncing' ? 'Syncing…'
              : syncStatus.pendingCount > 0 ? `${syncStatus.pendingCount} pending`
              : 'Synced'}
          </span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* ── Desktop sidebar (md+) ── */}
      <aside className="hidden md:flex w-56 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile sidebar drawer ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer panel */}
          <aside className="relative z-10 w-64 max-w-[80vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Right column: topbar (mobile) + main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* ── Top navbar (all screen sizes) ── */}
        <header className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 h-12">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors rounded"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          {/* Logo — mobile only (desktop has sidebar) */}
          <div className="md:hidden flex items-center gap-2 min-w-0">
            <img src="/sak.jpg" alt="SAK" className="w-6 h-6 rounded object-cover" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">SAK Staff</span>
          </div>

          <div className="flex-1" />

          {/* Sync */}
          <button onClick={triggerSync} title="Sync" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            {syncIcon}
            <span className="hidden sm:inline">{syncStatus.status === 'syncing' ? 'Syncing…' : syncStatus.pendingCount > 0 ? `${syncStatus.pendingCount} pending` : 'Synced'}</span>
          </button>

          {/* Theme toggle */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                title={opt.label}
                className={clsx(
                  'flex items-center justify-center p-1.5 rounded-md text-xs transition-colors',
                  theme === opt.value
                    ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                )}
              >
                {opt.icon}
              </button>
            ))}
          </div>

          {/* User */}
          <div className="flex items-center gap-2 pl-1 border-l border-slate-200 dark:border-slate-700">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-none">{user?.username}</p>
              <p className="text-[10px] text-slate-400">{user?.role?.name}</p>
            </div>
            <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <button onClick={handleLogout} title="Sign out"
              className="p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded">
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Install desktop app banner (browser-only) */}
      <InstallBanner />
    </div>
  );
}
