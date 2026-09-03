import { useEffect, useRef, useState } from 'react';

import { useT, useToast } from '@/appStore';
import { Button } from '@/components/ui/button';
import { photoObjectUrl, preparePhoto, type PreparedPhoto } from '@/lib/photo';
import { getProductPhoto } from '@/db/repos/productsRepo';

interface PhotoFieldProps {
  /** Existing product whose photo should be loaded, or null when creating. */
  productId: number | null;
  /** Called with the new bytes, or null to remove the photo. */
  onChange: (photo: PreparedPhoto | null) => void;
}

/** Take or replace a product photo. `capture="environment"` opens the rear
 *  camera on a phone and falls back to a file picker on desktop. */
export function PhotoField({ productId, onChange }: PhotoFieldProps) {
  const t = useT();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let revoked = false;
    let current: string | null = null;

    async function load() {
      if (productId === null) return;
      const stored = await getProductPhoto(productId);
      if (!stored || revoked) return;
      current = photoObjectUrl(stored);
      setUrl(current);
    }
    void load();

    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [productId]);

  async function onPick(file: File | undefined) {
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
      toast(t('stock.photoFailed'), 'bad');
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
      <div className="grid aspect-square w-full max-w-56 place-items-center overflow-hidden rounded-xl border bg-muted text-sm text-muted-foreground">
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
        capture="environment"
        className="sr-only"
        onChange={(event) => void onPick(event.target.files?.[0])}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          {url ? t('stock.retakePhoto') : t('stock.takePhoto')}
        </Button>
        {url && (
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={remove}
          >
            {t('stock.removePhoto')}
          </Button>
        )}
      </div>
    </div>
  );
}
