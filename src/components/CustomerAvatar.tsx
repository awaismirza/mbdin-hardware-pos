import { useEffect, useState } from 'react';

import { getCustomerPhoto } from '../db/repos/customersRepo';
import { photoObjectUrl } from '../lib/photo';

interface CustomerAvatarProps {
  customerId: number;
  hasPhoto: boolean;
  name: string;
  className?: string;
}

/** Customer photos with an initial fallback, for a useful list even without portraits. */
export function CustomerAvatar({ customerId, hasPhoto, name, className = '' }: CustomerAvatarProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);

    if (hasPhoto) {
      void getCustomerPhoto(customerId).then((photo) => {
        if (!active || !photo) return;
        objectUrl = photoObjectUrl(photo);
        setUrl(objectUrl);
      });
    }

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [customerId, hasPhoto]);

  if (!url) {
    return (
      <span className={`customer-avatar customer-avatar--initial ${className}`.trim()} aria-hidden="true">
        {name.trim().slice(0, 1).toUpperCase() || '•'}
      </span>
    );
  }

  return <img className={`customer-avatar ${className}`.trim()} src={url} alt="" />;
}
