import { useEffect, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { useApp, useT } from './appStore';
import { Toasts } from './components/EmptyState';
import { BackupBar } from './features/settings/BackupBar';
import { DebugScreen } from './features/settings/DebugScreen';
import { PinGate } from './features/settings/PinGate';
import { PeopleRoutes } from './features/people/PeopleRoutes';
import { ReportsScreen } from './features/reports/ReportsScreen';
import { ReceiptView } from './features/sell/ReceiptView';
import { SellScreen } from './features/sell/SellScreen';
import { ProductSaleScreen } from './features/sell/ProductSaleScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { SetupScreen } from './features/settings/SetupScreen';
import { StockRoutes } from './features/stock/StockRoutes';

export function App() {
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
      <div className="boot">
        <div className="boot__title">{t('app.booting')}</div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="boot">
        <div className="boot__title">{t('app.bootFailed')}</div>
        <p className="boot__detail">{error}</p>
        <button type="button" className="btn btn--primary" onClick={() => void boot()}>
          {t('app.retry')}
        </button>
      </div>
    );
  }

  if (!shopName) return <SetupScreen />;

  return <Shell />;
}

function Shell() {
  const t = useT();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <header className="shell__header">
        <button
          type="button"
          className="shell__brand btn btn--quiet"
          onClick={() => navigate('/sell')}
        >
          {t('app.name')}
        </button>
        <div className="shell__slot" id="header-slot" />
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => navigate('/settings')}
          aria-label={t('nav.settings')}
        >
          <span aria-hidden="true" style={{ fontSize: 20 }}>
            ⚙
          </span>
        </button>
      </header>

      <main className="shell__main">
        <BackupBar />
        <Routes>
          <Route path="/" element={<Navigate to="/sell" replace />} />
          <Route path="/sell" element={<SellScreen />} />
          <Route path="/sell/product/:id" element={<ProductSaleScreen />} />
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
      </main>

      <nav className="shell__nav" aria-label={t('app.name')}>
        <Tab to="/sell" glyph="₨" label={t('nav.sell')} />
        <Tab to="/stock" glyph="▦" label={t('nav.stock')} />
        <Tab to="/people" glyph="◍" label={t('nav.people')} />
        <Tab to="/reports" glyph="▤" label={t('nav.reports')} />
      </nav>

      <Toasts />
    </div>
  );
}

function Tab({ to, glyph, label }: { to: string; glyph: ReactNode; label: string }) {
  return (
    <NavLink to={to} className="navlink">
      <span className="navlink__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}
