'use client';

import { Suspense } from 'react';
import { CallsScreen } from './_calls/calls-screen';

export default function CallsPage() {
  return (
    <Suspense>
      <CallsScreen />
    </Suspense>
  );
}
