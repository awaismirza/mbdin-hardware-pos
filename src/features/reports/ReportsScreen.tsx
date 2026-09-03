import { useT } from '../../appStore';
import { EmptyState } from '../../components/EmptyState';

/** Placeholder until M6. */
export function ReportsScreen() {
  const t = useT();
  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('reports.title')}</h1>
      </div>
      <div className="screen__body">
        <EmptyState text={t('reports.noSales')} />
      </div>
    </div>
  );
}
