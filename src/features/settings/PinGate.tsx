import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useT } from '@/appStore';
import { NumberPad } from '@/components/NumberPad';
import { Screen } from '@/components/app/Screen';
import { pinMatches } from '@/lib/pin';

/**
 * Guards Settings and Reports behind the optional PIN.
 *
 * The unlock lasts for the life of the page, not for a fixed time: the point is
 * to stop a customer poking at the takings while the shopkeeper's back is
 * turned, and re-entering the PIN every time he switches between Reports and
 * Settings would just get the PIN turned off.
 */
let unlockedThisSession = false;

export function PinGate({ children }: { children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  const settings = useApp((state) => state.settings);
  const stored = settings['pin_hash'] ?? '';

  const [unlocked, setUnlocked] = useState(unlockedThisSession || stored === '');
  const [wrong, setWrong] = useState(false);

  if (stored === '' || unlocked) return <>{children}</>;

  return (
    <Screen title={t('settings.pinEnter')} onBack={() => navigate('/sell')}>
      <div className="mx-auto max-w-xs p-4">
        <NumberPad
          allowDecimal={false}
          confirmLabel={t('action.continue')}
          hint={wrong ? t('settings.pinWrong') : undefined}
          onCancel={() => navigate('/sell')}
          onConfirm={(value) => {
            void pinMatches(value, stored).then((ok) => {
              if (ok) {
                unlockedThisSession = true;
                setUnlocked(true);
              } else {
                setWrong(true);
              }
            });
          }}
        />
      </div>
    </Screen>
  );
}

/** Called after the PIN is changed, so the new one takes effect immediately. */
export function relockPin(): void {
  unlockedThisSession = false;
}
