'use client';

import { useParams } from 'next/navigation';
import { CallScreen } from './_call/call-screen';

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  return <CallScreen id={id} />;
}
