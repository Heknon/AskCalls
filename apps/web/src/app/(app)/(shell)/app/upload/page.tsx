import { useTranslations } from 'next-intl';
import { Screen } from '../../_shell/screen';

export default function UploadPage() {
  const t = useTranslations('upload');
  return <Screen title={t('title')} />;
}
