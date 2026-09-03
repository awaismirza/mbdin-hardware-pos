import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useApp, useLanguage, useT, useToast } from '../../appStore';
import { Dialog } from '../../components/Dialog';
import { getSale, voidSale } from '../../db/repos/salesRepo';
import { formatDateTime } from '../../lib/dates';
import { formatPKR, formatQty } from '../../lib/money';
import { receiptText, waLink } from '../../lib/whatsapp';
import type { SaleWithItems } from '../../types/domain';

export function ReceiptView() {
  const t = useT();
  const language = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useApp((state) => state.settings);
  const saleId = Number(useParams()['id']);

  const [sale, setSale] = useState<SaleWithItems | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);

  useEffect(() => {
    void getSale(saleId).then(setSale);
  }, [saleId]);

  if (!sale) {
    return (
      <div className="screen">
        <div className="screen__body empty">{t('common.loading')}</div>
      </div>
    );
  }

  const shop = {
    name: settings['shop_name'] ?? '',
    phone: settings['shop_phone'] ?? '',
    footer: settings['receipt_footer'] ?? '',
  };
  const due = sale.totalPaisa - sale.paidPaisa;

  function sendWhatsapp() {
    if (!sale) return;
    if (!sale.customerPhone) {
      toast(t('receipt.noPhone'), 'warn');
      return;
    }
    const url = waLink(sale.customerPhone, receiptText(sale, shop));
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function doVoid() {
    await voidSale(saleId);
    setSale(await getSale(saleId));
    setConfirmVoid(false);
    toast(t('receipt.voided'));
  }

  return (
    <div className="screen">
      <div className="screen__head">
        <button type="button" className="btn btn--quiet" onClick={() => navigate('/sell')}>
          {t('action.back')}
        </button>
        <h1 className="screen__title">{t('receipt.title')}</h1>
        {sale.status === 'void' && <span className="tag tag--void">{t('reports.voided')}</span>}
      </div>

      <div className="screen__body">
        <div className="receipt">
          <div className="slip" lang={language}>
            {shop.name && <div className="slip__shop">{shop.name}</div>}
            {shop.phone && <div className="slip__meta num">{shop.phone}</div>}
            {settings['shop_address'] && <div className="slip__meta">{settings['shop_address']}</div>}

            <hr className="slip__rule" />

            <div className="slip__line">
              <span className="slip__line-name">{t('receipt.invoice')}</span>
              <span className="slip__line-amount num">{sale.invoiceNo}</span>
            </div>
            <div className="slip__line">
              <span className="slip__line-name">{t('common.date')}</span>
              <span className="slip__line-amount num">{formatDateTime(sale.createdAt)}</span>
            </div>
            {sale.customerName && (
              <div className="slip__line">
                <span className="slip__line-name">{t('sell.customer')}</span>
                <span className="slip__line-amount">{sale.customerName}</span>
              </div>
            )}

            <hr className="slip__rule" />

            {sale.items.map((item) => (
              <div key={item.id}>
                <div className="slip__line">
                  <span className="slip__line-name">{item.nameSnapshot}</span>
                </div>
                <div className="slip__line">
                  <span className="slip__line-name slip__line-qty num">
                    {formatQty(item.qty)} × {formatPKR(item.pricePaisa, { symbol: false })}
                  </span>
                  <span className="slip__line-amount num">
                    {formatPKR(item.linePaisa, { symbol: false })}
                  </span>
                </div>
              </div>
            ))}

            <hr className="slip__rule" />

            {sale.discountPaisa > 0 && (
              <>
                <div className="slip__line">
                  <span className="slip__line-name">{t('common.subtotal')}</span>
                  <span className="slip__line-amount num">
                    {formatPKR(sale.subtotalPaisa, { symbol: false })}
                  </span>
                </div>
                <div className="slip__line">
                  <span className="slip__line-name">{t('common.discount')}</span>
                  <span className="slip__line-amount num">
                    -{formatPKR(sale.discountPaisa, { symbol: false })}
                  </span>
                </div>
              </>
            )}

            <div className="slip__line slip__total">
              <span className="slip__line-name">{t('common.total')}</span>
              <span className="slip__line-amount num">{formatPKR(sale.totalPaisa)}</span>
            </div>
            <div className="slip__line">
              <span className="slip__line-name">{t('receipt.paid')}</span>
              <span className="slip__line-amount num">
                {formatPKR(sale.paidPaisa, { symbol: false })}
              </span>
            </div>
            {due > 0 && (
              <div className="slip__line slip__total">
                <span className="slip__line-name">{t('receipt.due')}</span>
                <span className="slip__line-amount num">{formatPKR(due, { symbol: false })}</span>
              </div>
            )}

            <hr className="slip__rule" />
            <div className="slip__footer">{shop.footer || t('receipt.thankYou')}</div>
          </div>

          <div className="receipt__actions">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => window.print()}
            >
              {t('receipt.print')}
            </button>
            <button type="button" className="btn" onClick={sendWhatsapp}>
              {t('receipt.whatsapp')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate('/sell')}
              data-testid="new-sale"
            >
              {t('receipt.newSale')}
            </button>
            {sale.status !== 'void' && (
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => setConfirmVoid(true)}
              >
                {t('receipt.void')}
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmVoid && (
        <Dialog
          title={t('receipt.voidTitle')}
          onClose={() => setConfirmVoid(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirmVoid(false)}>
                {t('action.cancel')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void doVoid()}
                data-testid="confirm-void"
              >
                {t('receipt.void')}
              </button>
            </>
          }
        >
          <p>{t('receipt.voidBody')}</p>
        </Dialog>
      )}
    </div>
  );
}
