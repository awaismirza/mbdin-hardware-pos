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
    <section className="border-b p-4">
      <h2 className="mb-3 text-base font-semibold">{t('settings.pin')}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t('settings.pinHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditing(true)} data-testid="set-pin">
          {t('settings.pinSet')}
        </Button>
        {hasPin && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => void clear()}
          >
            {t('settings.pinClear')}
          </Button>
        )}
      </div>

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
