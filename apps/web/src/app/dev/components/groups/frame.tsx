'use client';

import { AppSidebar } from '@askcalls/ui/components/AppSidebar';
import { Kbd } from '@askcalls/ui/components/Kbd';
import { LockStatus } from '@askcalls/ui/components/LockStatus';
import { Logo } from '@askcalls/ui/components/Logo';
import { MobileTabBar } from '@askcalls/ui/components/MobileTabBar';
import { MobileTopBar } from '@askcalls/ui/components/MobileTopBar';
import { PageHeader } from '@askcalls/ui/components/PageHeader';
import { ShortcutsDialog } from '@askcalls/ui/components/ShortcutsDialog';
import { Badge } from '@askcalls/ui/primitives/badge';
import { Button } from '@askcalls/ui/primitives/button';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { Specimen, State, useCopy } from '../shell';

const copy = {
  en: {
    nav: {
      calls: 'Calls',
      upload: 'Upload',
      tags: 'Tags and rules',
      contacts: 'Contacts',
      settings: 'Settings',
      admin: 'Admin',
      main: 'Main',
      instance: 'Instance',
      shortcuts: 'Keyboard shortcuts',
      brand: 'AskCalls',
    },
    tabs: {
      calls: 'Calls',
      upload: 'Upload',
      tags: 'Tags',
      contacts: 'Contacts',
      settings: 'Settings',
      main: 'Main',
    },
    lock: { lock: 'Lock', lockNow: 'Lock now', autoLock: 'Locks after 15 min idle' },
    account: { name: 'Dana Levi', initials: 'DL', detail: 'Free beta · 212/500' },
    calls: 'Calls',
    call: 'Call',
    back: 'Back to calls',
    upload: 'Upload',
    instance: 'Instance',
    version: 'Version 1.0.0',
    security: 'Security',
    securityNote: 'Keep at least two ways to unlock.',
    shortcuts: {
      title: 'Keyboard shortcuts',
      note: 'Single-key shortcuts can be turned off in Settings → Privacy.',
      columns: [
        [
          {
            title: 'Calls',
            items: [
              { label: 'Search', keys: ['/'] },
              { label: 'Next / previous call', keys: ['j', 'k'] },
              { label: 'Open call', keys: ['Enter'] },
              { label: 'Star', keys: ['s'] },
              { label: 'Tags', keys: ['t'] },
            ],
          },
          {
            title: 'Everywhere',
            items: [
              { label: 'Close or clear', keys: ['Esc'] },
              { label: 'Lock', keys: ['⇧', 'L'] },
              { label: 'This list', keys: ['?'] },
              { label: 'Go to calls', keys: ['g', 'c'] },
            ],
          },
        ],
        [
          {
            title: 'Call view',
            items: [
              { label: 'Play or pause', keys: ['Space'] },
              { label: 'Back / forward 5 s', keys: ['←', '→'] },
              { label: 'Next / previous hit', keys: ['n', '⇧N'] },
              { label: 'Ask about this call', keys: ['a'] },
              { label: 'Send question', keys: ['⌘', 'Enter'] },
            ],
          },
        ],
      ],
      open: 'Show shortcuts',
    },
  },
  he: {
    nav: {
      calls: 'שיחות',
      upload: 'העלאה',
      tags: 'תגיות וכללים',
      contacts: 'אנשי קשר',
      settings: 'הגדרות',
      admin: 'ניהול',
      main: 'ראשי',
      instance: 'מופע',
      shortcuts: 'קיצורי מקלדת',
      brand: 'AskCalls',
    },
    tabs: {
      calls: 'שיחות',
      upload: 'העלאה',
      tags: 'תגיות',
      contacts: 'אנשי קשר',
      settings: 'הגדרות',
      main: 'ראשי',
    },
    lock: { lock: 'נעילה', lockNow: 'נעילה עכשיו', autoLock: 'ננעל אחרי 15 דקות ללא פעילות' },
    account: { name: 'דנה לוי', initials: 'דל', detail: 'בטא חינמית · 212/500' },
    calls: 'שיחות',
    call: 'שיחה',
    back: 'חזרה לשיחות',
    upload: 'העלאה',
    instance: 'מופע',
    version: 'גרסה 1.0.0',
    security: 'אבטחה',
    securityNote: 'כדאי לשמור לפחות שתי דרכים לביטול נעילה.',
    shortcuts: {
      title: 'קיצורי מקלדת',
      note: 'אפשר לכבות קיצורים של מקש אחד בהגדרות ← פרטיות.',
      columns: [
        [
          {
            title: 'שיחות',
            items: [
              { label: 'חיפוש', keys: ['/'] },
              { label: 'שיחה הבאה / קודמת', keys: ['j', 'k'] },
              { label: 'פתיחת שיחה', keys: ['Enter'] },
              { label: 'כוכב', keys: ['s'] },
              { label: 'תגיות', keys: ['t'] },
            ],
          },
          {
            title: 'בכל מקום',
            items: [
              { label: 'סגירה או ניקוי', keys: ['Esc'] },
              { label: 'נעילה', keys: ['⇧', 'L'] },
              { label: 'הרשימה הזאת', keys: ['?'] },
              { label: 'מעבר לשיחות', keys: ['g', 'c'] },
            ],
          },
        ],
        [
          {
            title: 'תצוגת שיחה',
            items: [
              { label: 'ניגון או השהיה', keys: ['Space'] },
              { label: 'אחורה / קדימה 5 שנ׳', keys: ['←', '→'] },
              { label: 'התאמה הבאה / קודמת', keys: ['n', '⇧N'] },
              { label: 'שאלה על השיחה', keys: ['a'] },
              { label: 'שליחת שאלה', keys: ['⌘', 'Enter'] },
            ],
          },
        ],
      ],
      open: 'הצגת הקיצורים',
    },
  },
};

const hrefs = { calls: '#', upload: '#', tags: '#', contacts: '#', settings: '#', admin: '#' };
const noop = () => {};

export function FrameGroup() {
  const c = useCopy(copy);
  const [shortcuts, setShortcuts] = useState(false);
  return (
    <>
      <Specimen name="AppSidebar" note="lg: 240 px sidebar · md: 72 px rail · phones: hidden">
        <div className="flex gap-4">
          <State label="member, Calls current">
            <div className="h-144 overflow-hidden rounded-lg border border-border">
              <AppSidebar
                active="calls"
                hrefs={hrefs}
                callCount={212}
                labels={c.nav}
                account={c.account}
                lock={<LockStatus onLock={noop} labels={c.lock} />}
                onShortcuts={() => setShortcuts(true)}
                className="h-full"
              />
            </div>
          </State>
          <State label="admin, Admin current">
            <div className="h-144 overflow-hidden rounded-lg border border-border">
              <AppSidebar
                active="admin"
                hrefs={hrefs}
                isAdmin
                callCount={212}
                labels={c.nav}
                account={c.account}
                lock={<LockStatus onLock={noop} labels={c.lock} shortcut={false} />}
                onShortcuts={() => setShortcuts(true)}
                className="h-full"
              />
            </div>
          </State>
        </div>
      </Specimen>
      <div className="flex flex-col gap-12">
        <Specimen name="LockStatus">
          <div className="flex flex-wrap items-center gap-6">
            <State label="sidebar">
              <div className="w-56 rounded-lg bg-sidebar p-2">
                <LockStatus onLock={noop} labels={c.lock} shortcut={false} />
              </div>
            </State>
            <State label="icon">
              <LockStatus variant="icon" onLock={noop} labels={c.lock} shortcut={false} />
            </State>
          </div>
        </Specimen>
        <Specimen name="Logo">
          <div className="flex items-center gap-6">
            <Logo name="AskCalls" />
            <Logo size="sm" />
          </div>
        </Specimen>
        <Specimen name="Kbd">
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
            <span className="flex items-center gap-1">
              <Kbd>/</Kbd>
              {c.shortcuts.columns[0]?.[0]?.items[0]?.label}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>j</Kbd>
              <Kbd>k</Kbd>
            </span>
            <Kbd>⇧L</Kbd>
            <Kbd>Enter</Kbd>
            <Kbd>↵</Kbd>
          </div>
        </Specimen>
        <Specimen name="ShortcutsDialog">
          <Button variant="outline" onClick={() => setShortcuts(true)} className="self-start">
            {c.shortcuts.open}
          </Button>
          <ShortcutsDialog
            open={shortcuts}
            onOpenChange={setShortcuts}
            title={c.shortcuts.title}
            columns={c.shortcuts.columns}
            note={c.shortcuts.note}
            closeLabel={useCopy({ en: 'Close', he: 'סגירה' })}
          />
        </Specimen>
      </div>
      <Specimen name="PageHeader" wide>
        <State label="title only">
          <PageHeader title={c.calls} />
        </State>
        <State label="with actions">
          <PageHeader title={c.instance} actions={<Badge>{c.version}</Badge>} />
        </State>
        <State label="with a description the user acts on">
          <PageHeader title={c.security} description={c.securityNote} />
        </State>
      </Specimen>
      <Specimen name="MobileTopBar" note="phones only; the gallery frames it" wide>
        <div className="grid gap-4 md:grid-cols-2">
          <State label="list page with action">
            <div className="overflow-hidden rounded-lg border border-border [&>header]:flex">
              <MobileTopBar
                title={c.calls}
                action={
                  <Button variant="ghost" size="icon" aria-label={c.upload}>
                    <Upload className="size-4.5" aria-hidden />
                  </Button>
                }
                lock={<LockStatus variant="icon" onLock={noop} labels={c.lock} shortcut={false} />}
              />
            </div>
          </State>
          <State label="detail page with back">
            <div className="overflow-hidden rounded-lg border border-border [&>header]:flex">
              <MobileTopBar
                title={c.call}
                back={{ href: '#', label: c.back }}
                lock={<LockStatus variant="icon" onLock={noop} labels={c.lock} shortcut={false} />}
              />
            </div>
          </State>
        </div>
      </Specimen>
      <Specimen name="MobileTabBar" note="phones only, fixed to the bottom; shown framed here" wide>
        <div className="relative h-20 overflow-hidden rounded-lg border border-border [transform:translateZ(0)] [&>nav]:grid">
          <MobileTabBar active="calls" hrefs={hrefs} labels={c.tabs} />
        </div>
      </Specimen>
    </>
  );
}
