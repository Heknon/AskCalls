import { useTranslations } from 'next-intl';
import { Screen } from '../../_shell/screen';

export default function ContactsPage() {
  const t = useTranslations('contacts');
  return <Screen title={t('title')} />;
}
