import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';

import { useT } from '@/appStore';
import { Button } from '@/components/ui/button';
import { formatPKR, parsePaisa, TENDER_DENOMINATIONS } from '@/lib/money';

interface NumberPadProps {
  /** Starting text, in plain rupees or plain units — no symbol, no grouping. */
  initial?: string;
  /** Show a decimal key. Off for piece counts, on for weighed goods and money. */
  allowDecimal?: boolean;
  /** Render the quick denomination row, for cash tender. */
  denominations?: boolean;
  /** Live line under the display, e.g. change due. */
  hint?: string;
  label?: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * A keypad, not a keyboard. The tablet's own keyboard covers half a landscape
 * screen and its decimal key varies by locale, so amounts and weights are typed
 * here.
 */
export function NumberPad({
  initial = '',
  allowDecimal = true,
  denominations = false,
  hint,
  label,
  confirmLabel,
  onConfirm,
  onCancel,
}: NumberPadProps) {
  const t = useT();
  const [text, setText] = useState(initial);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (/^[0-9]$/.test(event.key)) push(event.key);
      else if (event.key === '.' && allowDecimal) push('.');
      else if (event.key === 'Backspace') setText((value) => value.slice(0, -1));
      else if (event.key === 'Enter') onConfirm(text);
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [text, allowDecimal, onConfirm]);

  function push(key: string): void {
    setText((value) => {
      if (key === '.') {
        if (value.includes('.')) return value;
        return value === '' ? '0.' : `${value}.`;
      }
      const [, fraction] = value.split('.');
      if (fraction !== undefined && fraction.length >= 2) return value;
      if (value === '0') return key;
      if (value.length >= 12) return value;
      return value + key;
    });
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="grid gap-3">
      {label && <div className="text-sm text-muted-foreground">{label}</div>}
      <div
        className="num flex h-14 items-center justify-end rounded-lg border bg-muted/40 px-4 text-2xl font-semibold tabular-nums"
        aria-live="polite"
      >
        {text || '0'}
      </div>
      {hint && <div className="text-end text-sm text-muted-foreground">{hint}</div>}

      {denominations && (
        <div className="grid grid-cols-3 gap-2">
          {TENDER_DENOMINATIONS.map((paisa) => (
            <Button
              key={paisa}
              variant="outline"
              className="num"
              onClick={() => setText(String(paisa / 100))}
            >
              {formatPKR(paisa, { symbol: false })}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className="h-14 rounded-lg border bg-card text-xl font-semibold tabular-nums active:bg-muted"
            onClick={() => push(key)}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          className="h-14 rounded-lg border bg-card text-xl font-semibold active:bg-muted disabled:opacity-40"
          onClick={() => push('.')}
          disabled={!allowDecimal}
          aria-label="decimal point"
        >
          .
        </button>
        <button
          type="button"
          className="h-14 rounded-lg border bg-card text-xl font-semibold tabular-nums active:bg-muted"
          onClick={() => push('0')}
        >
          0
        </button>
        <button
          type="button"
          className="grid h-14 place-items-center rounded-lg border bg-card active:bg-muted"
          onClick={() => setText((value) => value.slice(0, -1))}
          aria-label={t('action.remove')}
        >
          <Delete className="size-5 rtl:-scale-x-100" />
        </button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          {t('action.cancel')}
        </Button>
        <Button
          className="flex-1"
          onClick={() => onConfirm(text)}
          disabled={text === '' || parsePaisa(text) === null}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
