import { useEffect, useRef, useState } from 'react';

import { useT, useToast } from '../../appStore';
import { getCustomerPhoto } from '../../db/repos/customersRepo';
import { photoObjectUrl, preparePhoto, type PreparedPhoto } from '../../lib/photo';

interface CustomerPhotoFieldProps {
  customerId: number | null;
  onChange: (photo: PreparedPhoto | null) => void;
}

/** Capture a customer portrait with the phone camera or choose a desktop file. */
export function CustomerPhotoField({ customerId, onChange }: CustomerPhotoFieldProps) {
  const t = useT();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let revoked = false;
    let current: string | null = null;

    if (customerId !== null) {
      void getCustomerPhoto(customerId).then((stored) => {
        if (!stored || revoked) return;
        current = photoObjectUrl(stored);
        setUrl(current);
      });
    }

    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [customerId]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await preparePhoto(file);
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return photoObjectUrl(prepared);
      });
      onChange(prepared);
    } catch {
      toast(t('people.photoFailed'), 'bad');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function remove() {
    setUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    onChange(null);
  }

  return (
    <div className="photo">
      <span className="field__label">{t('common.photo')}</span>
      <div className="photo__frame">
        {url ? <img src={url} alt="" /> : <span>{t('common.nothingHere')}</span>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        className="visually-hidden"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      <div className="photo__actions">
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
          {url ? t('people.retakePhoto') : t('people.takePhoto')}
        </button>
        {url && (
          <button type="button" className="btn btn--danger" onClick={remove}>
            {t('people.removePhoto')}
          </button>
        )}
      </div>
    </div>
  );
}
