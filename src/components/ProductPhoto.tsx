import { useEffect, useState } from 'react';

import { getProductPhoto } from '../db/repos/productsRepo';
import { photoObjectUrl } from '../lib/photo';

interface ProductPhotoProps {
  productId: number;
  hasPhoto: boolean;
  name: string;
  className?: string;
}

/** A small, self-cleaning image for product cards and product detail screens. */
export function ProductPhoto({ productId, hasPhoto, name, className = '' }: ProductPhotoProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);

    if (hasPhoto) {
      void getProductPhoto(productId).then((photo) => {
        if (!active || !photo) return;
        objectUrl = photoObjectUrl(photo);
        setUrl(objectUrl);
      });
    }

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [productId, hasPhoto]);

  if (!url) {
    return (
      <span className={`product-photo product-photo--empty ${className}`.trim()} aria-hidden="true">
        {name.trim().slice(0, 1).toUpperCase() || '•'}
      </span>
    );
  }

  return <img className={`product-photo ${className}`.trim()} src={url} alt="" />;
}
