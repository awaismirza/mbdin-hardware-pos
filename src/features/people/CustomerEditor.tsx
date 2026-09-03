import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useT, useToast } from '../../appStore';
import { Switch } from '../../components/EmptyState';
import { createCustomer, getCustomer, updateCustomer } from '../../db/repos/customersRepo';
import { parsePaisa } from '../../lib/money';

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
      const id = isNew ? await createCustomer(draft) : (await updateCustomer({ ...draft, id: customerId }), customerId);
      toast(t('people.saved'));
      navigate(`/people/${String(id)}`);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="screen__head">
        <button type="button" className="btn btn--quiet" onClick={() => navigate('/people')}>
          {t('action.back')}
        </button>
        <h1 className="screen__title">
          {isNew ? t('people.addCustomer') : t('people.editCustomer')}
        </h1>
      </div>

      <div className="screen__body">
        <div className="form-grid">
          <label className="field">
            <span className="field__label">{t('common.name')}</span>
            <input
              className="input"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              data-autofocus
            />
            {error && <span className="field__error">{error}</span>}
          </label>

          <label className="field">
            <span className="field__label">{t('common.phone')}</span>
            <input
              className="input num"
              inputMode="tel"
              dir="ltr"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              placeholder="03001234567"
            />
          </label>

          <label className="field form-grid__wide">
            <span className="field__label">{t('common.address')}</span>
            <input
              className="input"
              value={form.address}
              onChange={(event) => set('address', event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">{t('people.creditLimit')}</span>
            <input
              className="input num"
              inputMode="decimal"
              value={form.creditLimit}
              onChange={(event) => set('creditLimit', event.target.value)}
              placeholder="0"
            />
            <span className="field__hint">{t('people.creditLimitHint')}</span>
          </label>

          <label className="field form-grid__wide">
            <span className="field__label">{t('common.notes')}</span>
            <textarea
              className="textarea"
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
            />
          </label>

          <div className="form-grid__wide">
            <Switch
              checked={form.isActive}
              onChange={(checked) => set('isActive', checked)}
              label={t('stock.active')}
            />
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn" onClick={() => navigate('/people')}>
          {t('action.cancel')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? t('common.saving') : t('action.save')}
        </button>
      </div>
    </div>
  );
}
