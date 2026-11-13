'use client';

import { Suspense } from 'react';
import type { GroupKey } from './groups';
import { CallViewGroup } from './groups/call';
import { FeedbackGroup } from './groups/feedback';
import { FrameGroup } from './groups/frame';
import { ListGroup } from './groups/list';
import { MarketingGroup } from './groups/marketing';
import { OrganiseGroup } from './groups/organise';
import { PrimitivesGroup } from './groups/primitives';
import { SearchGroup } from './groups/search';
import { SettingsGroup } from './groups/settings';
import { TrustGroup } from './groups/trust';
import { UploadGroup } from './groups/upload';
import { GalleryShell } from './shell';

const pages: Record<GroupKey, () => React.JSX.Element> = {
  frame: FrameGroup,
  list: ListGroup,
  search: SearchGroup,
  call: CallViewGroup,
  trust: TrustGroup,
  upload: UploadGroup,
  organise: OrganiseGroup,
  settings: SettingsGroup,
  feedback: FeedbackGroup,
  marketing: MarketingGroup,
  primitives: PrimitivesGroup,
};

export function Gallery({ group }: { group: GroupKey }) {
  const Page = pages[group];
  return (
    <Suspense>
      <GalleryShell current={group}>
        <main className="mx-auto grid max-w-300 gap-x-8 gap-y-12 px-4 pt-8 pb-24 md:px-6 lg:grid-cols-2">
          <Page />
        </main>
      </GalleryShell>
    </Suspense>
  );
}
