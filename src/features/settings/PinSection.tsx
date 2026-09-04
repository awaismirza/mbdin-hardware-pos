import { useState } from 'react';

import { useApp, useT, useToast } from '@/appStore';
import { Dialog } from '@/components/Dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hashPin, isValidPin } from '@/lib/pin';
import { relockPin } from './PinGate';

export function PinSection() {
  const t = useT();
  const toast = useToast();
  const settings = useApp((state) => state.settings);
  const saveSetting = useApp((state) => state.saveSetting);

  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const hasPin = (settings['pin_hash'] ?? '') !== '';

  async function save() {
    if (!isValidPin(pin)) return;
    await saveSetting('pin_hash', await hashPin(pin));
    relockPin();
    setEditing(false);
    setPin('');
    toast(t('settings.saved'));
  }

  async function clear() {
    await saveSetting('pin_hash', '');
    relockPin();
    toast(t('settings.saved'));
  }

  return (
    <section className="rounded-[14px] border border-line bg-panel p-4 shadow-card">
      <h2 className="mb-1.5 text-[14.5px] font-bold">{t('settings.pin')}</h2>
      <p className="mb-3 text-xs text-fg2">{t('settings.pinHint')}</p>

      {/* Four boxes, filled or empty, so "is there a PIN?" is answered by
          looking rather than by remembering. The digits are never shown: only
          the hash is stored. */}
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((slot) => (
          <span
            key={slot}
            aria-hidden="true"
            className="num grid h-[52px] w-[46px] place-items-center rounded-[11px] border border-line bg-panel2 text-[22px] font-semibold text-fg2"
          >
            {hasPin ? '•' : ''}
          </span>
        ))}
        <span className="flex-1" />
        <Button
          variant="outline"
          className="h-[52px]"
          onClick={() => setEditing(true)}
          data-testid="set-pin"
        >
          {t('settings.pinSet')}
        </Button>
      </div>

      {hasPin && (
        <Button variant="muted" className="mt-2 text-bad" onClick={() => void clear()}>
          {t('settings.pinClear')}
        </Button>
      )}

      {editing && (
        <Dialog
          title={t('settings.pinSet')}
          onClose={() => setEditing(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>
                {t('action.cancel')}
              </Button>
              <Button
                disabled={!isValidPin(pin)}
                onClick={() => void save()}
                data-testid="confirm-pin"
              >
                {t('action.save')}
              </Button>
            </>
          }
        >
          <div className="grid gap-2">
            <Label htmlFor="pin-input">{t('settings.pinSet')}</Label>
            <Input
              id="pin-input"
              className="num"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>
        </Dialog>
      )}
    </section>
  );
}
