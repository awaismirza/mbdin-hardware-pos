import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useApp, useT } from './appStore';
import { AppProviders } from './components/app/AppProviders';
import { AppShell } from './components/app/AppShell';
import { Button } from './components/ui/button';
import { InstallPrompt } from './features/install/InstallPrompt';
import { InstallScreen } from './features/install/InstallScreen';
import { BackupBar } from './features/settings/BackupBar';
import { DebugScreen } from './features/settings/DebugScreen';
import { PinGate } from './features/settings/PinGate';
import { PeopleRoutes } from './features/people/PeopleRoutes';
import { ReportsScreen } from './features/reports/ReportsScreen';
import { ReceiptView } from './features/sell/ReceiptView';
import { SellScreen } from './features/sell/SellScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { SetupScreen } from './features/settings/SetupScreen';
import { StockRoutes } from './features/stock/StockRoutes';

export function App() {
  return (
    <AppProviders>
      <Boot />
    </AppProviders>
  );
}

function Boot() {
  const status = useApp((state) => state.status);
  const error = useApp((state) => state.error);
  const boot = useApp((state) => state.boot);
  const shopName = useApp((state) => state.settings['shop_name']?.trim());
  const t = useT();

  useEffect(() => {
    if (status === 'idle') void boot();
  }, [status, boot]);

  if (status === 'idle' || status === 'booting') {
    return (
      <div className="grid h-dvh place-content-center bg-background text-center text-foreground">
        <p className="text-lg font-semibold">{t('app.booting')}</p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="grid h-dvh place-content-center justify-items-center gap-4 bg-background p-8 text-center text-foreground">
        <p className="text-lg font-semibold">{t('app.bootFailed')}</p>
        <p className="max-w-[46ch] whitespace-pre-wrap text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => void boot()}>{t('app.retry')}</Button>
      </div>
    );
  }

  if (!shopName) return <SetupScreen />;

  return (
    <AppShell>
      <InstallPrompt />
      <BackupBar />
      <AppRoutes />
    </AppShell>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/sell" replace />} />
      <Route path="/sell" element={<SellScreen />} />
      {/* The install guide is never behind the PIN: the shopkeeper may need it
          on a device that has not been set up yet. */}
      <Route path="/install" element={<InstallScreen />} />
      <Route path="/sell/receipt/:id" element={<ReceiptView />} />
      <Route path="/stock/*" element={<StockRoutes />} />
      <Route path="/people/*" element={<PeopleRoutes />} />
      {/* Reports and Settings sit behind the optional PIN. Sell, Stock and
          People never do: the till must never be locked mid-queue. */}
      <Route
        path="/reports"
        element={
          <PinGate>
            <ReportsScreen />
          </PinGate>
        }
      />
      <Route
        path="/settings"
        element={
          <PinGate>
            <SettingsScreen />
          </PinGate>
        }
      />
      <Route
        path="/settings/storage"
        element={
          <PinGate>
            <DebugScreen />
          </PinGate>
        }
      />
      <Route path="*" element={<Navigate to="/sell" replace />} />
    </Routes>
  );
}
