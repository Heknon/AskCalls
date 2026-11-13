import { useTranslations } from 'next-intl';
import { Screen } from '../../../_shell/screen';

export default function CallPage() {
  const t = useTranslations('call');
  return <Screen title={t('title')} back={{ href: '/app', label: t('back') }} width="reading" />;
}
