import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { useT } from '@/appStore';
import { getCustomer } from '@/db/repos/customersRepo';
import { cn } from '@/lib/cn';
import { useCart } from './cartStore';

/**
 * The open-cart tabs.
 *
 * A shop counter serves several customers at once, so each cart is a tab: tap
 * to switch, `+` to open another, `×` on the active tab to close it. There is
 * always at least one. This replaces the old hidden "held carts" list and the
 * Hold button — parking a basket now just means starting a new tab.
 *
 * Unlimited tabs: the strip scrolls sideways when it fills. Spec: top-rounded,
 * the active one lifted onto `--panel`.
 */
export function CartTabs({ onCloseWithLines }: { onCloseWithLines: (id: number) => void }) {
  const t = useT();
  const carts = useCart((state) => state.carts);
  const currentId = useCart((state) => state.currentId);
  const switchTo = useCart((state) => state.switchTo);
  const newCart = useCart((state) => state.newCart);
  const closeCart = useCart((state) => state.closeCart);

  const [names, setNames] = useState<Record<number, string>>({});

  // Resolve the customer name for every cart that has one, so a tab can read
  // "Aslam" instead of "Cart 3". One lookup per distinct customer, cached.
  useEffect(() => {
    const wanted = new Set(
      carts
        .map((cart) => cart.customerId)
        .filter((id): id is number => id !== null && !(id in names)),
    );
    if (wanted.size === 0) return;
    let live = true;
    void Promise.all(
      [...wanted].map(async (id) => [id, (await getCustomer(id))?.name ?? ''] as const),
    ).then((pairs) => {
      if (!live) return;
      setNames((current) => {
        const next = { ...current };
        for (const [id, name] of pairs) next[id] = name;
        return next;
      });
    });
    return () => {
      live = false;
    };
  }, [carts, names]);

  if (carts.length <= 1 && (carts[0]?.lines.length ?? 0) === 0) {
    // A single empty cart needs no tab bar — just the "+" would be noise.
    return null;
  }

  return (
    <div
      data-testid="cart-tabs"
      className="flex shrink-0 items-end gap-1.5 overflow-x-auto border-b border-line px-4 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {carts.map((cart, index) => {
        const active = cart.id === currentId;
        const label =
          cart.customerId !== null && names[cart.customerId]
            ? names[cart.customerId]!
            : t('sell.cartN', { n: index + 1 });
        return (
          <button
            key={cart.id}
            type="button"
            data-testid="cart-tab"
            aria-selected={active}
            onClick={() => switchTo(cart.id)}
            className={cn(
              'flex min-h-9 flex-none items-center gap-2 rounded-t-[11px] border border-b-0 px-3 text-[13px] transition-colors',
              active
                ? 'border-line bg-panel font-bold text-fg'
                : 'border-transparent bg-panel2 font-medium text-fg2 hover:text-fg',
            )}
          >
            <span className="max-w-[10rem] truncate">{label}</span>
            {cart.lines.length > 0 && (
              <span
                className={cn(
                  'num rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-brand text-on-brand' : 'bg-line text-fg2',
                )}
              >
                {cart.lines.length}
              </span>
            )}
            {active && carts.length > 1 && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={t('sell.closeCart')}
                onClick={(event) => {
                  event.stopPropagation();
                  if (cart.lines.length > 0) onCloseWithLines(cart.id);
                  else void closeCart(cart.id);
                }}
                className="-me-1 grid size-6 place-items-center rounded-full text-fg2 hover:bg-line hover:text-bad"
              >
                <X className="size-3.5" />
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        data-testid="new-cart"
        aria-label={t('sell.newCart')}
        onClick={() => void newCart()}
        className="mb-1 grid size-9 flex-none place-items-center rounded-[10px] border border-line bg-panel2 text-fg2 hover:text-fg"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
