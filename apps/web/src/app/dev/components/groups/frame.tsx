'use client';

import { AppSidebar } from '@askcalls/ui/components/AppSidebar';
import { AppTopBar } from '@askcalls/ui/components/AppTopBar';
import {
  GateAccount,
  GateDivider,
  GateHeading,
  GateLayout,
  GateNote,
} from '@askcalls/ui/components/Gate';
import { Kbd } from '@askcalls/ui/components/Kbd';
import { LanguageSwitcher } from '@askcalls/ui/components/LanguageSwitcher';
import { LockStatus } from '@askcalls/ui/components/LockStatus';
import { Logo } from '@askcalls/ui/components/Logo';
import { MobileTabBar } from '@askcalls/ui/components/MobileTabBar';
import { MobileTopBar } from '@askcalls/ui/components/MobileTopBar';
import { PageHeader } from '@askcalls/ui/components/PageHeader';
import { SettingsNav } from '@askcalls/ui/components/SettingsNav';
import { ShortcutsDialog } from '@askcalls/ui/components/ShortcutsDialog';
import { Badge } from '@askcalls/ui/primitives/badge';
import { Button } from '@askcalls/ui/primitives/button';
import { Lock, Upload } from 'lucide-react';
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
    gate: {
      unlock: 'Unlock your calls',
      body: 'Use the passkey you created for AskCalls.',
      or: 'or',
      account: 'Signed in as',
      signOut: 'Sign out',
      note: 'Without a passkey or recovery code, calls can’t be recovered.',
      step: 'Step 3 of 5',
    },
    language: 'Language',
    hints: [
      { keys: ['/'], label: 'Search' },
      { keys: ['j', 'k'], label: 'Move' },
      { keys: ['s'], label: 'Star' },
      { keys: ['?'], label: 'All shortcuts' },
    ],
    sections: [
      ['security', 'Security'],
      ['recordings', 'Recordings'],
      ['retention', 'Retention'],
      ['api', 'API and MCP'],
      ['providers', 'Providers'],
      ['privacy', 'Privacy'],
    ],
    sectionsLabel: 'Settings sections',
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
    gate: {
      unlock: 'פתיחת הנעילה של השיחות',
      body: 'עם מפתח הגישה שיצרת ל-AskCalls.',
      or: 'או',
      account: 'החשבון המחובר:',
      signOut: 'יציאה',
      note: 'בלי מפתח גישה או קוד שחזור אי אפשר לשחזר את השיחות.',
      step: 'שלב 3 מתוך 5',
    },
    language: 'שפה',
    hints: [
      { keys: ['/'], label: 'חיפוש' },
      { keys: ['j', 'k'], label: 'מעבר' },
      { keys: ['s'], label: 'כוכב' },
      { keys: ['?'], label: 'כל הקיצורים' },
    ],
    sections: [
      ['security', 'אבטחה'],
      ['recordings', 'הקלטות'],
      ['retention', 'שמירת נתונים'],
      ['api', 'API ו-MCP'],
      ['providers', 'ספקים'],
      ['privacy', 'פרטיות'],
    ],
    sectionsLabel: 'חלקי ההגדרות',
    call: 'שיחה',
    back: 'חזרה לשיחות',
    upload: 'העלאה',
    instance: 'מופע',
    version: 'גרסה 1.0.0',
    security: 'אבטחה',
    securityNote: 'כדאי לשמור לפחות שתי דרכים לפתיחת הנעילה.',
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
  const [lang, setLang] = useState('en');
  const items = c.sections.map(([key, label]) => ({ key: key!, label: label!, href: '#' }));
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
      <Specimen name="AppTopBar" note="md and up; hints from xl" wide>
        <div className="overflow-hidden rounded-lg border border-border [&>div]:flex">
          <AppTopBar
            hints={c.hints}
            actions={
              <Button variant="primary">
                <Upload className="size-4" aria-hidden />
                {c.upload}
              </Button>
            }
          />
        </div>
      </Specimen>
      <Specimen name="LanguageSwitcher" note="two languages: one button; more: a menu">
        <State label="two languages">
          <div>
            <LanguageSwitcher
              value={lang}
              onChange={setLang}
              label={c.language}
              options={[
                { value: 'en', label: 'English' },
                { value: 'he', label: 'עברית' },
              ]}
            />
          </div>
        </State>
        <State label="three or more">
          <div>
            <LanguageSwitcher
              value="en"
              onChange={noop}
              label={c.language}
              options={[
                { value: 'en', label: 'English' },
                { value: 'he', label: 'עברית' },
                { value: 'ru', label: 'Русский' },
              ]}
            />
          </div>
        </State>
      </Specimen>
      <Specimen name="SettingsNav">
        <State label="list (desktop, beside the section)">
          <SettingsNav items={items} active="privacy" label={c.sectionsLabel} className="w-52" />
        </State>
        <State label="index (tablet and phone)">
          <SettingsNav items={items} label={c.sectionsLabel} variant="index" />
        </State>
      </Specimen>
      <Specimen name="GateLayout, GateHeading, GateDivider, GateAccount, GateNote" wide>
        <div className="overflow-hidden rounded-lg border border-border bg-background [&>div]:min-h-0">
          <GateLayout brand="AskCalls" homeHref="#" end={c.gate.step}>
            <GateHeading icon={Lock} title={c.gate.unlock} description={<p>{c.gate.body}</p>} />
            <GateDivider label={c.gate.or} />
            <GateAccount
              initials={c.account.initials}
              action={
                <Button variant="link" size="sm">
                  {c.gate.signOut}
                </Button>
              }
            >
              {c.gate.account} <bdi>dana@studio-noa.example</bdi>
            </GateAccount>
            <GateNote>{c.gate.note}</GateNote>
          </GateLayout>
        </div>
      </Specimen>
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
