import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useApp } from '@/appStore';
import { listCustomers } from '@/db/repos/customersRepo';
import { listLowStock } from '@/db/repos/stockRepo';

export interface NavCounts {
  /** Products at or below their warn-below level, or at zero. */
  lowStock: number;
  /** People with a balance still owing. */
  owing: number;
}

/**
 * The count badges on the sidebar and rail.
 *
 * Two small queries, re-run when the route changes rather than on a timer: the
 * numbers only move when the shopkeeper has just done something, and landing on
 * a new screen is exactly when they should be right. On a local SQLite this
 * costs nothing worth measuring.
 */
export function useNavCounts(): NavCounts {
  const status = useApp((state) => state.status);
  const { pathname } = useLocation();
  const [counts, setCounts] = useState<NavCounts>({ lowStock: 0, owing: 0 });

  useEffect(() => {
    if (status !== 'ready') return;
    let live = true;
    void (async () => {
      try {
        const [low, owing] = await Promise.all([
          listLowStock(99),
          listCustomers({ owingOnly: true, limit: 99 }),
        ]);
        if (live) setCounts({ lowStock: low.length, owing: owing.length });
      } catch {
        // A badge is decoration. It must never take the shell down with it.
      }
    })();
    return () => {
      live = false;
    };
  }, [status, pathname]);

  return counts;
}
