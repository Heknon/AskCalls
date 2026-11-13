'use client';

import { AuditEventRow } from '@askcalls/ui/components/AuditEventRow';
import { ChoiceCard } from '@askcalls/ui/components/ChoiceCard';
import { CopyableCode } from '@askcalls/ui/components/CopyableCode';
import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { EnvLockedField } from '@askcalls/ui/components/EnvLockedField';
import { HealthBadge } from '@askcalls/ui/components/HealthBadge';
import { MaskedSecret } from '@askcalls/ui/components/MaskedSecret';
import { OfflineBlockerList } from '@askcalls/ui/components/OfflineBlockerList';
import { ProviderCard, type ProviderChoice } from '@askcalls/ui/components/ProviderCard';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { TestConnectionResult } from '@askcalls/ui/components/TestConnectionResult';
import { TokenRow } from '@askcalls/ui/components/TokenRow';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import { Card } from '@askcalls/ui/primitives/card';
import { Label } from '@askcalls/ui/primitives/label';
import { RadioGroup } from '@askcalls/ui/primitives/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { Table, TableHead } from '@askcalls/ui/primitives/table';
import { useState } from 'react';
import { common } from '../copy';
import { Specimen, State, useCopy, useEnv } from '../shell';

const copy = {
  en: {
    transcription: 'Transcription',
    ask: 'Ask',
    database: 'Database',
    storage: 'Storage',
    choices: [
      ['managed', 'AskCalls managed'],
      ['own', 'Your own key'],
      ['off', 'Off'],
      ['local', 'Local (planned)'],
    ],
    choiceLabel: 'Who transcribes',
    working: 'Working',
    healthy: 'Healthy',
    degraded: 'Slow',
    down: 'Down',
    unknown: 'Not checked',
    flowManaged:
      'Audio passes through AskCalls to ElevenLabs, streamed and not stored. ElevenLabs may keep request logs under its standard policy.',
    flowDirect:
      "This call's transcript and your question go from your device straight to Anthropic under your account. AskCalls doesn't see them.",
    model: 'Model',
    language: 'Default language',
    detect: 'Detect automatically',
    usage: 'Managed transcription this month',
    min: 'min',
    test: { test: 'Test connection', testing: 'Testing…' },
    ok: 'Connected. A 3-second sample transcribed in 1.2 s.',
    failed: 'Upload blocked by CORS (403).',
    masked: { masked: 'Saved key, masked', replace: 'Replace', remove: 'Remove' },
    driver: 'Driver',
    connection: 'Connection',
    envCaption: 'Set by the server environment',
    dbNote: "Can't be changed while it holds data. Use askcalls backup and restore.",
    offline: 'Offline mode',
    offlineSummary: '3 settings reach the internet. Fix them to turn offline mode on.',
    offlineClean: 'Nothing reaches the internet.',
    blockers: [
      ['Transcription: ElevenLabs', 'api.elevenlabs.io', ['Use local Whisper server', 'Turn off']],
      ['Ask: Anthropic', 'api.anthropic.com', ['Use local Ollama', 'Turn off']],
      ['Sign-in: Google', 'accounts.google.com', ['Turn off Google sign-in']],
    ] as [string, string, string[]][],
    db: [
      [
        'builtin',
        'Built-in',
        'PGlite, stored in /data on this machine. For one person or a small team.',
      ],
      ['postgres', 'Postgres', 'Your own Postgres 15+ with pgvector.'],
      ['sqlite', 'SQLite', 'Not available in this version.'],
    ],
    planned: 'Planned',
    tokens: 'Personal access tokens',
    tokenLabels: {
      revoke: 'Revoke',
      revokeTitle: 'Revoke this token?',
      revokeBody: 'Anything using it stops working right away.',
      cancel: 'Cancel',
    },
    tokenRows: [
      ['claude-desktop', ['calls:read', 'ask'], 'Expires 12 Feb 2027 · Last used yesterday'],
      ['inbox-upload', ['inbox:write'], 'Expired 1 Nov 2026 · Last used 30 Oct'],
    ] as [string, string[], string][],
    expired: 'Expired',
    audit: 'Audit log',
    auditHead: ['When', 'Who', 'What', 'Call'],
    auditRows: [
      ['Today, 14:40', 'Chrome on MacBook Air', 'Read call', '0193f2c4'],
      ['Today, 09:02', 'token claude-desktop', 'Searched calls', ''],
      ['Yesterday, 18:12', 'askcalls agent on studio-mac', 'Uploaded call', '0193e7aa'],
    ],
    code: { copy: 'Copy', copied: 'Copied' },
    mcp: '{\n  "mcpServers": {\n    "askcalls": { "command": "askcalls", "args": ["mcp"] }\n  }\n}',
  },
  he: {
    transcription: 'תמלול',
    ask: 'שאלות',
    database: 'מסד נתונים',
    storage: 'אחסון',
    choices: [
      ['managed', 'מנוהל ב-AskCalls'],
      ['own', 'מפתח משלך'],
      ['off', 'כבוי'],
      ['local', 'מקומי (מתוכנן)'],
    ],
    choiceLabel: 'מי מתמלל',
    working: 'עובד',
    healthy: 'תקין',
    degraded: 'איטי',
    down: 'לא זמין',
    unknown: 'לא נבדק',
    flowManaged:
      'השמע עובר דרך AskCalls אל ElevenLabs, בזרימה ובלי שמירה. ElevenLabs עשויה לשמור יומני בקשות לפי המדיניות הרגילה שלה.',
    flowDirect:
      'התמלול של השיחה והשאלה שלך יוצאים מהמכשיר שלך ישירות ל-Anthropic, תחת החשבון שלך. AskCalls לא רואה אותם.',
    model: 'מודל',
    language: 'שפת ברירת מחדל',
    detect: 'זיהוי אוטומטי',
    usage: 'תמלול מנוהל החודש',
    min: 'דק׳',
    test: { test: 'בדיקת חיבור', testing: 'בודק…' },
    ok: 'מחובר. דגימה של 3 שניות תומללה ב-1.2 שניות.',
    failed: 'ההעלאה נחסמה על ידי CORS ‏(403).',
    masked: { masked: 'מפתח שמור, מוסתר', replace: 'החלפה', remove: 'הסרה' },
    driver: 'מנהל התקן',
    connection: 'חיבור',
    envCaption: 'נקבע בסביבת השרת',
    dbNote: 'אי אפשר לשנות כשיש בו נתונים. יש להשתמש ב-askcalls backup ו-restore.',
    offline: 'מצב לא מקוון',
    offlineSummary: '3 הגדרות פונות לאינטרנט. יש לתקן אותן כדי להפעיל מצב לא מקוון.',
    offlineClean: 'שום דבר לא פונה לאינטרנט.',
    blockers: [
      ['תמלול: ElevenLabs', 'api.elevenlabs.io', ['שימוש בשרת Whisper מקומי', 'כיבוי']],
      ['שאלות: Anthropic', 'api.anthropic.com', ['שימוש ב-Ollama מקומי', 'כיבוי']],
      ['כניסה: Google', 'accounts.google.com', ['כיבוי הכניסה עם Google']],
    ] as [string, string, string[]][],
    db: [
      ['builtin', 'מובנה', 'PGlite, נשמר ב-/data במכונה הזאת. לאדם אחד או לצוות קטן.'],
      ['postgres', 'Postgres', 'Postgres 15 ומעלה משלך, עם pgvector.'],
      ['sqlite', 'SQLite', 'לא זמין בגרסה הזאת.'],
    ],
    planned: 'מתוכנן',
    tokens: 'אסימוני גישה אישיים',
    tokenLabels: {
      revoke: 'ביטול',
      revokeTitle: 'לבטל את האסימון?',
      revokeBody: 'כל מה שמשתמש בו יפסיק לעבוד מיד.',
      cancel: 'ביטול',
    },
    tokenRows: [
      ['claude-desktop', ['calls:read', 'ask'], 'פג ב-12 בפבר׳ 2027 · שימוש אחרון אתמול'],
      ['inbox-upload', ['inbox:write'], 'פג ב-1 בנוב׳ 2026 · שימוש אחרון ב-30 באוק׳'],
    ] as [string, string[], string][],
    expired: 'פג תוקף',
    audit: 'יומן פעילות',
    auditHead: ['מתי', 'מי', 'מה', 'שיחה'],
    auditRows: [
      ['היום, 14:40', 'Chrome ב-MacBook Air', 'קריאת שיחה', '0193f2c4'],
      ['היום, 09:02', 'אסימון claude-desktop', 'חיפוש שיחות', ''],
      ['אתמול, 18:12', 'askcalls agent on studio-mac', 'העלאת שיחה', '0193e7aa'],
    ],
    code: { copy: 'העתקה', copied: 'הועתק' },
    mcp: '{\n  "mcpServers": {\n    "askcalls": { "command": "askcalls", "args": ["mcp"] }\n  }\n}',
  },
};

export function SettingsGroup() {
  const c = useCopy(copy);
  const k = useCopy(common);
  const { locale } = useEnv();
  const [choice, setChoice] = useState<ProviderChoice>('managed');
  const [db, setDb] = useState('builtin');
  const options = c.choices.map(([value, label]) => ({
    value: value as ProviderChoice,
    label: label!,
    disabled: value === 'local',
  }));
  return (
    <>
      <Specimen name="ProviderCard" note="settings: managed with usage and a passing test">
        <ProviderCard
          capability="transcription"
          title={c.transcription}
          health={<HealthBadge status="healthy" label={c.working} />}
          choice={{ value: choice, options, onChange: setChoice, label: c.choiceLabel }}
        >
          <DataFlowNote
            route="managed"
            nodes={{ device: k.device, server: k.server, provider: 'ElevenLabs' }}
          >
            {c.flowManaged}
          </DataFlowNote>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{c.model}</Label>
              <Select defaultValue="scribe">
                <SelectTrigger aria-label={c.model}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scribe">ElevenLabs Scribe v2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{c.language}</Label>
              <Select defaultValue="auto">
                <SelectTrigger aria-label={c.language}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{c.detect}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <UsageMeter label={c.usage} used={41} limit={300} unit={c.min} locale={locale} />
          <TestConnectionResult state="ok" detail={c.ok} onTest={() => {}} labels={c.test} />
        </ProviderCard>
      </Specimen>
      <Specimen name="ProviderCard" note="own key: masked secret, direct route, failed test">
        <ProviderCard
          capability="ask"
          title={c.ask}
          health={<HealthBadge status="down" label={c.down} />}
          choice={{ value: 'own', options, onChange: () => {}, label: c.choiceLabel }}
        >
          <DataFlowNote
            route="direct"
            nodes={{ device: k.device, server: k.server, provider: 'Anthropic' }}
          >
            {c.flowDirect}
          </DataFlowNote>
          <MaskedSecret
            prefix="sk-ant-"
            last4="4f2Q"
            onReplace={() => {}}
            onRemove={() => {}}
            labels={c.masked}
          />
          <TestConnectionResult
            state="failed"
            detail={c.failed}
            onTest={() => {}}
            labels={c.test}
          />
        </ProviderCard>
      </Specimen>
      <Specimen name="ProviderCard" note='context="instance", locked by the server environment'>
        <ProviderCard
          capability="database"
          title={c.database}
          context="instance"
          locked
          health={<HealthBadge status="healthy" label={c.healthy} latencyMs={12} />}
        >
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{c.driver}</span>
            <span>Postgres 16.4 + pgvector 0.8</span>
          </div>
          <EnvLockedField
            label={c.connection}
            value="postgres://askcalls@db:5432/askcalls"
            caption={c.envCaption}
          />
          <p className="text-muted-foreground text-sm">{c.dbNote}</p>
        </ProviderCard>
      </Specimen>
      <div className="flex flex-col gap-12">
        <Specimen name="HealthBadge">
          <div className="flex flex-wrap gap-2">
            <HealthBadge status="healthy" label={c.healthy} latencyMs={31} />
            <HealthBadge status="degraded" label={c.degraded} latencyMs={940} />
            <HealthBadge status="down" label={c.down} />
            <HealthBadge status="unknown" label={c.unknown} />
          </div>
        </Specimen>
        <Specimen name="TestConnectionResult">
          <TestConnectionResult state="idle" onTest={() => {}} labels={c.test} />
          <TestConnectionResult state="testing" onTest={() => {}} labels={c.test} />
        </Specimen>
        <Specimen name="MaskedSecret">
          <MaskedSecret prefix="sk_" last4="9a1c" onReplace={() => {}} labels={c.masked} />
        </Specimen>
        <Specimen name="EnvLockedField">
          <EnvLockedField label="S3_BUCKET" value="askcalls-prod-eu" caption={c.envCaption} />
        </Specimen>
      </div>
      <Specimen name="OfflineBlockerList" wide>
        <State label="blocked">
          <OfflineBlockerList
            title={c.offline}
            summary={c.offlineSummary}
            enabled={false}
            onEnabledChange={() => {}}
            blockers={c.blockers.map(([what, host, fixes]) => ({
              key: host,
              what,
              host,
              fixes: fixes.map((label) => ({ label, onFix: () => {} })),
            }))}
          />
        </State>
        <State label="clean">
          <OfflineBlockerList
            title={c.offline}
            summary={c.offlineClean}
            enabled
            onEnabledChange={() => {}}
            blockers={[]}
          />
        </State>
      </Specimen>
      <Specimen name="ChoiceCard" note="selected · default · planned (disabled)">
        <RadioGroup value={db} onValueChange={setDb} aria-label={c.database}>
          {c.db.map(([value, title, description]) => (
            <ChoiceCard
              key={value}
              value={value!}
              title={title!}
              description={description!}
              disabled={value === 'sqlite'}
              badge={value === 'sqlite' ? c.planned : undefined}
            />
          ))}
        </RadioGroup>
      </Specimen>
      <Specimen name="SettingsSection" note="with TokenRow">
        <SettingsSection title={c.tokens}>
          {c.tokenRows.map(([name, scopes, detail], i) => (
            <TokenRow
              key={name}
              name={name}
              scopes={scopes}
              detail={detail}
              expired={i === 1 ? c.expired : undefined}
              onRevoke={() => {}}
              labels={c.tokenLabels}
            />
          ))}
        </SettingsSection>
      </Specimen>
      <Specimen name="AuditEventRow" wide>
        <Card className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                {c.auditHead.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.auditRows.map(([label, actor, action, ref]) => (
                <AuditEventRow
                  key={`${label}${actor}`}
                  at={{ label: label!, iso: '2026-11-13T14:40:00Z' }}
                  actor={actor!}
                  action={action!}
                  callRef={ref || undefined}
                />
              ))}
            </tbody>
          </Table>
        </Card>
      </Specimen>
      <Specimen name="CopyableCode">
        <CopyableCode language="shell" code="npx askcalls link" labels={c.code} />
        <CopyableCode language="json" code={c.mcp} labels={c.code} />
      </Specimen>
      <Specimen name="TokenRow" note="see SettingsSection above">
        <TokenRow
          name="ci-export"
          scopes={['calls:read']}
          detail="Expires 1 Jan 2027 · Never used"
          onRevoke={() => {}}
          labels={c.tokenLabels}
        />
      </Specimen>
    </>
  );
}
