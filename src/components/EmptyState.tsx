import type { ReactNode } from 'react';

import { useApp } from '../appStore';

interface EmptyStateProps {
  /** Points at the next action. "No products yet. Add one, or import a CSV." */
  text: string;
  action?: ReactNode;
}

export function EmptyState({ text, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <p className="empty__text">{text}</p>
      {action}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-hidden="true" />;
}

export function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className={`toast toast--${toast.tone}`}
          onClick={() => dismiss(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__box" />
      <span>{label}</span>
    </button>
  );
}
