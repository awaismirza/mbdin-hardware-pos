import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface ScreenProps {
  title?: ReactNode;
  /** Renders a back button before the title. */
  onBack?: () => void;
  /** Trailing controls in the screen header. */
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

export function Screen({
  title,
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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
              <ArrowLeft className="size-5 rtl:-scale-x-100" />
            </Button>
          )}
          <h1 className="min-w-0 flex-1 truncate px-1 text-lg font-semibold">{title}</h1>
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
