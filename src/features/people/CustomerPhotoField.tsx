import { useEffect, useRef, useState } from 'react';

import { useT, useToast } from '@/appStore';
import { Button } from '@/components/ui/button';
import { getCustomerPhoto } from '@/db/repos/customersRepo';
import { photoObjectUrl, preparePhoto, type PreparedPhoto } from '@/lib/photo';

interface CustomerPhotoFieldProps {
  customerId: number | null;
  onChange: (photo: PreparedPhoto | null) => void;
}

/** Capture a customer portrait with the front camera or choose a file. */
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
    <div className="grid justify-items-start gap-2">
      <span className="text-sm font-medium">{t('common.photo')}</span>
      <div className="grid size-32 place-items-center overflow-hidden rounded-full border bg-muted text-xs text-muted-foreground">
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <span>{t('common.nothingHere')}</span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          {url ? t('people.retakePhoto') : t('people.takePhoto')}
        </Button>
        {url && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={remove}
          >
            {t('people.removePhoto')}
          </Button>
        )}
      </div>
    </div>
  );
}
