import type { ComponentType, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, Package, Settings, Users, Wallet } from 'lucide-react';

import { useT } from '@/appStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  to: string;
  labelKey: Parameters<ReturnType<typeof useT>>[0];
  icon: ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { to: '/sell', labelKey: 'nav.sell', icon: Wallet },
  { to: '/stock', labelKey: 'nav.stock', icon: Package },
  { to: '/people', labelKey: 'nav.people', icon: Users },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart3 },
];

/**
 * The app frame. One flex column pinned to the visual viewport; the routed
 * screen is the only thing that scrolls. Bottom tab bar on a phone, left rail
 * from `lg` up. No sticky positioning holds the chrome in place — it is part
 * of the frame by construction, which is what finally makes iOS behave.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div
      data-testid="app-ready"
      className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground"
    >
      <header
        data-testid="app-header"
        className="flex h-14 shrink-0 items-center gap-1 border-b bg-card ps-4 pe-2 pt-[env(safe-area-inset-top)]"
      >
        <button
          type="button"
          onClick={() => navigate('/sell')}
          className="me-auto flex h-full items-center pe-2 text-lg font-semibold tracking-tight text-primary"
        >
          {t('app.name')}
        </button>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/settings')}
          aria-label={t('nav.settings')}
        >
          <Settings className="size-5" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 lg:landscape:flex-row">
        <nav
          data-testid="side-rail"
          aria-label={t('app.name')}
          className="hidden w-24 shrink-0 flex-col items-stretch gap-1 border-e bg-card p-2 lg:landscape:flex"
        >
          {NAV.map((item) => (
            <RailLink key={item.to} item={item} label={t(item.labelKey)} />
          ))}
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>

      <nav
        data-testid="tab-bar"
        aria-label={t('app.name')}
        className="flex shrink-0 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:landscape:hidden"
      >
        {NAV.map((item) => (
          <TabLink key={item.to} item={item} label={t(item.labelKey)} />
        ))}
      </nav>
    </div>
  );
}

function TabLink({ item, label }: { item: NavItem; label: string }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium',
          'min-h-14 text-muted-foreground transition-colors',
          isActive && 'text-primary',
        )
      }
    >
      <Icon className="size-5" />
      {label}
    </NavLink>
  );
}

function RailLink({ item, label }: { item: NavItem; label: string }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-1 rounded-lg px-1 py-3 text-xs font-medium',
          'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          isActive && 'bg-accent text-primary',
        )
      }
    >
      <Icon className="size-5" />
      {label}
    </NavLink>
  );
}
