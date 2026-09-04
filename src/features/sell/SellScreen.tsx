import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins, PackagePlus, PauseCircle, ScanLine, Zap } from 'lucide-react';

import { useApp, useT, useToast } from '@/appStore';
import { Dialog, Sheet } from '@/components/Dialog';
import { NumberPad } from '@/components/NumberPad';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
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
import { AddToCartSheet } from './AddToCartSheet';
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
  const shopName = useApp((state) => state.settings['shop_name']) ?? '';

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
  const [pickedId, setPickedId] = useState<number | null>(null);
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

  const searchField = (
    <div className="flex flex-1 items-center gap-2">
      <Input
        ref={searchInput}
        className={cn('flex-1', search && 'num')}
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
    </div>
  );

  return (
    <Screen
      title={t('nav.sell')}
      subtitle={shopName || undefined}
      scroll={false}
      actions={
        <div className="hidden w-[min(340px,34vw)] md:flex">{searchField}</div>
      }
    >
      {/* Phone: the header has no room, so search lives at the top of the body. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 md:hidden">{searchField}</div>

      {/* Quick actions. A horizontally scrolling strip of the things a
          shopkeeper reaches for between sales, accent on the first only. */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <QuickAction
          accent
          icon={Zap}
          label={t('sell.quickSell')}
          sub={t('sell.quickSellSub')}
          onClick={() => setOverlay('quick')}
        />
        <QuickAction
          icon={HandCoins}
          label={t('sell.takePayment')}
          sub={t('sell.takePaymentSub')}
          onClick={() => navigate('/people')}
        />
        <QuickAction
          icon={PackagePlus}
          label={t('stock.receive')}
          sub={t('sell.receiveStockSub')}
          onClick={() => navigate('/stock')}
        />
        {heldCount > 0 && (
          <QuickAction
            icon={PauseCircle}
            label={t('sell.held')}
            sub={t('sell.heldSub', { count: heldCount })}
            onClick={() => {
              void listHeldCarts().then(setHeld);
              setOverlay('held');
            }}
          />
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 lg:landscape:flex-row">
        <CatalogueGrid
          search={search}
          onPick={(product) => setPickedId(product.id)}
          unknownBarcode={unknownBarcode}
          onAddWithBarcode={(barcode) => navigate(`/stock/product/new?barcode=${barcode}`)}
        />

        <div className="hidden w-[392px] shrink-0 border-s border-line bg-panel lg:landscape:flex">
          <CartPane
            customerLabel={customerLabel}
            onPickCustomer={() => setOverlay('customer')}
            onCheckout={() => setCheckoutOpen(true)}
            onHold={() => setOverlay('hold')}
          />
        </div>
      </div>

      {/* Spec: on anything without room for the pane, the cart collapses to a
          cobalt summary bar that opens it as a sheet. */}
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        data-testid="cart-bar"
        className="flex shrink-0 items-center gap-3 bg-brand px-4 py-3 text-start text-on-brand lg:landscape:hidden"
      >
        <span className="num grid h-[26px] min-w-[26px] place-items-center rounded-full bg-white/25 px-2 text-[12.5px] font-semibold">
          {lines.length}
        </span>
        <span className="flex-1 truncate text-[12.5px] font-semibold opacity-90">
          {customerLabel} · {t('sell.viewCart')}
        </span>
        <span className="money text-[17px] font-semibold">{formatPKR(total)}</span>
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

      {pickedId != null && (
        <AddToCartSheet productId={pickedId} onClose={() => setPickedId(null)} />
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
    </Screen>
  );
}

/**
 * One pill in the quick-action strip: a 24px icon well, a label and a
 * sub-label. Only the first is accented — spec: one accent per screen.
 */
function QuickAction({
  icon: Icon,
  label,
  sub,
  onClick,
  accent = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 flex-none items-center gap-2.5 rounded-xl border px-3 text-start transition-colors',
        accent
          ? 'border-brand/30 bg-brand-soft text-brand'
          : 'border-line bg-panel text-fg hover:bg-panel2',
      )}
    >
      <span
        className={cn(
          'grid size-6 flex-none place-items-center rounded-[7px]',
          accent ? 'bg-brand text-on-brand' : 'bg-panel2 text-fg2',
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] font-bold whitespace-nowrap">{label}</span>
        <span className="text-[10.5px] whitespace-nowrap opacity-70">{sub}</span>
      </span>
    </button>
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
