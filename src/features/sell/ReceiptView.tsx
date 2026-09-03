import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, RotateCcw, Send, Trash2 } from 'lucide-react';

import { useApp, useLanguage, useT, useToast } from '@/appStore';
import { Dialog } from '@/components/Dialog';
import { Screen } from '@/components/app/Screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSale, voidSale } from '@/db/repos/salesRepo';
import { formatDateTime } from '@/lib/dates';
import { formatPKR, formatQty } from '@/lib/money';
import { receiptText, waLink } from '@/lib/whatsapp';
import type { SaleWithItems } from '@/types/domain';

import './receipt.css';

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
      <Screen title={t('receipt.title')} onBack={() => navigate('/sell')}>
        <p className="p-8 text-center text-muted-foreground">{t('common.loading')}</p>
      </Screen>
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
    <Screen
      title={t('receipt.title')}
      onBack={() => navigate('/sell')}
      actions={
        sale.status === 'void' ? (
          <Badge variant="secondary" data-testid="void-tag">
            {t('reports.voided')}
          </Badge>
        ) : undefined
      }
    >
      <div className="mx-auto max-w-md p-4">
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

        <div className="receipt__actions mt-4 grid gap-2">
          <Button size="lg" onClick={() => window.print()}>
            <Printer className="size-4" /> {t('receipt.print')}
          </Button>
          <Button variant="outline" onClick={sendWhatsapp}>
            <Send className="size-4" /> {t('receipt.whatsapp')}
          </Button>
          <Button onClick={() => navigate('/sell')} data-testid="new-sale">
            <RotateCcw className="size-4" /> {t('receipt.newSale')}
          </Button>
          {sale.status !== 'void' && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmVoid(true)}
            >
              <Trash2 className="size-4" /> {t('receipt.void')}
            </Button>
          )}
        </div>
      </div>

      {confirmVoid && (
        <Dialog
          title={t('receipt.voidTitle')}
          onClose={() => setConfirmVoid(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmVoid(false)}>
                {t('action.cancel')}
              </Button>
              <Button variant="destructive" onClick={() => void doVoid()} data-testid="confirm-void">
                {t('receipt.void')}
              </Button>
            </>
          }
        >
          <p>{t('receipt.voidBody')}</p>
        </Dialog>
      )}
    </Screen>
  );
}
