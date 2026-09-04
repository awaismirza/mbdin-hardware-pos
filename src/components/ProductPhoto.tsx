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
    /*
     * Spec: the image well carries the product's name when there is no photo.
     * A whole word is a far better target on a busy grid than one letter — most
     * of this shop's catalogue starts with the same handful of Urdu letters —
     * so the name goes in whole and the box clips it.
     */
    return (
      <span
        className={`product-photo product-photo--empty overflow-hidden px-1 text-center leading-tight ${className}`.trim()}
        aria-hidden="true"
      >
        <span className="line-clamp-2">{name.trim() || '•'}</span>
      </span>
    );
  }

  return <img className={`product-photo ${className}`.trim()} src={url} alt="" />;
}
