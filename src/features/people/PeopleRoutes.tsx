import { useT } from '../../appStore';
import { EmptyState } from '../../components/EmptyState';

/** Placeholder until M4. */
export function PeopleRoutes() {
  const t = useT();
  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">{t('people.title')}</h1>
      </div>
      <div className="screen__body">
        <EmptyState text={t('people.empty')} />
      </div>
    </div>
  );
}
