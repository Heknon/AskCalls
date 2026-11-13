import { GateLayout, type GateLayoutProps } from '@askcalls/ui/components/Gate';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** `GateLayout` with the app's brand, router links and home link. */
export function GateFrame(props: Omit<GateLayoutProps, 'brand' | 'homeHref' | 'linkAs'>) {
  const t = useTranslations('common');
  return <GateLayout brand={t('brand')} homeHref="/" linkAs={Link} {...props} />;
}
