import { useEffect, useRef, useState } from 'react';

import { useT, useToast } from '../../appStore';
import { photoObjectUrl, preparePhoto, type PreparedPhoto } from '../../lib/photo';
import { getProductPhoto } from '../../db/repos/productsRepo';

interface PhotoFieldProps {
  /** Existing product whose photo should be loaded, or null when creating. */
  productId: number | null;
  /** Called with the new bytes, or null to remove the photo. */
  onChange: (photo: PreparedPhoto | null) => void;
}

/**
 * Take or replace a product photo.
 *
 * The input is `capture="environment"`, which asks the device for its rear
 * camera. On Android and iOS that opens the real camera app. On a desktop
 * browser the attribute is ignored and it falls back to a file picker, which is
 * the right behaviour there.
 */
export function PhotoField({ productId, onChange }: PhotoFieldProps) {
  const t = useT();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the stored photo when editing. The object URL is revoked on unmount
  // and on replacement, or the tablet leaks a few megabytes a session.
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
      // Clear the input so picking the same file twice still fires a change.
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
        capture="environment"
        className="visually-hidden"
        onChange={(event) => void onPick(event.target.files?.[0])}
      />

      <div className="photo__actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {url ? t('stock.retakePhoto') : t('stock.takePhoto')}
        </button>
        {url && (
          <button type="button" className="btn btn--danger" onClick={remove}>
            {t('stock.removePhoto')}
          </button>
        )}
      </div>
    </div>
  );
}
