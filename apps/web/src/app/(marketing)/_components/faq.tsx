import { getTranslations } from 'next-intl/server';

export type FaqKey =
  | 'legal'
  | 'lost'
  | 'staff'
  | 'where'
  | 'selfHost'
  | 'hebrew'
  | 'providers'
  | 'remote'
  | 'delete'
  | 'open'
  | 'limit'
  | 'ownKeys'
  | 'selfHostFree';

export async function faqItems(keys: FaqKey[]) {
  const t = await getTranslations('marketing.faq');
  return keys.map((k) => ({ key: k, question: t(`${k}.q`), answer: <p>{t(`${k}.a`)}</p> }));
}
