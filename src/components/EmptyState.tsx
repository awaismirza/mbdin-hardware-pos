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

/**
 * Transient messages. Each is a status region rather than a button: a toast
 * saying "Sale saved" must be announced as a message, not offered as a control
 * — and a toast that is a button also shadows the real buttons underneath it.
 */
export function Toasts() {
  const toasts = useApp((state) => state.toasts);
  const dismiss = useApp((state) => state.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.tone}`}
          role={toast.tone === 'plain' ? 'status' : 'alert'}
          data-testid="toast"
        >
          <span className="toast__text">{toast.message}</span>
          <button
            type="button"
            className="toast__dismiss"
            onClick={() => dismiss(toast.id)}
            aria-label="dismiss"
          >
            ×
          </button>
        </div>
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
