import { useTranslations } from 'next-intl';
import { Screen } from '../_shell/screen';

export default function CallsPage() {
  const t = useTranslations('calls');
  return <Screen title={t('title')} />;
}
