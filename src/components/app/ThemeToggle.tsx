import { MonitorSmartphone, Moon, Sun } from 'lucide-react';

import { useT } from '@/appStore';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Light / dark / follow-system.
 *
 * `icon` sits in the rail; `card` fills the foot of the sidebar, where there is
 * room for the current mode to be written out.
 */
export function ThemeToggle({ variant = 'icon' }: { variant?: 'icon' | 'card' }) {
  const { theme, setTheme } = useTheme();
  const t = useT();

  const label =
    theme === 'dark'
      ? t('settings.themeDark')
      : theme === 'light'
        ? t('settings.themeLight')
        : t('settings.themeSystem');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'card' ? (
          <Button variant="outline" className="w-full justify-start gap-2.5 text-[12.5px]">
            <Sun className="size-4 scale-100 dark:scale-0" />
            <Moon className="absolute size-4 scale-0 dark:scale-100" />
            <span className="truncate">{label}</span>
          </Button>
        ) : (
          <Button variant="muted" size="icon-sm" aria-label={t('settings.theme')}>
            <Sun className="size-5 scale-100 dark:scale-0" />
            <Moon className="absolute size-5 scale-0 dark:scale-100" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => setTheme('light')} data-active={theme === 'light'}>
          <Sun className="size-4" /> {t('settings.themeLight')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} data-active={theme === 'dark'}>
          <Moon className="size-4" /> {t('settings.themeDark')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} data-active={theme === 'system'}>
          <MonitorSmartphone className="size-4" /> {t('settings.themeSystem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
