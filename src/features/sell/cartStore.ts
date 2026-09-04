import { create } from 'zustand';

import { clampDiscount, lineTotal, percentOf, roundQty, sumPaisa } from '../../lib/money';
import {
  createCart,
  deleteCart,
  listActiveCarts,
  saveCart,
  type CartSnapshot,
} from '../../db/repos/salesRepo';
import { getSetting, setSetting } from '../../db/repos/settingsRepo';
import type { CartLine, Product, Unit } from '../../types/domain';

export type DiscountMode = 'rupees' | 'percent';

/** Setting key holding the id of the tab that was focused when the app last closed. */
const CURRENT_CART_KEY = 'current_cart_id';

/** One open cart — a tab on the Sell screen, fully independent of the others. */
export interface Cart {
  /** The held_carts row id: stable for the cart's life, and the tab's key. */
  id: number;
  lines: CartLine[];
  customerId: number | null;
  discountMode: DiscountMode;
  /** The raw figure the shopkeeper typed: paisa in rupees mode, percent in the other. */
  discountInput: number;
}

interface CartsState {
  carts: Cart[];
  /** The cart the Sell screen is showing. Always points at a member of `carts`. */
  currentId: number | null;
  hydrated: boolean;
  /** A cart came back from the database with lines in it on this launch. */
  restored: boolean;

  hydrate(): Promise<void>;

  switchTo(id: number): void;
  newCart(): Promise<number>;
  closeCart(id: number): Promise<void>;
  /** Drop the just-sold cart from memory (the sale transaction already deleted its row). */
  afterSale(soldCartId: number): Promise<void>;

  addProduct(product: Product, qty?: number): void;
  addAdHoc(label: string, pricePaisa: number): void;
  setQty(key: string, qty: number): void;
  bumpQty(key: string, delta: number): void;
  setPrice(key: string, pricePaisa: number): void;
  removeLine(key: string): void;
  setCustomer(customerId: number | null): void;
  setDiscount(mode: DiscountMode, value: number): void;
  clear(): void;
  acknowledgeRestore(): void;

  current(): Cart | null;
  subtotalPaisa(): number;
  discountPaisa(): number;
  totalPaisa(): number;
  snapshot(): CartSnapshot;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `line-${String(Date.now())}-${String(keySeq)}`;
}

function emptyCart(id: number): Cart {
  return { id, lines: [], customerId: null, discountMode: 'rupees', discountInput: 0 };
}

function snapshotOf(cart: Cart): CartSnapshot {
  return {
    lines: cart.lines,
    customerId: cart.customerId,
    discountPaisa: discountPaisaOf(cart),
  };
}

function subtotalOf(cart: Cart): number {
  return sumPaisa(cart.lines.map((line) => lineTotal(line.pricePaisa, line.qty)));
}

function discountPaisaOf(cart: Cart): number {
  const subtotal = subtotalOf(cart);
  const raw =
    cart.discountMode === 'percent' ? percentOf(subtotal, cart.discountInput) : cart.discountInput;
  return clampDiscount(subtotal, raw);
}

/**
 * The open carts.
 *
 * A busy counter serves several customers at once, so the store holds N carts,
 * not one. Each is a tab on the Sell screen with its own lines, customer and
 * discount; switching between them is instant. Every mutation writes that one
 * cart back to the database, fire-and-forget — a sale must never wait on a disk
 * flush to put a line on the screen — so a power cut or a killed tab loses
 * none of them. There is always at least one cart.
 */
export const useCart = create<CartsState>((set, get) => {
  function persist(cart: Cart): void {
    void saveCart(cart.id, snapshotOf(cart)).catch((error: unknown) => {
      console.warn('[cart] could not save cart', cart.id, error);
    });
  }

  function rememberCurrent(id: number): void {
    void setSetting(CURRENT_CART_KEY, String(id)).catch(() => {
      /* the focused tab is a nicety to restore, not worth surfacing a failure */
    });
  }

  /** Apply `mutate` to the current cart, then persist just that cart. */
  function updateCurrent(mutate: (cart: Cart) => Cart): void {
    const currentId = get().currentId;
    if (currentId === null) return;
    let touched: Cart | null = null;
    set((state) => ({
      carts: state.carts.map((cart) => {
        if (cart.id !== currentId) return cart;
        touched = mutate(cart);
        return touched;
      }),
    }));
    if (touched) persist(touched);
  }

  return {
    carts: [],
    currentId: null,
    hydrated: false,
    restored: false,

    async hydrate() {
      if (get().hydrated) return;
      const saved = await listActiveCarts();
      const carts: Cart[] = saved.map(({ id, snapshot }) => ({
        id,
        lines: snapshot.lines,
        customerId: snapshot.customerId,
        discountMode: 'rupees',
        discountInput: snapshot.discountPaisa,
      }));

      // There is always at least one cart. If the ledger has none saved (fresh
      // shop, or every cart was sold before the last close), open one now.
      if (carts.length === 0) {
        carts.push(emptyCart(await createCart()));
      }

      const storedId = Number(await getSetting(CURRENT_CART_KEY));
      const currentId = carts.some((cart) => cart.id === storedId) ? storedId : carts[0]!.id;

      set({
        hydrated: true,
        carts,
        currentId,
        restored: carts.some((cart) => cart.lines.length > 0),
      });
    },

    switchTo(id) {
      if (!get().carts.some((cart) => cart.id === id)) return;
      set({ currentId: id });
      rememberCurrent(id);
    },

    async newCart() {
      const id = await createCart();
      set((state) => ({ carts: [...state.carts, emptyCart(id)], currentId: id }));
      rememberCurrent(id);
      return id;
    },

    async closeCart(id) {
      await deleteCart(id);
      const remaining = get().carts.filter((cart) => cart.id !== id);
      if (remaining.length === 0) {
        // Never leave the shopkeeper with no cart.
        const fresh = emptyCart(await createCart());
        set({ carts: [fresh], currentId: fresh.id });
        rememberCurrent(fresh.id);
        return;
      }
      const nextId = get().currentId === id ? remaining[0]!.id : get().currentId;
      set({ carts: remaining, currentId: nextId });
      if (nextId !== null) rememberCurrent(nextId);
    },

    async afterSale(soldCartId) {
      const remaining = get().carts.filter((cart) => cart.id !== soldCartId);
      if (remaining.length === 0) {
        const fresh = emptyCart(await createCart());
        set({ carts: [fresh], currentId: fresh.id, restored: false });
        rememberCurrent(fresh.id);
        return;
      }
      set({ carts: remaining, currentId: remaining[0]!.id, restored: false });
      rememberCurrent(remaining[0]!.id);
    },

    addProduct(product, qty = 1) {
      const quantity = roundQty(qty);
      if (quantity <= 0) return;
      updateCurrent((cart) => {
        // Tapping the same tile again adds one more of it rather than a second
        // line — a shopkeeper tapping four times means four, not four lines.
        const existing = cart.lines.find(
          (line) => line.productId === product.id && !line.adHoc,
        );
        if (existing) {
          return {
            ...cart,
            lines: cart.lines.map((line) =>
              line.key === existing.key ? { ...line, qty: roundQty(line.qty + quantity) } : line,
            ),
          };
        }
        const line: CartLine = {
          key: nextKey(),
          productId: product.id,
          name: product.nameUr?.trim() || product.nameEn?.trim() || '',
          unit: product.unit,
          qty: quantity,
          pricePaisa: product.pricePaisa,
          costPaisa: product.costPaisa,
          adHoc: false,
        };
        return { ...cart, lines: [...cart.lines, line] };
      });
    },

    addAdHoc(label, pricePaisa) {
      updateCurrent((cart) => ({
        ...cart,
        lines: [
          ...cart.lines,
          {
            key: nextKey(),
            productId: null,
            name: label,
            unit: 'piece' as Unit,
            qty: 1,
            pricePaisa,
            costPaisa: 0,
            adHoc: true,
          },
        ],
      }));
    },

    setQty(key, qty) {
      const rounded = roundQty(qty);
      if (rounded <= 0) {
        get().removeLine(key);
        return;
      }
      updateCurrent((cart) => ({
        ...cart,
        lines: cart.lines.map((line) => (line.key === key ? { ...line, qty: rounded } : line)),
      }));
    },

    bumpQty(key, delta) {
      const line = get().current()?.lines.find((entry) => entry.key === key);
      if (!line) return;
      get().setQty(key, line.qty + delta);
    },

    setPrice(key, pricePaisa) {
      updateCurrent((cart) => ({
        ...cart,
        lines: cart.lines.map((line) => (line.key === key ? { ...line, pricePaisa } : line)),
      }));
    },

    removeLine(key) {
      updateCurrent((cart) => ({
        ...cart,
        lines: cart.lines.filter((line) => line.key !== key),
      }));
    },

    setCustomer(customerId) {
      updateCurrent((cart) => ({ ...cart, customerId }));
    },

    setDiscount(mode, value) {
      updateCurrent((cart) => ({ ...cart, discountMode: mode, discountInput: value }));
    },

    clear() {
      updateCurrent((cart) => emptyCart(cart.id));
      set({ restored: false });
    },

    acknowledgeRestore() {
      set({ restored: false });
    },

    current() {
      const { carts, currentId } = get();
      return carts.find((cart) => cart.id === currentId) ?? null;
    },

    subtotalPaisa() {
      const cart = get().current();
      return cart ? subtotalOf(cart) : 0;
    },

    discountPaisa() {
      const cart = get().current();
      return cart ? discountPaisaOf(cart) : 0;
    },

    totalPaisa() {
      return get().subtotalPaisa() - get().discountPaisa();
    },

    snapshot() {
      const cart = get().current();
      return cart ? snapshotOf(cart) : { lines: [], customerId: null, discountPaisa: 0 };
    },
  };
});
