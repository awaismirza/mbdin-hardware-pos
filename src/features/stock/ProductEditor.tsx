import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useApp, useLanguage, useT, useToast } from '@/appStore';
import { Switch } from '@/components/EmptyState';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DuplicateFieldError,
  createProduct,
  deleteProductPhoto,
  getProduct,
  listCategories,
  setProductPhoto,
  updateProduct,
} from '@/db/repos/productsRepo';
import { pickName } from '@/i18n';
import { formatPKR, marginPercent, parsePaisa, roundQty } from '@/lib/money';
import { cn } from '@/lib/cn';
import type { PreparedPhoto } from '@/lib/photo';
import { UNITS, type Category, type Unit } from '@/types/domain';
import { BarcodeScanner } from '../sell/BarcodeScanner';
import { PhotoField } from './PhotoField';

interface FormState {
  nameUr: string;
  nameEn: string;
  sku: string;
  barcode: string;
  categoryId: string;
  unit: Unit;
  cost: string;
  price: string;
  openingStock: string;
  lowStock: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  nameUr: '',
  nameEn: '',
  sku: '',
  barcode: '',
  categoryId: '',
  unit: 'piece',
  cost: '',
  price: '',
  openingStock: '',
  lowStock: '',
  isActive: true,
};

const SELECT_CLASS =
  'h-11 w-full rounded-[11px] border border-line bg-panel2 px-3 text-[13.5px] outline-none focus:border-brand focus:ring-[3px] focus:ring-ring/30';

export function ProductEditor() {
  const t = useT();
  const language = useLanguage();
  const toast = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const settings = useApp((state) => state.settings);

  const productId = params['id'] === 'new' ? null : Number(params['id']);
  const isNew = productId === null;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [photo, setPhoto] = useState<PreparedPhoto | null | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    if (isNew) {
      setForm({
        ...EMPTY,
        lowStock: settings['low_stock_default'] ?? '',
        barcode: searchParams.get('barcode') ?? '',
      });
      return;
    }
    void getProduct(productId).then((product) => {
      if (!product) return;
      setForm({
        nameUr: product.nameUr ?? '',
        nameEn: product.nameEn ?? '',
        sku: product.sku ?? '',
        barcode: product.barcode ?? '',
        categoryId: product.categoryId === null ? '' : String(product.categoryId),
        unit: product.unit,
        cost: product.costPaisa === 0 ? '' : String(product.costPaisa / 100),
        price: String(product.pricePaisa / 100),
        openingStock: '',
        lowStock: String(product.lowStockThreshold),
        isActive: product.isActive,
      });
    });
  }, [productId, isNew, settings, searchParams]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  const costPaisa = parsePaisa(form.cost) ?? 0;
  const pricePaisa = parsePaisa(form.price);
  const margin = pricePaisa === null ? null : marginPercent(costPaisa, pricePaisa);

  async function save() {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.nameUr.trim() && !form.nameEn.trim()) next.nameUr = t('stock.nameRequired');
    if (pricePaisa === null) next.price = t('stock.priceRequired');
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setSaving(true);
    try {
      const draft = {
        nameUr: form.nameUr,
        nameEn: form.nameEn,
        sku: form.sku,
        barcode: form.barcode,
        categoryId: form.categoryId === '' ? null : Number(form.categoryId),
        unit: form.unit,
        costPaisa,
        pricePaisa: pricePaisa!,
        lowStockThreshold: roundQty(Number(form.lowStock) || 0),
        isActive: form.isActive,
      };

      const id = isNew
        ? await createProduct({ ...draft, openingQty: roundQty(Number(form.openingStock) || 0) })
        : (await updateProduct({ ...draft, id: productId }), productId);

      if (photo) await setProductPhoto(id, photo);
      else if (photo === null) await deleteProductPhoto(id);

      toast(t('stock.saved'));
      navigate('/stock');
    } catch (error) {
      if (error instanceof DuplicateFieldError) {
        setErrors({
          [error.field === 'barcode' ? 'barcode' : 'sku']:
            error.field === 'barcode' ? t('stock.barcodeTaken') : t('stock.skuTaken'),
        });
      } else {
        toast(error instanceof Error ? error.message : String(error), 'bad');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title={isNew ? t('stock.addProduct') : t('stock.editProduct')}
      onBack={() => navigate('/stock')}
      scroll={false}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="grid gap-3 rounded-[14px] border border-line bg-panel p-4 shadow-card sm:grid-cols-2">
          <Field label={t('stock.nameUr')} error={errors.nameUr}>
            <Input
              value={form.nameUr}
              onChange={(event) => set('nameUr', event.target.value)}
              dir="rtl"
              autoFocus
            />
          </Field>

          <Field label={t('stock.nameEn')} error={errors.nameEn}>
            <Input
              value={form.nameEn}
              onChange={(event) => set('nameEn', event.target.value)}
              dir="ltr"
            />
          </Field>

          <Field label={t('common.category')}>
            <select
              className={SELECT_CLASS}
              value={form.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
            >
              <option value="">{t('common.none')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {pickName(language, category.nameUr, category.nameEn)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('common.unit')}>
            <select
              className={SELECT_CLASS}
              value={form.unit}
              onChange={(event) => set('unit', event.target.value as Unit)}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {t(`unit.${unit}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('common.cost')}>
            <Input
              className="num"
              inputMode="decimal"
              value={form.cost}
              onChange={(event) => set('cost', event.target.value)}
              placeholder="0"
            />
          </Field>

          <Field
            label={t('common.price')}
            error={errors.price}
            hint={
              margin === null
                ? undefined
                : `${t('stock.margin')} ${margin}% · ${formatPKR((pricePaisa ?? 0) - costPaisa)}`
            }
          >
            <Input
              className="num"
              inputMode="decimal"
              value={form.price}
              onChange={(event) => set('price', event.target.value)}
              placeholder="0"
            />
          </Field>

          {isNew && (
            <Field label={t('stock.openingStock')}>
              <Input
                className="num"
                inputMode="decimal"
                value={form.openingStock}
                onChange={(event) => set('openingStock', event.target.value)}
                placeholder="0"
              />
            </Field>
          )}

          <Field label={t('stock.lowThreshold')}>
            <Input
              className="num"
              inputMode="decimal"
              value={form.lowStock}
              onChange={(event) => set('lowStock', event.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label={t('common.sku')} error={errors.sku}>
            <Input
              className="num"
              value={form.sku}
              onChange={(event) => set('sku', event.target.value)}
              dir="ltr"
            />
          </Field>

          <Field label={t('common.barcode')} error={errors.barcode}>
            <div className="flex gap-2">
              <Input
                className="num flex-1"
                value={form.barcode}
                onChange={(event) => set('barcode', event.target.value)}
                dir="ltr"
                inputMode="numeric"
              />
              <Button variant="outline" onClick={() => setScanning(true)}>
                {t('action.scan')}
              </Button>
            </div>
          </Field>

          <div className="sm:col-span-2">
            <PhotoField productId={isNew ? null : productId} onChange={setPhoto} />
          </div>

          <div className="sm:col-span-2">
            <Switch
              checked={form.isActive}
              onChange={(checked) => set('isActive', checked)}
              label={t('stock.active')}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2 border-t bg-card p-4">
        <Button variant="outline" className="flex-1" onClick={() => navigate('/stock')}>
          {t('action.cancel')}
        </Button>
        <Button className="flex-1" onClick={() => void save()} disabled={saving}>
          {saving ? t('common.saving') : t('action.save')}
        </Button>
      </div>

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onScan={(code) => {
            set('barcode', code);
            setScanning(false);
          }}
        />
      )}
    </Screen>
  );
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: React.ReactNode;
}

function Field({ label, error, hint, children }: FieldProps) {
  return (
    <label className={cn('grid gap-1.5', error && '[&_input]:border-destructive')}>
      <span className="text-[11.5px] font-semibold text-fg2">{label}</span>
      {children}
      {error && <span className="text-[11.5px] font-medium text-bad">{error}</span>}
      {!error && hint && <span className="text-[11.5px] text-fg2">{hint}</span>}
    </label>
  );
}
