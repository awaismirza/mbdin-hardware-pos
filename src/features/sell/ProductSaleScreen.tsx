import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useLanguage, useT, useToast } from '../../appStore';
import { ProductPhoto } from '../../components/ProductPhoto';
import { getProduct } from '../../db/repos/productsRepo';
import { pickName } from '../../i18n';
import { formatPKR, formatQty, lineTotal, roundQty } from '../../lib/money';
import { FRACTIONAL_UNITS, type Product } from '../../types/domain';
import { useCart } from './cartStore';

/** A focused product page: choose quantity, see the arithmetic, then add it. */
export function ProductSaleScreen() {
  const t = useT();
  const language = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const productId = Number(useParams()['id']);
  const addProduct = useCart((state) => state.addProduct);
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    void getProduct(productId).then((found) => {
      setProduct(found);
      if (found && FRACTIONAL_UNITS.has(found.unit)) setQuantity(0.25);
    });
  }, [productId]);

  const step = product && FRACTIONAL_UNITS.has(product.unit) ? 0.25 : 1;
  const linePaisa = useMemo(
    () => (product ? lineTotal(product.pricePaisa, quantity) : 0),
    [product, quantity],
  );

  function change(delta: number) {
    setQuantity((current) => Math.max(step, roundQty(current + delta)));
  }

  if (!product) {
    return (
      <div className="screen">
        <div className="screen__body empty">{t('common.loading')}</div>
      </div>
    );
  }

  const name = pickName(language, product.nameUr, product.nameEn);
  const out = product.stockQty <= 0;
  const low = !out && product.lowStockThreshold > 0 && product.stockQty <= product.lowStockThreshold;

  return (
    <div className="screen product-sale">
      <div className="screen__head">
        <button type="button" className="btn btn--quiet" onClick={() => navigate('/sell')}>
          {t('action.back')}
        </button>
        <h1 className="screen__title">{t('sell.productTitle')}</h1>
      </div>

      <div className="screen__body product-sale__body">
        <div className="product-sale__hero">
          <ProductPhoto
            productId={product.id}
            hasPhoto={product.hasPhoto}
            name={name}
            className="product-sale__photo"
          />
          <div className="product-sale__summary">
            <h2 className="product-sale__name">{name}</h2>
            <span className="product-sale__price money">{formatPKR(product.pricePaisa)}</span>
            <span className={`product-sale__stock${out ? ' product-sale__stock--out' : low ? ' product-sale__stock--low' : ''}`}>
              {out
                ? t('sell.productOut')
                : t('sell.productAvailable', {
                    qty: formatQty(product.stockQty),
                    unit: t(`unit.${product.unit}` as never),
                  })}
            </span>
          </div>
        </div>

        <div className="product-sale__quantity">
          <span className="field__label">{t('common.qty')} · {t(`unit.${product.unit}` as never)}</span>
          <div className="product-sale__stepper">
            <button type="button" className="btn" onClick={() => change(-step)} aria-label="Decrease quantity">
              −
            </button>
            <input
              className="input num product-sale__input"
              inputMode={FRACTIONAL_UNITS.has(product.unit) ? 'decimal' : 'numeric'}
              value={String(quantity)}
              onChange={(event) => {
                const next = roundQty(Number(event.target.value));
                if (Number.isFinite(next) && next > 0) setQuantity(next);
              }}
              aria-label={t('common.qty')}
              data-testid="product-quantity"
            />
            <button type="button" className="btn" onClick={() => change(step)} aria-label="Increase quantity">
              +
            </button>
          </div>
          <span className="field__hint">{formatPKR(product.pricePaisa)} × {formatQty(quantity)}</span>
        </div>

        <div className="product-sale__total">
          <span>{t('sell.lineTotal')}</span>
          <span className="money money--total">{formatPKR(linePaisa)}</span>
        </div>
      </div>

      <div className="product-sale__actions">
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={() => {
            addProduct(product, quantity);
            toast(name);
            navigate('/sell');
          }}
          data-testid="add-product-to-cart"
        >
          {t('sell.addToCart')} · {formatPKR(linePaisa)}
        </button>
      </div>
    </div>
  );
}
