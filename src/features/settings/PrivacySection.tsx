import { useState } from 'react';

import { useApp, useT, useToast } from '@/appStore';
import { Dialog } from '@/components/Dialog';
import { NumberPad } from '@/components/NumberPad';
import { Switch } from '@/components/ui/switch';
import { pinMatches } from '@/lib/pin';

/**
 * The privacy toggles.
 *
 * Today there is one: hide the profit figure on Reports. It exists because a
 * shopkeeper hands the till to an assistant or a family member who should be
 * able to check takings and stock but has no business seeing the margins.
 *
 * Changing it either way is gated by the same 4-digit PIN that guards Settings
 * and Reports — so an assistant who is already past that gate still cannot flip
 * profit back on without the number. If no PIN is set there is nothing to check
 * against, and it just toggles, exactly as PinGate behaves.
 */
export function PrivacySection() {
  const t = useT();
  const toast = useToast();
  const settings = useApp((state) => state.settings);
  const saveSetting = useApp((state) => state.saveSetting);

  const hideProfit = settings['hide_profit'] === '1';
  const pinHash = settings['pin_hash'] ?? '';

  const [asking, setAsking] = useState(false);
  const [wrong, setWrong] = useState(false);

  async function apply(next: boolean) {
    await saveSetting('hide_profit', next ? '1' : '');
    toast(t('settings.saved'));
  }

  function request() {
    if (pinHash === '') {
      void apply(!hideProfit);
      return;
    }
    setWrong(false);
    setAsking(true);
  }

  return (
    <section className="rounded-[14px] border border-line bg-panel shadow-card">
      <h2 className="border-b border-line px-4 py-3.5 text-[14.5px] font-bold">
        {t('settings.privacy')}
      </h2>
      <div className="flex items-center gap-3 p-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">{t('settings.hideProfit')}</span>
          <span className="block text-[11.5px] text-fg2">{t('settings.hideProfitHint')}</span>
        </span>
        <Switch
          checked={hideProfit}
          onCheckedChange={request}
          data-testid="hide-profit"
          aria-label={t('settings.hideProfit')}
        />
      </div>

      {asking && (
        <Dialog title={t('settings.pinEnter')} onClose={() => setAsking(false)}>
          <NumberPad
            allowDecimal={false}
            confirmLabel={t('action.confirm')}
            hint={wrong ? t('settings.pinWrong') : undefined}
            onCancel={() => setAsking(false)}
            onConfirm={(value) => {
              void pinMatches(value, pinHash).then((ok) => {
                if (!ok) {
                  setWrong(true);
                  return;
                }
                setAsking(false);
                void apply(!hideProfit);
              });
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
