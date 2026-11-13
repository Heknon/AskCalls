import { useTranslations } from 'next-intl';
import { Screen } from '../../_shell/screen';

export default function InstancePage() {
  const t = useTranslations('admin');
  return <Screen title={t('title')} />;
}
