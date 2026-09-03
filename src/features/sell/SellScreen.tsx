import { useT } from '../../appStore';
import { EmptyState } from '../../components/EmptyState';

/** Placeholder until M3. */
export function SellScreen() {
  const t = useT();
  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('nav.sell')}</h1>
      </div>
      <div className="screen__body">
        <EmptyState text={t('sell.noProducts')} />
      </div>
    </div>
  );
}
