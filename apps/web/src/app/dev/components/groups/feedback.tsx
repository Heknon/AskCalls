'use client';

import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { Notice, NoticeRegion } from '@askcalls/ui/components/Notice';
import { StatusBanner } from '@askcalls/ui/components/StatusBanner';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Inbox, Lock, MessageSquareText, Phone, Tags, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Specimen, State, useCopy } from '../shell';

const copy = {
  en: {
    notices: 'Notifications',
    noCalls: 'No calls yet',
    upload: 'Upload calls',
    sample: 'Try a sample call',
    noMatch: 'No calls match',
    alsoTried: 'Also tried: מחירים, price',
    clear: 'Clear filters',
    noMatchAll: 'No calls match all of these.',
    clearSearch: 'Clear the search “מחיר”',
    anyIntent: 'Any intent',
    noTags: 'No tags yet',
    addTag: 'Add a tag',
    off: 'Ask is turned off.',
    settings: 'Settings → Providers',
    loadTitle: "Couldn't load calls",
    loadBody: "The server didn't respond. Try again.",
    retry: 'Try again',
    decryptTitle: "Can't open this call on this device",
    decryptBody: "Its key doesn't match. Reference:",
    inline: "Couldn't reach ElevenLabs. Try again.",
    pageTitle: "This page didn't load",
    pageBody: 'Something went wrong on our side.',
    goCalls: 'Go to calls',
    offline: 'Offline. Changes are paused until you reconnect.',
    importPaused: 'Import paused: 38 of 138 done.',
    resume: 'Resume',
    limit: "You've reached 500 calls. Delete calls to upload more.",
    inbox: '3 inbox items are waiting.',
    process: 'Process now',
    inboxTitle: '3 inbox items added to your calls',
    inboxBody: 'Sent from Claude through the remote MCP.',
    view: 'View',
    viewAlt: 'Open the calls list to see them',
    locked: 'AskCalls locked',
    lockedBody: 'After 15 minutes idle.',
    deleted: 'Call deleted',
    deletedBody: 'Dana Levi, 12 Nov',
    undo: 'Undo',
    undoAlt: 'The call can be restored for 5 seconds',
    error: "Couldn't star the call",
    errorBody: 'The change was undone.',
    confirm: {
      title: 'Delete this call?',
      body: 'The transcript, notes, tags and recording are deleted for good.',
      ok: 'Delete call',
      cancel: 'Cancel',
      open: 'Delete call…',
    },
  },
  he: {
    notices: 'התראות',
    noCalls: 'אין עדיין שיחות',
    upload: 'העלאת שיחות',
    sample: 'שיחה לדוגמה',
    noMatch: 'אין שיחות תואמות',
    alsoTried: 'נוסו גם: מחירים, price',
    clear: 'ניקוי מסננים',
    noMatchAll: 'אין שיחות שמתאימות לכל אלה.',
    clearSearch: 'ניקוי החיפוש „מחיר”',
    anyIntent: 'כוונה כלשהי',
    noTags: 'אין עדיין תגיות',
    addTag: 'הוספת תגית',
    off: 'שאלות כבויות.',
    settings: 'הגדרות ← ספקים',
    loadTitle: 'לא ניתן לטעון שיחות',
    loadBody: 'השרת לא הגיב. כדאי לנסות שוב.',
    retry: 'ניסיון חוזר',
    decryptTitle: 'אי אפשר לפתוח את השיחה הזאת במכשיר הזה',
    decryptBody: 'המפתח שלה לא תואם. מזהה:',
    inline: 'לא ניתן להתחבר ל-ElevenLabs. כדאי לנסות שוב.',
    pageTitle: 'הדף לא נטען',
    pageBody: 'משהו השתבש אצלנו.',
    goCalls: 'מעבר לשיחות',
    offline: 'אין חיבור. שינויים מושהים עד שהחיבור יחזור.',
    importPaused: 'הייבוא הושהה: 38 מתוך 138 הושלמו.',
    resume: 'המשך',
    limit: 'הגעת ל-500 שיחות. כדי להעלות עוד יש למחוק שיחות.',
    inbox: '3 פריטים ממתינים בתיבה.',
    process: 'עיבוד עכשיו',
    inboxTitle: '3 פריטים מהתיבה נוספו לשיחות',
    inboxBody: 'נשלחו מ-Claude דרך ה-MCP המרוחק.',
    view: 'הצגה',
    viewAlt: 'אפשר לראות אותם ברשימת השיחות',
    locked: 'AskCalls ננעלה',
    lockedBody: 'אחרי 15 דקות ללא פעילות.',
    deleted: 'השיחה נמחקה',
    deletedBody: 'דנה לוי, 12 בנוב׳',
    undo: 'ביטול',
    undoAlt: 'אפשר לשחזר את השיחה במשך 5 שניות',
    error: 'לא ניתן לסמן בכוכב',
    errorBody: 'השינוי בוטל.',
    confirm: {
      title: 'למחוק את השיחה?',
      body: 'התמלול, ההערות, התגיות וההקלטה יימחקו לצמיתות.',
      ok: 'מחיקת השיחה',
      cancel: 'ביטול',
      open: 'מחיקת השיחה…',
    },
  },
};

export function FeedbackGroup() {
  const c = useCopy(copy);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Specimen name="EmptyState">
        <State label="first-use">
          <Card>
            <EmptyState
              reason="first-use"
              icon={Phone}
              title={c.noCalls}
              action={
                <>
                  <Button variant="primary">
                    <Upload className="size-4" aria-hidden />
                    {c.upload}
                  </Button>
                  <Button variant="ghost">{c.sample}</Button>
                </>
              }
            />
          </Card>
        </State>
        <State label="filtered">
          <Card>
            <EmptyState
              reason="filtered"
              title={c.noMatch}
              detail={c.alsoTried}
              action={<Button variant="outline">{c.clear}</Button>}
            />
          </Card>
        </State>
      </Specimen>
      <Specimen name="EmptyState">
        <State label="no-results, two ways out">
          <Card>
            <EmptyState
              reason="no-results"
              title={c.noMatchAll}
              action={
                <>
                  <Button variant="outline" className="rounded-full">
                    {c.clearSearch}
                  </Button>
                  <Button variant="outline" className="rounded-full">
                    {c.anyIntent}
                  </Button>
                </>
              }
            />
          </Card>
        </State>
        <State label="first-use (tags) · feature-off">
          <Card className="grid md:grid-cols-2">
            <EmptyState
              reason="first-use"
              icon={Tags}
              title={c.noTags}
              action={<Button variant="primary">{c.addTag}</Button>}
            />
            <EmptyState
              reason="feature-off"
              icon={MessageSquareText}
              title={c.off}
              action={<Button variant="outline">{c.settings}</Button>}
            />
          </Card>
        </State>
      </Specimen>
      <Specimen name="ErrorState">
        <State label='scope="panel" with retry'>
          <ErrorState
            scope="panel"
            title={c.loadTitle}
            description={c.loadBody}
            retry={{ label: c.retry, onRetry: () => {} }}
          />
        </State>
        <State label='scope="panel" with reference'>
          <ErrorState
            scope="panel"
            title={c.decryptTitle}
            description={c.decryptBody}
            code="0193f2c4"
          />
        </State>
        <State label='scope="inline"'>
          <ErrorState scope="inline" title={c.inline} />
        </State>
      </Specimen>
      <Specimen name="ErrorState">
        <State label='scope="page"'>
          <Card>
            <ErrorState
              scope="page"
              title={c.pageTitle}
              description={c.pageBody}
              retry={{ label: c.retry, onRetry: () => {} }}
              actions={<Button variant="ghost">{c.goCalls}</Button>}
            />
          </Card>
        </State>
      </Specimen>
      <Specimen name="StatusBanner" note="offline · import · limit · inbox">
        <StatusBanner condition="offline">{c.offline}</StatusBanner>
        <StatusBanner
          condition="import"
          action={
            <Button variant="outline" size="sm">
              {c.resume}
            </Button>
          }
        >
          {c.importPaused}
        </StatusBanner>
        <StatusBanner condition="limit">{c.limit}</StatusBanner>
        <StatusBanner
          condition="inbox"
          action={
            <Button variant="outline" size="sm">
              {c.process}
            </Button>
          }
        >
          {c.inbox}
        </StatusBanner>
      </Specimen>
      <Specimen
        name="Notice"
        note="toasts, shown in place here; the app stacks them at the bottom end"
      >
        <NoticeRegion label={c.notices} className="static z-auto w-full md:w-full">
          <Notice
            kind="event"
            icon={Inbox}
            title={c.inboxTitle}
            description={c.inboxBody}
            action={{ label: c.view, altText: c.viewAlt, onAction: () => {} }}
            duration={Number.POSITIVE_INFINITY}
          />
          <Notice
            kind="event"
            icon={Lock}
            title={c.locked}
            description={c.lockedBody}
            duration={Number.POSITIVE_INFINITY}
          />
          <Notice
            kind="undo"
            icon={Trash2}
            title={c.deleted}
            description={c.deletedBody}
            action={{ label: c.undo, altText: c.undoAlt, onAction: () => {} }}
            duration={Number.POSITIVE_INFINITY}
          />
          <Notice
            kind="error"
            title={c.error}
            description={c.errorBody}
            duration={Number.POSITIVE_INFINITY}
          />
        </NoticeRegion>
      </Specimen>
      <Specimen name="ConfirmDialog" note="focus starts on Cancel">
        <Button
          variant="outline"
          className="self-start text-destructive"
          onClick={() => setConfirm(true)}
          id="open-confirm"
        >
          {c.confirm.open}
        </Button>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={c.confirm.title}
          description={c.confirm.body}
          confirmLabel={c.confirm.ok}
          cancelLabel={c.confirm.cancel}
          onConfirm={() => {}}
        />
      </Specimen>
    </>
  );
}
