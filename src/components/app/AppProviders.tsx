import type { ReactNode } from 'react';
import { Direction } from 'radix-ui';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import { useDirection } from '@/hooks/useDirection';

/** Theme, reading direction, tooltips and the toast portal for the whole app. */
export function AppProviders({ children }: { children: ReactNode }) {
  const dir = useDirection();

  return (
    <ThemeProvider>
      <Direction.Provider dir={dir}>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="top-center" dir={dir} />
        </TooltipProvider>
      </Direction.Provider>
    </ThemeProvider>
  );
}
