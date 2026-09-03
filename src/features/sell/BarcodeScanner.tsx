import { useEffect, useRef, useState } from 'react';

import { useT } from '../../appStore';

import './scanner.css';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

/**
 * Camera barcode scanning.
 *
 * ZXing is loaded only when this component mounts — it is ~250 KB and most
 * sales never open the scanner, so it must not sit in the initial bundle. The
 * import is inside the effect rather than at module scope for that reason.
 *
 * Scanning is always a shortcut, never the only way in: packaged goods carry
 * barcodes, loose atta and sugar do not, and a USB scanner types into the
 * search field instead. The catalogue search stays the primary path.
 */
export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    // Captured now: by cleanup time React may already have detached the ref,
    // and a stream left running keeps the camera light on at the counter.
    const element = video.current;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t('sell.scanNoCamera'));
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (stopped) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          element!,
          (result) => {
            if (!result || stopped) return;
            stopped = true;
            controls?.stop();
            onScan(result.getText().trim());
          },
        );
      } catch (cause) {
        if (stopped) return;
        const name = cause instanceof Error ? cause.name : '';
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? t('sell.scanDenied')
            : t('sell.scanNoCamera'),
        );
      }
    }

    void start();
    return () => {
      stopped = true;
      controls?.stop();
      // decodeFromConstraints owns the stream, but if its teardown misses,
      // stopping the tracks here is what actually turns the camera off.
      const stream = element?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [onScan, t]);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label={t('sell.scanTitle')}>
      <div className="scanner__head">
        <span className="scanner__title">{t('sell.scanTitle')}</span>
        <button type="button" className="btn btn--quiet scanner__close" onClick={onClose}>
          {t('action.close')}
        </button>
      </div>

      <div className="scanner__stage">
        {error ? (
          <p className="scanner__error">{error}</p>
        ) : (
          <>
            <video ref={video} className="scanner__video" muted playsInline />
            <div className="scanner__frame" aria-hidden="true" />
          </>
        )}
      </div>

      <p className="scanner__hint">{error ? '' : t('sell.scanHint')}</p>
    </div>
  );
}
