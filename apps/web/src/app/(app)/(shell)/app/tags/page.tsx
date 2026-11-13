import { useTranslations } from 'next-intl';
import { Screen } from '../../_shell/screen';

export default function TagsPage() {
  const t = useTranslations('tags');
  return <Screen title={t('title')} />;
}
