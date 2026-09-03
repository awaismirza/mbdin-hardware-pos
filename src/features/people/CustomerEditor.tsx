import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useT, useToast } from '@/appStore';
import { Switch } from '@/components/EmptyState';
import { Screen } from '@/components/app/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createCustomer,
  deleteCustomerPhoto,
  getCustomer,
  setCustomerPhoto,
  updateCustomer,
} from '@/db/repos/customersRepo';
import { parsePaisa } from '@/lib/money';
import type { PreparedPhoto } from '@/lib/photo';
import { CustomerPhotoField } from './CustomerPhotoField';

interface FormState {
  name: string;
  phone: string;
  address: string;
  notes: string;
  creditLimit: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: '',
  phone: '',
  address: '',
  notes: '',
  creditLimit: '',
  isActive: true,
};

export function CustomerEditor() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const params = useParams();

  const customerId = params['id'] === 'new' ? null : Number(params['id']);
  const isNew = customerId === null;

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<PreparedPhoto | null | undefined>(undefined);

  useEffect(() => {
    if (isNew) return;
    void getCustomer(customerId).then((customer) => {
      if (!customer) return;
      setForm({
        name: customer.name,
        phone: customer.phone ?? '',
        address: customer.address ?? '',
        notes: customer.notes ?? '',
        creditLimit:
          customer.creditLimitPaisa === 0 ? '' : String(customer.creditLimitPaisa / 100),
        isActive: customer.isActive,
      });
    });
  }, [customerId, isNew]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function save() {
    if (!form.name.trim()) {
      setError(t('people.nameRequired'));
      return;
    }
    setBusy(true);
    try {
      const draft = {
        name: form.name,
        phone: form.phone,
        address: form.address,
        notes: form.notes,
        creditLimitPaisa: parsePaisa(form.creditLimit) ?? 0,
        isActive: form.isActive,
      };
      const id = isNew
        ? await createCustomer(draft)
        : (await updateCustomer({ ...draft, id: customerId }), customerId);

      if (photo) await setCustomerPhoto(id, photo);
      else if (photo === null) await deleteCustomerPhoto(id);

      toast(t('people.saved'));
      navigate(`/people/${String(id)}`);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={isNew ? t('people.addCustomer') : t('people.editCustomer')}
      onBack={() => navigate('/people')}
      scroll={false}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('common.name')}</span>
            <Input
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              autoFocus
            />
            {error && <span className="text-sm text-destructive">{error}</span>}
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('common.phone')}</span>
            <Input
              className="num"
              inputMode="tel"
              dir="ltr"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              placeholder="03001234567"
            />
          </label>

          <label className="grid gap-2 sm:col-span-2">
            <span className="text-sm font-medium">{t('common.address')}</span>
            <Input
              value={form.address}
              onChange={(event) => set('address', event.target.value)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm font-medium">{t('people.creditLimit')}</span>
            <Input
              className="num"
              inputMode="decimal"
              value={form.creditLimit}
              onChange={(event) => set('creditLimit', event.target.value)}
              placeholder="0"
            />
            <span className="text-sm text-muted-foreground">{t('people.creditLimitHint')}</span>
          </label>

          <label className="grid gap-2 sm:col-span-2">
            <span className="text-sm font-medium">{t('common.notes')}</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/40"
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
            />
          </label>

          <div className="sm:col-span-2">
            <CustomerPhotoField customerId={isNew ? null : customerId} onChange={setPhoto} />
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
        <Button variant="outline" className="flex-1" onClick={() => navigate('/people')}>
          {t('action.cancel')}
        </Button>
        <Button className="flex-1" onClick={() => void save()} disabled={busy}>
          {busy ? t('common.saving') : t('action.save')}
        </Button>
      </div>
    </Screen>
  );
}
