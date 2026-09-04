import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ScreenProps {
  title?: ReactNode;
  /** 11.5px line under the title. Says what this screen is answering. */
  subtitle?: ReactNode;
  /** Renders a back button before the title. */
  onBack?: () => void;
  /** Trailing controls in the screen header — search, a primary action. */
  actions?: ReactNode;
  /**
   * `true` (default): children sit in a single vertical scroll area — the only
   * scroll container on the screen, one flex level below `main`, which is the
   * layout iOS Safari can be trusted with. `false`: children own their own
   * layout (Sell does this for its split view) but MUST keep to the same rule
   * — every scrollable region is a plain block with `overflow-y-auto min-h-0`.
   */
  scroll?: boolean;
  /** Extra classes on the scroll/content region. */
  className?: string;
  contentClassName?: string;
}

/**
 * A routed screen: a fixed header bar over one scroll region.
 *
 * The header is part of the frame, not `position: sticky` — see AppShell for
 * why that distinction matters on iOS.
 */
export function Screen({
  title,
  subtitle,
  onBack,
  actions,
  scroll = true,
  className,
  contentClassName,
  children,
}: ScreenProps & { children: ReactNode }) {
  const hasHeader = title != null || onBack != null || actions != null;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {hasHeader && (
        <header
          data-testid="app-header"
          className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 pt-[env(safe-area-inset-top)] md:px-4"
        >
          {onBack && (
            <Button variant="muted" size="icon-sm" onClick={onBack} aria-label="Back">
              <ArrowLeft className="size-5 rtl:-scale-x-100" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-extrabold leading-tight tracking-tight">
              {title}
            </h1>
            {subtitle != null && (
              <p className="truncate text-xs text-fg2">{subtitle}</p>
            )}
          </div>
          {actions}
        </header>
      )}

      {scroll ? (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain',
            contentClassName,
          )}
        >
          {children}
        </div>
      ) : (
        <div className={cn('flex min-h-0 flex-1 flex-col', contentClassName)}>{children}</div>
      )}
    </div>
  );
}
