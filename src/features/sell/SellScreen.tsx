import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApp, useT, useToast } from '../../appStore';
import { Dialog, Sheet } from '../../components/Dialog';
import { NumberPad } from '../../components/NumberPad';
import { getCustomer } from '../../db/repos/customersRepo';
import { findByBarcode } from '../../db/repos/productsRepo';
import {
  completeSale,
  countHeldCarts,
  discardHeldCart,
  listHeldCarts,
} from '../../db/repos/salesRepo';
import { formatDateTime } from '../../lib/dates';
import { formatPKR } from '../../lib/money';
import type { HeldCart, PaymentMethod } from '../../types/domain';
import { BarcodeScanner } from './BarcodeScanner';
import { CartPane } from './CartPane';
import { CatalogueGrid } from './CatalogueGrid';
import { CheckoutSheet } from './CheckoutSheet';
import { CustomerPicker } from './CustomerPicker';
import { useCart } from './cartStore';

import './sell.css';

/**
 * Checkout is tracked separately from the other overlays, not as one of them.
 * Choosing a customer from inside checkout has to leave the sheet standing:
 * collapsing it would throw away the payment method and the amount already
 * typed, and send the shopkeeper back to tap Charge again.
 */
type Overlay = 'none' | 'scan' | 'customer' | 'quick' | 'held' | 'hold';

export function SellScreen() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const refreshSettings = useApp((state) => state.refreshSettings);

  const hydrate = useCart((state) => state.hydrate);
  const hydrated = useCart((state) => state.hydrated);
  const restored = useCart((state) => state.restored);
  const acknowledgeRestore = useCart((state) => state.acknowledgeRestore);
  const lines = useCart((state) => state.lines);
  const customerId = useCart((state) => state.customerId);
  const total = useCart((state) => state.totalPaisa());
  const addProduct = useCart((state) => state.addProduct);
  const addAdHoc = useCart((state) => state.addAdHoc);
  const setCustomer = useCart((state) => state.setCustomer);
  const clear = useCart((state) => state.clear);

  const [search, setSearch] = useState('');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (restored) {
      toast(t('sell.cartRestored'));
      acknowledgeRestore();
    }
  }, [restored, acknowledgeRestore, toast, t]);

  useEffect(() => {
    void countHeldCarts().then(setHeldCount);
  }, [overlay]);

  useEffect(() => {
    if (customerId === null) {
      setCustomerName(null);
      return;
    }
    void getCustomer(customerId).then((found) => setCustomerName(found?.name ?? null));
  }, [customerId]);

  /**
   * A USB barcode scanner behaves as a keyboard: it types the code into the
   * focused field and presses Enter. The field is not autofocused — on a tablet
   * that just raises the on-screen keyboard every time Sell opens — so a scanner
   * user taps the field once; after each hit we refocus it for the next scan.
   * Enter here means "if this is exactly one product's barcode, add it".
   */
  const onSearchSubmit = useCallback(async () => {
    const term = search.trim();
    if (!term) return;
    const product = await findByBarcode(term);
    if (product) {
      addProduct(product);
      setSearch('');
      setUnknownBarcode(null);
      searchInput.current?.focus();
    } else {
      setUnknownBarcode(term);
    }
  }, [search, addProduct]);

  async function onScan(code: string) {
    setOverlay('none');
    const product = await findByBarcode(code);
    if (product) {
      addProduct(product);
      toast(product.nameUr?.trim() || product.nameEn?.trim() || '');
    } else {
      setSearch(code);
      setUnknownBarcode(code);
    }
  }

  async function charge(result: {
    paidPaisa: number;
    method: PaymentMethod;
    note: string | null;
  }) {
    setBusy(true);
    try {
      const sale = await completeSale({
        lines: useCart.getState().lines,
        customerId: useCart.getState().customerId,
        discountPaisa: useCart.getState().discountPaisa(),
        paidPaisa: result.paidPaisa,
        paymentMethod: result.method,
        note: result.note,
      });
      clear();
      setCheckoutOpen(false);
      setOverlay('none');
      // The invoice counter moved, so the cached settings are stale.
      await refreshSettings();
      toast(t('sell.saleSaved'));
      navigate(`/sell/receipt/${String(sale.saleId)}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sell">
      <div className="catalogue__search">
        <input
          ref={searchInput}
          className="input num grow"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setUnknownBarcode(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void onSearchSubmit();
            }
          }}
          placeholder={t('sell.searchPlaceholder')}
          aria-label={t('action.search')}
        />
        <button
          type="button"
          className="btn"
          onClick={() => setOverlay('scan')}
          aria-label={t('action.scan')}
        >
          <span aria-hidden="true">◉</span>
        </button>
        {heldCount > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              void listHeldCarts().then(setHeld);
              setOverlay('held');
            }}
          >
            {t('sell.hold')} <span className="held-badge num">{heldCount}</span>
          </button>
        )}
      </div>

      <div className="sell__panes">
        <div className="sell__catalogue">
          <CatalogueGrid
            search={search}
            onPick={(product) => navigate(`/sell/product/${String(product.id)}`)}
            onQuickSell={() => setOverlay('quick')}
            unknownBarcode={unknownBarcode}
            onAddWithBarcode={(barcode) => navigate(`/stock/product/new?barcode=${barcode}`)}
          />
        </div>

        {/* Landscape: the cart is a permanent right-hand pane. Portrait: it
            collapses to a summary bar that opens it as a bottom sheet, so the
            catalogue keeps the whole screen while items are being tapped in. */}
        <div className="sell__cart">
          <CartPane
            customerLabel={customerName ?? t('common.walkIn')}
            onPickCustomer={() => setOverlay('customer')}
            onCheckout={() => setCheckoutOpen(true)}
            onHold={() => setOverlay('hold')}
          />
        </div>
      </div>

      <button
        type="button"
        className="cart-bar"
        onClick={() => setCartOpen(true)}
        data-testid="cart-bar"
      >
        <span className="cart-bar__count">
          {t('sell.cart')} · <span className="num">{lines.length}</span> ·{' '}
          {customerName ?? t('common.walkIn')}
        </span>
        <span className="cart-bar__total">{formatPKR(total)}</span>
      </button>

      {cartOpen && (
        <Sheet title={t('sell.cart')} onClose={() => setCartOpen(false)}>
          <div className="cart-sheet">
            <CartPane
              customerLabel={customerName ?? t('common.walkIn')}
              onPickCustomer={() => setOverlay('customer')}
              onCheckout={() => {
                setCartOpen(false);
                setCheckoutOpen(true);
              }}
              onHold={() => {
                setCartOpen(false);
                setOverlay('hold');
              }}
            />
          </div>
        </Sheet>
      )}

      {overlay === 'scan' && (
        <BarcodeScanner onClose={() => setOverlay('none')} onScan={(code) => void onScan(code)} />
      )}

      {checkoutOpen && (
        <CheckoutSheet
          totalPaisa={total}
          customerId={customerId}
          busy={busy}
          onPickCustomer={() => setOverlay('customer')}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={(result) => void charge(result)}
        />
      )}

      {overlay === 'customer' && (
        <CustomerPicker
          onClose={() => setOverlay('none')}
          onPick={(id) => {
            setCustomer(id);
            setOverlay('none');
          }}
        />
      )}

      {overlay === 'quick' && (
        <QuickSellDialog
          onClose={() => setOverlay('none')}
          onAdd={(label, paisa) => {
            addAdHoc(label, paisa);
            setOverlay('none');
          }}
        />
      )}

      {overlay === 'hold' && (
        <HoldDialog onClose={() => setOverlay('none')} disabled={lines.length === 0} />
      )}

      {overlay === 'held' && (
        <Sheet title={t('sell.held')} onClose={() => setOverlay('none')}>
          {held.length === 0 && <p className="meta">{t('sell.heldEmpty')}</p>}
          {held.map((cart) => (
            <div key={cart.id} className="list__row">
              <span className="list__main">
                <span className="list__name">
                  {cart.label ?? <span className="num">{formatDateTime(cart.createdAt)}</span>}
                </span>
                <span className="list__meta num">
                  {cart.lineCount} · {formatPKR(cart.totalPaisa)}
                </span>
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void useCart
                    .getState()
                    .resume(cart.id)
                    .then(() => setOverlay('none'));
                }}
              >
                {t('sell.resume')}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => {
                  void discardHeldCart(cart.id).then(() =>
                    listHeldCarts().then(setHeld),
                  );
                }}
                aria-label={t('action.delete')}
              >
                ×
              </button>
            </div>
          ))}
        </Sheet>
      )}

      {!hydrated && <div className="visually-hidden">{t('common.loading')}</div>}
    </div>
  );
}

function QuickSellDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (label: string, paisa: number) => void;
}) {
  const t = useT();
  const [label, setLabel] = useState('');

  return (
    <Dialog title={t('sell.quickSellTitle')} onClose={onClose}>
      <label className="field" style={{ marginBlockEnd: 'var(--s3)' }}>
        <span className="field__label">{t('sell.quickSellLabel')}</span>
        <input
          className="input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          data-autofocus
        />
      </label>
      <NumberPad
        label={t('sell.quickSellAmount')}
        confirmLabel={t('action.add')}
        onCancel={onClose}
        onConfirm={(value) => {
          const paisa = Math.round(Number(value) * 100);
          if (Number.isFinite(paisa) && paisa > 0) {
            onAdd(label.trim() || t('sell.quickSell'), paisa);
          }
        }}
      />
    </Dialog>
  );
}

function HoldDialog({ onClose, disabled }: { onClose: () => void; disabled: boolean }) {
  const t = useT();
  const hold = useCart((state) => state.hold);
  const [label, setLabel] = useState('');

  return (
    <Dialog
      title={t('sell.hold')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={disabled}
            onClick={() => {
              void hold(label.trim() || null).then(onClose);
            }}
          >
            {t('sell.hold')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('sell.holdLabel')}</span>
        <input
          className="input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t('common.optional')}
          data-autofocus
        />
      </label>
    </Dialog>
  );
}
