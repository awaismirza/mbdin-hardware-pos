import type { ComponentType, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, Package, Settings, Users, Wallet } from 'lucide-react';

import { useApp, useT } from '@/appStore';
import { useNavCounts } from '@/hooks/useNavCounts';
import { cn } from '@/lib/cn';
import { ThemeToggle } from './ThemeToggle';

type LabelKey = Parameters<ReturnType<typeof useT>>[0];

interface NavItem {
  to: string;
  labelKey: LabelKey;
  shortKey: LabelKey;
  icon: ComponentType<{ className?: string }>;
  /** Which count badge, if any, belongs on this item. */
  badge?: 'lowStock' | 'owing';
}

const NAV: NavItem[] = [
  { to: '/sell', labelKey: 'nav.sell', shortKey: 'nav.sell', icon: Wallet },
  { to: '/stock', labelKey: 'nav.stock', shortKey: 'nav.stock', icon: Package, badge: 'lowStock' },
  { to: '/people', labelKey: 'nav.people', shortKey: 'nav.people', icon: Users, badge: 'owing' },
  { to: '/reports', labelKey: 'nav.reports', shortKey: 'nav.reports', icon: BarChart3 },
  { to: '/settings', labelKey: 'nav.settings', shortKey: 'nav.settings', icon: Settings },
];

/**
 * The app frame.
 *
 * Three shapes of the same chrome, per the design spec: a 248px labelled
 * sidebar from `lg` up, an 88px icon rail at `md`, and a bottom tab bar below
 * that. All three are pinned by construction rather than by `position: sticky`
 * — the whole frame is one `h-dvh` flex box with `overflow-hidden`, and the
 * routed screen owns the only scroll container inside it. That is what finally
 * made iOS Safari stop sliding the tab bar off the bottom of the screen, so it
 * is deliberate: do not reach for `sticky` here.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const counts = useNavCounts();
  const shopName = useApp((state) => state.settings['shop_name']) ?? '';

  const badgeFor = (item: NavItem): number =>
    item.badge === 'lowStock' ? counts.lowStock : item.badge === 'owing' ? counts.owing : 0;

  return (
    <div
      data-testid="app-ready"
      className="flex h-dvh w-full overflow-hidden bg-bg text-fg"
    >
      {/* Desktop / counter: the labelled sidebar. */}
      <aside
        data-testid="side-nav"
        className="hidden w-[248px] shrink-0 flex-col border-e border-line bg-panel pt-[env(safe-area-inset-top)] lg:flex"
      >
        <BrandLockup shopName={shopName} />
        <nav
          aria-label={t('app.name')}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3"
        >
          {NAV.map((item) => (
            <SidebarLink
              key={item.to}
              item={item}
              label={t(item.labelKey)}
              badge={badgeFor(item)}
            />
          ))}
        </nav>
        <div className="mt-auto p-3">
          <ThemeToggle variant="card" />
        </div>
      </aside>

      {/* Tablet: the icon rail. */}
      <aside
        data-testid="side-rail"
        className="hidden w-[88px] shrink-0 flex-col items-center gap-1 border-e border-line bg-panel px-2 pt-[env(safe-area-inset-top)] pb-2 md:flex lg:hidden"
      >
        <span className="mt-3 mb-2 grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand text-base font-extrabold text-on-brand">
          د
        </span>
        <nav
          aria-label={t('app.name')}
          className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto"
        >
          {NAV.map((item) => (
            <RailLink
              key={item.to}
              item={item}
              label={t(item.shortKey)}
              badge={badgeFor(item)}
            />
          ))}
        </nav>
        <ThemeToggle />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>

        {/* Phone: the bottom tab bar. */}
        <nav
          data-testid="tab-bar"
          aria-label={t('app.name')}
          className="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {NAV.map((item) => (
            <TabLink key={item.to} item={item} label={t(item.shortKey)} badge={badgeFor(item)} />
          ))}
        </nav>
      </div>
    </div>
  );
}

function BrandLockup({ shopName }: { shopName: string }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/sell')}
      className="flex flex-col items-start gap-0.5 px-[18px] pt-[18px] pb-3.5 text-start"
    >
      <span className="flex items-center gap-2.5">
        <span className="grid size-[26px] place-items-center rounded-lg bg-brand text-sm font-extrabold text-on-brand">
          د
        </span>
        <span className="text-[16.5px] font-extrabold tracking-tight">{t('app.name')}</span>
      </span>
      {shopName && (
        <span className="ps-[35px] text-xs text-fg2 line-clamp-1">{shopName}</span>
      )}
    </button>
  );
}

/**
 * Spec: 42px tall, 10px radius, a 3px cobalt bar on the start edge of the
 * active item, a `--brand-soft` pill behind it, and a right-aligned count.
 */
function SidebarLink({ item, label, badge }: { item: NavItem; label: string; badge: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex min-h-[42px] items-center gap-2.5 rounded-[10px] px-3 text-sm transition-colors',
          isActive
            ? 'bg-brand-soft font-bold text-brand'
            : 'font-medium text-fg2 hover:bg-panel2 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn('h-4 w-[3px] shrink-0 rounded-sm', isActive ? 'bg-brand' : 'bg-transparent')}
          />
          <Icon className="size-[18px] shrink-0" />
          <span className="flex-1 truncate">{label}</span>
          {badge > 0 && (
            <span
              className={cn(
                'num rounded-full px-[7px] py-0.5 text-[11px] font-semibold',
                isActive ? 'bg-brand text-on-brand' : 'bg-panel2 text-fg2',
              )}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** Spec: an 18×3px cobalt bar above an 11px label — here, above the icon. */
function RailLink({ item, label, badge }: { item: NavItem; label: string; badge: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'relative flex flex-col items-center gap-1 rounded-[11px] px-1 py-2.5 text-[11px] transition-colors',
          isActive ? 'bg-brand-soft font-bold text-brand' : 'font-medium text-fg2 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn('h-[3px] w-[18px] rounded-sm', isActive ? 'bg-brand' : 'bg-transparent')}
          />
          <span className="relative">
            <Icon className="size-5" />
            {badge > 0 && <CountDot value={badge} />}
          </span>
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

/** Spec: a 22×3px bar above a 10.5px label; active cobalt, inactive `--fg2`. */
function TabLink({ item, label, badge }: { item: NavItem; label: string; badge: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex min-h-14 flex-1 flex-col items-center gap-1 pt-2 pb-2.5 text-[10.5px] transition-colors',
          isActive ? 'font-bold text-brand' : 'font-medium text-fg2',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn('h-[3px] w-[22px] rounded-sm', isActive ? 'bg-brand' : 'bg-transparent')}
          />
          <span className="relative">
            <Icon className="size-[18px]" />
            {badge > 0 && <CountDot value={badge} />}
          </span>
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function CountDot({ value }: { value: number }) {
  return (
    <span className="num absolute -end-2.5 -top-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[9.5px] font-bold text-on-brand">
      {value > 99 ? '99+' : value}
    </span>
  );
}
