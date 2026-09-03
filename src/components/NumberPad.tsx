import { useEffect, useState } from 'react';

import { useT } from '../appStore';
import { formatPKR, parsePaisa, TENDER_DENOMINATIONS } from '../lib/money';

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
 * here. Keys are 56px, per the spec's touch floor for pads.
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
    // `text` is read inside, so the listener must be refreshed with it.
  }, [text, allowDecimal, onConfirm]);

  function push(key: string): void {
    setText((value) => {
      if (key === '.') {
        if (value.includes('.')) return value;
        return value === '' ? '0.' : `${value}.`;
      }
      // Two decimal places is as fine as money or a weight ever needs to be.
      const [, fraction] = value.split('.');
      if (fraction !== undefined && fraction.length >= 2) return value;
      if (value === '0') return key;
      if (value.length >= 12) return value;
      return value + key;
    });
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="numpad">
      {label && <div className="field__label">{label}</div>}
      <div className="numpad__display" aria-live="polite">
        {text || '0'}
      </div>
      {hint && <div className="numpad__hint">{hint}</div>}

      {denominations && (
        <div className="numpad__quick">
          {TENDER_DENOMINATIONS.map((paisa) => (
            <button
              key={paisa}
              type="button"
              className="btn num"
              onClick={() => setText(String(paisa / 100))}
            >
              {formatPKR(paisa, { symbol: false })}
            </button>
          ))}
        </div>
      )}

      <div className="numpad__grid">
        {keys.map((key) => (
          <button key={key} type="button" className="numpad__key" onClick={() => push(key)}>
            {key}
          </button>
        ))}
        <button
          type="button"
          className="numpad__key"
          onClick={() => push('.')}
          disabled={!allowDecimal}
          aria-label="decimal point"
        >
          .
        </button>
        <button type="button" className="numpad__key" onClick={() => push('0')}>
          0
        </button>
        <button
          type="button"
          className="numpad__key"
          onClick={() => setText((value) => value.slice(0, -1))}
          aria-label={t('action.remove')}
        >
          ⌫
        </button>
      </div>

      <div className="row">
        <button type="button" className="btn grow" onClick={onCancel}>
          {t('action.cancel')}
        </button>
        <button
          type="button"
          className="btn btn--primary grow"
          onClick={() => onConfirm(text)}
          disabled={text === '' || parsePaisa(text) === null}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
