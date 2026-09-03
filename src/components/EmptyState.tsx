import type { ReactNode } from 'react';

import { Switch as UISwitch } from '@/components/ui/switch';

interface EmptyStateProps {
  /** Points at the next action. "No products yet. Add one, or import a CSV." */
  text: string;
  action?: ReactNode;
}

export function EmptyState({ text, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

export function Spinner() {
  return (
    <span
      role="status"
      aria-hidden="true"
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <UISwitch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
