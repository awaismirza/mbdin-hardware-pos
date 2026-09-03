import { useT } from '../../appStore';
import { EmptyState } from '../../components/EmptyState';

/** Placeholder until M2. */
export function StockRoutes() {
  const t = useT();
  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('stock.title')}</h1>
      </div>
      <div className="screen__body">
        <EmptyState text={t('stock.empty')} />
      </div>
    </div>
  );
}
