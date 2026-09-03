import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanLine } from 'lucide-react';

import { useApp, useT, useToast } from '@/appStore';
import { Dialog, Sheet } from '@/components/Dialog';
import { NumberPad } from '@/components/NumberPad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCustomer } from '@/db/repos/customersRepo';
import { findByBarcode } from '@/db/repos/productsRepo';
import {
  completeSale,
  countHeldCarts,
  discardHeldCart,
  listHeldCarts,
} from '@/db/repos/salesRepo';
import { formatDateTime } from '@/lib/dates';
import { formatPKR } from '@/lib/money';
import type { HeldCart, PaymentMethod } from '@/types/domain';
import { BarcodeScanner } from './BarcodeScanner';
import { CartPane } from './CartPane';
import { CatalogueGrid } from './CatalogueGrid';
import { CheckoutSheet } from './CheckoutSheet';
import { CustomerPicker } from './CustomerPicker';
import { useCart } from './cartStore';

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
   * A USB barcode scanner types the code into the focused field and presses
   * Enter. The field is not autofocused (that raises the keyboard on a tablet);
   * a scanner user taps it once, and it refocuses after each hit.
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
      await refreshSettings();
      toast(t('sell.saleSaved'));
      navigate(`/sell/receipt/${String(sale.saleId)}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(false);
    }
  }

  const customerLabel = customerName ?? t('common.walkIn');

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-card p-3">
        <Input
          ref={searchInput}
          className="num flex-1"
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
        <Button
          variant="outline"
          size="icon"
          onClick={() => setOverlay('scan')}
          aria-label={t('action.scan')}
        >
          <ScanLine className="size-5" />
        </Button>
        {heldCount > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              void listHeldCarts().then(setHeld);
              setOverlay('held');
            }}
          >
            {t('sell.hold')}
            <span className="num ms-1 inline-grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
              {heldCount}
            </span>
          </Button>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 lg:landscape:flex-row">
        <CatalogueGrid
          search={search}
          onPick={(product) => navigate(`/sell/product/${String(product.id)}`)}
          onQuickSell={() => setOverlay('quick')}
          unknownBarcode={unknownBarcode}
          onAddWithBarcode={(barcode) => navigate(`/stock/product/new?barcode=${barcode}`)}
        />

        <div className="hidden w-[22rem] shrink-0 border-s bg-card lg:landscape:flex">
          <CartPane
            customerLabel={customerLabel}
            onPickCustomer={() => setOverlay('customer')}
            onCheckout={() => setCheckoutOpen(true)}
            onHold={() => setOverlay('hold')}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        data-testid="cart-bar"
        className="flex shrink-0 items-center gap-3 border-t bg-card px-4 py-3 text-start lg:landscape:hidden"
      >
        <span className="text-sm text-muted-foreground">
          {t('sell.cart')} · <span className="num">{lines.length}</span> · {customerLabel}
        </span>
        <span className="money ms-auto text-lg font-bold text-primary">{formatPKR(total)}</span>
      </button>

      {cartOpen && (
        <Sheet title={t('sell.cart')} onClose={() => setCartOpen(false)}>
          <div className="flex max-h-[70dvh] min-h-[50dvh] flex-col">
            <CartPane
              customerLabel={customerLabel}
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
          {held.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">{t('sell.heldEmpty')}</p>
          )}
          <div className="divide-y">
            {held.map((cart) => (
              <div key={cart.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {cart.label ?? <span className="num">{formatDateTime(cart.createdAt)}</span>}
                  </span>
                  <span className="num block text-sm text-muted-foreground">
                    {cart.lineCount} · {formatPKR(cart.totalPaisa)}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void useCart
                      .getState()
                      .resume(cart.id)
                      .then(() => setOverlay('none'));
                  }}
                >
                  {t('sell.resume')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    void discardHeldCart(cart.id).then(() => listHeldCarts().then(setHeld));
                  }}
                  aria-label={t('action.delete')}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {!hydrated && <div className="sr-only">{t('common.loading')}</div>}
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
      <div className="mb-3 grid gap-2">
        <Label htmlFor="quick-label">{t('sell.quickSellLabel')}</Label>
        <Input
          id="quick-label"
          autoFocus
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
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
          <Button variant="outline" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            disabled={disabled}
            onClick={() => {
              void hold(label.trim() || null).then(onClose);
            }}
          >
            {t('sell.hold')}
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="hold-label">{t('sell.holdLabel')}</Label>
        <Input
          id="hold-label"
          autoFocus
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t('common.optional')}
        />
      </div>
    </Dialog>
  );
}
