import { useState } from 'react';

import { useApp, useT, useToast } from '../../appStore';
import { Dialog } from '../../components/Dialog';
import { hashPin, isValidPin } from '../../lib/pin';
import { relockPin } from './PinGate';

/**
 * Setting and clearing the PIN.
 *
 * The hint under it is deliberate and stays: a shopkeeper who thinks this is
 * real security might keep the tablet somewhere he otherwise would not.
 */
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
    <>
      <div className="section-head">{t('settings.pin')}</div>
      <div className="screen__pad stack">
        <p className="field__hint">{t('settings.pinHint')}</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setEditing(true)}
            data-testid="set-pin"
          >
            {t('settings.pinSet')}
          </button>
          {hasPin && (
            <button type="button" className="btn btn--danger" onClick={() => void clear()}>
              {t('settings.pinClear')}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <Dialog
          title={t('settings.pinSet')}
          onClose={() => setEditing(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                {t('action.cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!isValidPin(pin)}
                onClick={() => void save()}
                data-testid="confirm-pin"
              >
                {t('action.save')}
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field__label">{t('settings.pinSet')}</span>
            <input
              className="input num"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              data-autofocus
            />
          </label>
        </Dialog>
      )}
    </>
  );
}
