'use client';

import { CodeGroupInput } from '@askcalls/ui/components/CodeGroupInput';
import type { DataFlowRoute } from '@askcalls/ui/components/DataFlowNote';
import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { DeviceLinkCode } from '@askcalls/ui/components/DeviceLinkCode';
import { FingerprintCode } from '@askcalls/ui/components/FingerprintCode';
import { PassphraseField } from '@askcalls/ui/components/PassphraseField';
import { RecoveryCodeGrid } from '@askcalls/ui/components/RecoveryCodeGrid';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { Stepper } from '@askcalls/ui/components/Stepper';
import type { TrustDiagramColumn } from '@askcalls/ui/components/TrustDiagram';
import { TrustDiagram } from '@askcalls/ui/components/TrustDiagram';
import { UnlockMethodRow } from '@askcalls/ui/components/UnlockMethodRow';
import { Button } from '@askcalls/ui/primitives/button';
import { useState } from 'react';
import { common } from '../copy';
import { sampleQr } from '../samples';
import { Specimen, State, useCopy } from '../shell';

const copy = {
  en: {
    passkeys: 'Passkeys',
    addPasskey: 'Add passkey',
    devices: 'Linked devices',
    linkDevice: 'Link a device',
    recoveryTitle: 'Recovery',
    thisDevice: 'This device',
    remove: 'Remove',
    revoke: 'Revoke',
    regenerate: 'Regenerate',
    setPassphrase: 'Set passphrase',
    lastOne: 'This is your only passkey. Add another way to unlock before removing it.',
    confirmRemove: {
      title: 'Remove this passkey?',
      body: "MacBook Air · iCloud Keychain won't unlock AskCalls any more.",
      cancel: 'Cancel',
    },
    confirmRevoke: {
      title: 'Revoke askcalls agent on studio-mac?',
      body: 'The agent loses its keys and stops syncing.',
      cancel: 'Cancel',
    },
    rows: {
      mac: ['MacBook Air · iCloud Keychain', 'Created 3 Oct 2026 · Last used today on macOS'],
      pixel: [
        'Pixel 8 · Google Password Manager',
        'Created 3 Oct 2026 · Last used 9 Nov on Android',
      ],
      recovery: ['Recovery code', 'Created 3 Oct 2026 · Never used'],
      passphrase: ['Passphrase', 'Not set'],
      chrome: ['Chrome on MacBook Air', 'Linked 3 Oct 2026 · Active now'],
      agent: ['askcalls agent on studio-mac', 'Linked 20 Oct 2026 · Last used 2 hours ago'],
    } as Record<'mac' | 'pixel' | 'recovery' | 'passphrase' | 'chrome' | 'agent', [string, string]>,
    rc: {
      list: 'Recovery code, 8 groups',
      group: (n: number) => `Group ${n}`,
      copy: 'Copy',
      download: 'Download',
      print: 'Print',
      saved: 'I saved my recovery code somewhere safe',
      copied: 'Copied. Clear your clipboard after saving.',
    },
    groups: ['Group 3', 'Group 6'],
    wrong: 'Wrong code. Check each group and try again.',
    linkCode: ['Code'],
    fpQuestion: 'Does the new device show this code?',
    fpHint: 'In the terminal, askcalls link prints the same 6 digits.',
    link: {
      scan: 'Scan with the new device, or type this code',
      qr: 'QR code for linking a device',
      copy: 'Copy code',
      connected: 'A new device connected:',
      expired: 'This code expired. Create a new one.',
      renew: 'Create a new code',
    },
    left: '9:12 left',
    agent: 'askcalls agent, macOS',
    pass: {
      create: 'New passphrase',
      enter: 'Passphrase',
      show: 'Show passphrase',
      hide: 'Hide passphrase',
      hint: 'Five or more random words work well.',
      weak: 'Too easy to guess',
      ok: 'Strong enough',
      wrong: 'Wrong passphrase. Try again.',
    },
    steps: ['Welcome', 'Passkey', 'Recovery code', 'Try it', 'Connect your AI'],
    wizard: [
      'Database',
      'Storage',
      'Sign-in',
      'Transcription and AI',
      'Offline mode',
      'Admin account',
    ],
    linkSteps: ['Connect', 'Compare', 'Done'],
    trust: [
      {
        part: 'device',
        title: 'Your device',
        holds: [
          'Transcripts, audio, names, notes',
          'Your keys, unlocked by passkey',
          'Search terms and decrypted results',
        ],
        note: 'Only your device sees plaintext',
      },
      {
        part: 'server',
        title: 'AskCalls server',
        holds: [
          'Ciphertext and wrapped keys',
          'Keyed HMAC tokens for words and contacts',
          'Vectors of redacted text, day, duration bucket',
        ],
      },
      {
        part: 'storage',
        title: 'Storage',
        holds: [
          'Postgres with pgvector, in the EU',
          'Encrypted recordings in an S3 bucket',
          'Or your own bucket, signed by your device',
        ],
      },
    ] as TrustDiagramColumn[],
    exceptions: [
      [
        'managed',
        'Audio passes through AskCalls servers to ElevenLabs, streamed and never stored.',
        'ElevenLabs',
      ],
      [
        'managed',
        "This call's transcript and your question go through AskCalls to Anthropic. AskCalls doesn't store them.",
        'Anthropic',
      ],
      [
        'inbox',
        "Inbox uploads are visible to the AskCalls server in transit. They're encrypted to your key on arrival.",
        'Claude',
      ],
    ] as [DataFlowRoute, string, string][],
  },
  he: {
    passkeys: 'מפתחות גישה',
    addPasskey: 'הוספת מפתח גישה',
    devices: 'מכשירים מקושרים',
    linkDevice: 'קישור מכשיר',
    recoveryTitle: 'שחזור',
    thisDevice: 'המכשיר הזה',
    remove: 'הסרה',
    revoke: 'ביטול קישור',
    regenerate: 'יצירה מחדש',
    setPassphrase: 'הגדרת משפט סיסמה',
    lastOne: 'זה מפתח הגישה היחיד שלך. לפני הסרה יש להוסיף דרך נוספת לביטול נעילה.',
    confirmRemove: {
      title: 'להסיר את מפתח הגישה?',
      body: 'MacBook Air · iCloud Keychain כבר לא יבטל את הנעילה של AskCalls.',
      cancel: 'ביטול',
    },
    confirmRevoke: {
      title: 'לבטל את הקישור של askcalls agent on studio-mac?',
      body: 'הסוכן יאבד את המפתחות שלו ויפסיק לסנכרן.',
      cancel: 'ביטול',
    },
    rows: {
      mac: ['MacBook Air · iCloud Keychain', 'נוצר ב-3 באוק׳ 2026 · שימוש אחרון היום ב-macOS'],
      pixel: [
        'Pixel 8 · Google Password Manager',
        'נוצר ב-3 באוק׳ 2026 · שימוש אחרון ב-9 בנוב׳ ב-Android',
      ],
      recovery: ['קוד שחזור', 'נוצר ב-3 באוק׳ 2026 · לא היה בשימוש'],
      passphrase: ['משפט סיסמה', 'לא הוגדר'],
      chrome: ['Chrome ב-MacBook Air', 'קושר ב-3 באוק׳ 2026 · פעיל עכשיו'],
      agent: ['askcalls agent on studio-mac', 'קושר ב-20 באוק׳ 2026 · שימוש אחרון לפני שעתיים'],
    } as Record<'mac' | 'pixel' | 'recovery' | 'passphrase' | 'chrome' | 'agent', [string, string]>,
    rc: {
      list: 'קוד שחזור, 8 קבוצות',
      group: (n: number) => `קבוצה ${n}`,
      copy: 'העתקה',
      download: 'הורדה',
      print: 'הדפסה',
      saved: 'שמרתי את קוד השחזור במקום בטוח',
      copied: 'הועתק. אחרי השמירה כדאי לנקות את הלוח.',
    },
    groups: ['קבוצה 3', 'קבוצה 6'],
    wrong: 'קוד שגוי. כדאי לבדוק כל קבוצה ולנסות שוב.',
    linkCode: ['קוד'],
    fpQuestion: 'האם המכשיר החדש מציג את הקוד הזה?',
    fpHint: 'בטרמינל, askcalls link מדפיס את אותן 6 הספרות.',
    link: {
      scan: 'סריקה במכשיר החדש, או הקלדת הקוד',
      qr: 'קוד QR לקישור מכשיר',
      copy: 'העתקת הקוד',
      connected: 'מכשיר חדש התחבר:',
      expired: 'תוקף הקוד פג. אפשר ליצור קוד חדש.',
      renew: 'יצירת קוד חדש',
    },
    left: 'נותרו 9:12',
    agent: 'askcalls agent, macOS',
    pass: {
      create: 'משפט סיסמה חדש',
      enter: 'משפט סיסמה',
      show: 'הצגת משפט הסיסמה',
      hide: 'הסתרת משפט הסיסמה',
      hint: 'חמש מילים אקראיות או יותר עובדות טוב.',
      weak: 'קל מדי לניחוש',
      ok: 'חזק מספיק',
      wrong: 'משפט סיסמה שגוי. כדאי לנסות שוב.',
    },
    steps: ['ברוכים הבאים', 'מפתח גישה', 'קוד שחזור', 'ניסיון', 'חיבור ל-AI'],
    wizard: ['מסד נתונים', 'אחסון', 'כניסה', 'תמלול ו-AI', 'מצב לא מקוון', 'חשבון מנהל'],
    linkSteps: ['חיבור', 'השוואה', 'סיום'],
    trust: [
      {
        part: 'device',
        title: 'המכשיר שלך',
        holds: [
          'תמלולים, שמע, שמות, הערות',
          'המפתחות שלך, נפתחים במפתח גישה',
          'מילות חיפוש ותוצאות מפוענחות',
        ],
        note: 'רק המכשיר שלך רואה טקסט גלוי',
      },
      {
        part: 'server',
        title: 'שרת AskCalls',
        holds: [
          'טקסט מוצפן ומפתחות עטופים',
          'אסימוני HMAC למילים ולאנשי קשר',
          'וקטורים של טקסט מושחר, יום, טווח משך',
        ],
      },
      {
        part: 'storage',
        title: 'אחסון',
        holds: [
          'Postgres עם pgvector, באיחוד האירופי',
          'הקלטות מוצפנות בדלי S3',
          'או דלי משלך, חתום על ידי המכשיר שלך',
        ],
      },
    ] as TrustDiagramColumn[],
    exceptions: [
      ['managed', 'השמע עובר דרך שרתי AskCalls אל ElevenLabs, בזרימה ובלי שמירה.', 'ElevenLabs'],
      [
        'managed',
        'התמלול של השיחה והשאלה שלך עוברים דרך AskCalls אל Anthropic. AskCalls לא שומרת אותם.',
        'Anthropic',
      ],
      [
        'inbox',
        'העלאות לתיבה גלויות לשרת AskCalls בזמן המעבר. הן מוצפנות למפתח שלך כשהן מגיעות.',
        'Claude',
      ],
    ] as [DataFlowRoute, string, string][],
  },
};

const GROUPS = ['K7QX', 'M2PA', '9TRD', 'WB4N', 'F3LC', 'H8ZE', 'Q6VY', 'JR5U'];

export function TrustGroup() {
  const c = useCopy(copy);
  const k = useCopy(common);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(['9TRD', 'H8Z']);
  const [full, setFull] = useState<string[]>(Array(8).fill(''));
  const [short, setShort] = useState(['', '']);
  const [pass, setPass] = useState('correct horse battery staple river');
  const [weak, setWeak] = useState('dana123');
  const [enter, setEnter] = useState('nope');
  const noop = () => {};
  const steps = (labels: readonly string[]) => labels.map((label) => ({ key: label, label }));
  return (
    <>
      <Specimen
        name="UnlockMethodRow"
        note="passkey · recovery · passphrase · device; This device; last remaining"
        wide
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <SettingsSection
            title={c.passkeys}
            actions={
              <Button variant="outline" size="sm">
                {c.addPasskey}
              </Button>
            }
          >
            <UnlockMethodRow
              kind="passkey"
              label={c.rows.mac[0]}
              detail={c.rows.mac[1]}
              current
              action={{ kind: 'remove', label: c.remove, onAction: noop }}
              confirm={c.confirmRemove}
              labels={{ thisDevice: c.thisDevice }}
            />
            <UnlockMethodRow
              kind="passkey"
              label={c.rows.pixel[0]}
              detail={c.rows.pixel[1]}
              action={{ kind: 'remove', label: c.remove, onAction: noop }}
              lastRemaining={c.lastOne}
              confirm={c.confirmRemove}
              labels={{ thisDevice: c.thisDevice }}
            />
          </SettingsSection>
          <SettingsSection title={c.recoveryTitle}>
            <UnlockMethodRow
              kind="recovery"
              label={c.rows.recovery[0]}
              detail={c.rows.recovery[1]}
              action={{ kind: 'other', label: c.regenerate, onAction: noop }}
              labels={{ thisDevice: c.thisDevice }}
            />
            <UnlockMethodRow
              kind="passphrase"
              label={c.rows.passphrase[0]}
              detail={c.rows.passphrase[1]}
              action={{ kind: 'other', label: c.setPassphrase, onAction: noop }}
              labels={{ thisDevice: c.thisDevice }}
            />
          </SettingsSection>
          <SettingsSection
            title={c.devices}
            actions={
              <Button variant="primary" size="sm">
                {c.linkDevice}
              </Button>
            }
          >
            <UnlockMethodRow
              kind="device"
              deviceKind="laptop"
              label={c.rows.chrome[0]}
              detail={c.rows.chrome[1]}
              current
              labels={{ thisDevice: c.thisDevice }}
            />
            <UnlockMethodRow
              kind="device"
              deviceKind="agent"
              label={c.rows.agent[0]}
              detail={c.rows.agent[1]}
              action={{ kind: 'revoke', label: c.revoke, onAction: noop }}
              confirm={c.confirmRevoke}
              labels={{ thisDevice: c.thisDevice }}
            />
          </SettingsSection>
        </div>
      </Specimen>
      <Specimen name="RecoveryCodeGrid">
        <RecoveryCodeGrid
          groups={GROUPS}
          onCopy={noop}
          onDownload={noop}
          onPrint={noop}
          copiedMessage={c.rc.copied}
          saved={saved}
          onSavedChange={setSaved}
          labels={c.rc}
        />
      </Specimen>
      <Specimen name="CodeGroupInput">
        <State label="confirm two groups, with error">
          <CodeGroupInput
            values={confirm}
            onChange={setConfirm}
            groupLength={4}
            labels={c.groups}
            error={c.wrong}
          />
        </State>
        <State label="full recovery code (paste fills all 8)">
          <CodeGroupInput
            values={full}
            onChange={setFull}
            groupLength={4}
            labels={GROUPS.map((_, i) => c.rc.group(i + 1))}
          />
        </State>
        <State label="short link code, digits">
          <CodeGroupInput
            values={short}
            onChange={setShort}
            groupLength={3}
            labels={[`${c.linkCode[0]} 1`, `${c.linkCode[0]} 2`]}
            numeric
          />
        </State>
      </Specimen>
      <Specimen name="FingerprintCode">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-6 text-center">
          <p className="font-medium">{c.fpQuestion}</p>
          <FingerprintCode digits="482913" />
          <p className="text-muted-foreground text-sm">{c.fpHint}</p>
        </div>
        <State label='size="md"'>
          <FingerprintCode digits="482913" size="md" />
        </State>
      </Specimen>
      <Specimen name="DeviceLinkCode">
        <State label="waiting">
          <DeviceLinkCode
            state="waiting"
            qr={sampleQr()}
            shortCode="KQ7-4MX"
            expiresIn={c.left}
            onCopy={noop}
            onRenew={noop}
            labels={c.link}
          />
        </State>
        <State label="connected">
          <DeviceLinkCode
            state="connected"
            qr={[]}
            shortCode=""
            expiresIn={c.left}
            device={{ label: <strong>{c.agent}</strong>, kind: 'agent' }}
            onCopy={noop}
            onRenew={noop}
            labels={c.link}
          />
        </State>
        <State label="expired">
          <DeviceLinkCode
            state="expired"
            qr={[]}
            shortCode=""
            expiresIn=""
            onCopy={noop}
            onRenew={noop}
            labels={c.link}
          />
        </State>
      </Specimen>
      <Specimen name="PassphraseField">
        <State label="create, strong">
          <PassphraseField
            mode="create"
            label={c.pass.create}
            value={pass}
            onChange={setPass}
            hint={c.pass.hint}
            strength={{ score: 4, label: c.pass.ok }}
            labels={c.pass}
          />
        </State>
        <State label="create, weak">
          <PassphraseField
            mode="create"
            label={c.pass.create}
            value={weak}
            onChange={setWeak}
            strength={{ score: 1, label: c.pass.weak }}
            labels={c.pass}
          />
        </State>
        <State label="enter, wrong">
          <PassphraseField
            mode="enter"
            label={c.pass.enter}
            value={enter}
            onChange={setEnter}
            error={c.pass.wrong}
            labels={c.pass}
          />
        </State>
      </Specimen>
      <Specimen name="Stepper">
        <State label="horizontal (onboarding), step 3">
          <Stepper steps={steps(c.steps)} current={2} />
        </State>
        <State label="horizontal (device linking), step 2">
          <Stepper steps={steps(c.linkSteps)} current={1} />
        </State>
        <State label="vertical (setup wizard), step 1">
          <div className="w-64 rounded-lg bg-sidebar p-4">
            <Stepper orientation="vertical" steps={steps(c.wizard)} current={0} />
          </div>
        </State>
      </Specimen>
      <Specimen name="TrustDiagram" note="full, with the exceptions" wide>
        <TrustDiagram
          columns={c.trust}
          exceptions={c.exceptions.map(([route, text, provider]) => (
            <DataFlowNote
              key={text}
              route={route}
              nodes={{ device: k.device, server: k.server, provider, source: provider }}
            >
              {text}
            </DataFlowNote>
          ))}
        />
      </Specimen>
      <Specimen name="TrustDiagram" note='size="compact" (onboarding)' wide>
        <TrustDiagram size="compact" columns={c.trust} />
      </Specimen>
    </>
  );
}
