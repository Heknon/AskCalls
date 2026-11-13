import { notFound } from 'next/navigation';
import { Gallery } from '../gallery';
import { GROUPS, type GroupKey } from '../groups';

export function generateStaticParams() {
  return GROUPS.map((g) => ({ group: g.key }));
}

export default async function GroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (!GROUPS.some((g) => g.key === group)) notFound();
  return <Gallery group={group as GroupKey} />;
}
