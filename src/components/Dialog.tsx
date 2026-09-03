import { useEffect, useRef, type ReactNode } from 'react';

import { useT } from '../appStore';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Hide the × so a destructive confirm has to be answered by its buttons. */
  hideClose?: boolean;
}

export function Dialog({ title, onClose, children, footer, hideClose }: DialogProps) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    focusFirst(panel.current);

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab') trapTab(event, panel.current);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !hideClose) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <div className="dialog__head">
          <h2 className="dialog__title">{title}</h2>
          {!hideClose && (
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              {t('action.close')}
            </button>
          )}
        </div>
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

interface SheetProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ title, onClose, children }: SheetProps) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    focusFirst(panel.current);
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') trapTab(event, panel.current);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <div className="sheet__grip" />
        {title && (
          <div className="sheet__head">
            <h2 className="sheet__title">{title}</h2>
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              {t('action.close')}
            </button>
          </div>
        )}
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}

/** Focus what the panel marked as its entry point, else the panel itself. */
function focusFirst(panel: HTMLElement | null): void {
  const target = panel?.querySelector<HTMLElement>('[data-autofocus]');
  if (target) target.focus();
  else panel?.focus();
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapTab(event: KeyboardEvent, container: HTMLElement | null): void {
  if (!container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null,
  );
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
