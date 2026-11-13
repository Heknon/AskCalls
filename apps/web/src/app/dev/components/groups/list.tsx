'use client';

import { CallDirection } from '@askcalls/ui/components/CallDirection';
import { CallMeta } from '@askcalls/ui/components/CallMeta';
import { CallRow } from '@askcalls/ui/components/CallRow';
import { ContactLabel } from '@askcalls/ui/components/ContactLabel';
import { DecryptingPlaceholder } from '@askcalls/ui/components/DecryptingPlaceholder';
import { HitMark } from '@askcalls/ui/components/HitMark';
import { PhoneNumber } from '@askcalls/ui/components/PhoneNumber';
import { SearchSnippet } from '@askcalls/ui/components/SearchSnippet';
import { StarToggle } from '@askcalls/ui/components/StarToggle';
import { TagChip } from '@askcalls/ui/components/TagChip';
import { formatDuration, formatWhen } from '@askcalls/ui/lib/format';
import { TAG_COLOURS } from '@askcalls/ui/lib/tag-colour';
import { MessageCircle, Star, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { common, rowA11y } from '../copy';
import { sampleCalls } from '../samples';
import { Specimen, State, useCopy, useEnv } from '../shell';

const copy = {
  en: {
    copyNumber: 'Copy number',
    tagNames: ['Gray', 'Blue', 'Violet', 'Rose', 'Amber', 'Green', 'Orange', 'Cyan'],
    remove: (n: string) => `Remove tag ${n}`,
    open: 'Open',
    tags: 'Tags',
    whatsapp: 'Open in WhatsApp',
    delete: 'Delete',
  },
  he: {
    copyNumber: 'העתקת המספר',
    tagNames: ['אפור', 'כחול', 'סגול', 'ורוד', 'ענבר', 'ירוק', 'כתום', 'תכלת'],
    remove: (n: string) => `הסרת התגית ${n}`,
    open: 'פתיחה',
    tags: 'תגיות',
    whatsapp: 'פתיחה בוואטסאפ',
    delete: 'מחיקה',
  },
};

export function ListGroup() {
  const { lang, locale, now } = useEnv();
  const c = useCopy(copy);
  const k = useCopy(common);
  const a11y = useCopy(rowA11y);
  const calls = sampleCalls(lang);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const labels = { ...k, moreActions: k.moreActions };
  const rowProps = (call: (typeof calls)[number], i: number) => ({
    call: { ...call, starred: starred[call.id] ?? call.starred },
    href: '#',
    locale,
    now,
    labels,
    posInSet: i + 1,
    setSize: calls.length,
    onStarredChange: (v: boolean) => setStarred((s) => ({ ...s, [call.id]: v })),
    a11yLabel: a11y(
      call.name ?? call.phone ?? k.hiddenNumber,
      k.direction[call.direction],
      formatWhen(call.startedAt, locale, now),
      formatDuration(call.durationSec, locale, true),
    ),
    actions: [
      { key: 'open', label: c.open, onSelect: () => {} },
      { key: 'star', label: k.star, icon: <Star aria-hidden />, onSelect: () => {} },
      { key: 'tags', label: c.tags, icon: <Tags aria-hidden />, onSelect: () => {} },
      { key: 'wa', label: c.whatsapp, icon: <MessageCircle aria-hidden />, onSelect: () => {} },
      {
        key: 'del',
        label: c.delete,
        icon: <Trash2 aria-hidden />,
        destructive: true,
        separated: true,
        onSelect: () => {},
      },
    ],
  });
  const first = calls[0]!;
  return (
    <>
      <Specimen
        name="CallRow"
        note='context="list" · selected · starred · number only · hidden number'
        wide
      >
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-card p-0">
          {calls.map((call, i) => (
            <CallRow key={call.id} {...rowProps(call, i)} selected={i === 0} />
          ))}
        </ul>
      </Specimen>
      <Specimen name="CallRow" note='context="search" (snippet) · locked rows (decrypting)' wide>
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-card p-0">
          {calls.slice(0, 3).map((call, i) => (
            <CallRow key={call.id} {...rowProps(call, i)} context="search" />
          ))}
          <CallRow
            call="locked"
            href="#"
            locale={locale}
            labels={{ ...labels, decrypting: k.decrypting }}
          />
          <CallRow call="locked" href="#" locale={locale} labels={labels} />
        </ul>
      </Specimen>
      <Specimen name="CallRow" note='density="compact" (contact detail)'>
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-card p-0">
          {calls.slice(0, 2).map((call, i) => (
            <CallRow key={call.id} {...rowProps(call, i)} density="compact" actions={undefined} />
          ))}
          <CallRow call="locked" density="compact" href="#" locale={locale} labels={labels} />
        </ul>
      </Specimen>
      <Specimen name="ContactLabel">
        <State label="name + number">
          <ContactLabel name="דנה לוי" phone="+972525550134" />
        </State>
        <State label="name only · English name">
          <ContactLabel name="Maya Cohen" phone="+972505550112" show="name" />
        </State>
        <State label="number only">
          <ContactLabel phone="+97235550199" show="auto" />
        </State>
        <State label="hidden number">
          <ContactLabel hidden hiddenLabel={k.hiddenNumber} />
        </State>
        <State label="header context">
          <ContactLabel context="header" name="דנה לוי" phone="+972525550134" />
        </State>
        <State label="locked">
          <ContactLabel locked />
        </State>
      </Specimen>
      <Specimen name="PhoneNumber">
        <State label="international">
          <PhoneNumber e164="+972525550134" />
        </State>
        <State label="national">
          <PhoneNumber e164="+972525550134" format="national" />
        </State>
        <State label="landline · copyable">
          <PhoneNumber e164="+97235550199" copyLabel={c.copyNumber} />
        </State>
      </Specimen>
      <Specimen name="CallDirection">
        <div className="flex flex-wrap gap-5">
          {(['incoming', 'outgoing', 'unknown'] as const).map((d) => (
            <CallDirection key={d} direction={d} label={k.direction[d]} withLabel />
          ))}
          {(['incoming', 'outgoing'] as const).map((d) => (
            <CallDirection key={`${d}-icon`} direction={d} label={k.direction[d]} />
          ))}
        </div>
      </Specimen>
      <Specimen name="CallMeta">
        <State label="inline: today, yesterday, this year, older">
          <div className="flex flex-col gap-1">
            {calls
              .slice(0, 2)
              .concat(calls.slice(3))
              .map((call) => (
                <CallMeta
                  key={call.id}
                  startedAt={call.startedAt}
                  durationSec={call.durationSec}
                  locale={locale}
                  now={now}
                />
              ))}
          </div>
        </State>
        <State label="stacked">
          <CallMeta
            startedAt={first.startedAt}
            durationSec={first.durationSec}
            locale={locale}
            now={now}
            layout="stacked"
          />
        </State>
        <State label="header">
          <CallMeta
            startedAt={first.startedAt}
            durationSec={first.durationSec}
            locale={locale}
            context="header"
          />
        </State>
        <State label="locked">
          <CallMeta startedAt={first.startedAt} durationSec={0} locale={locale} locked />
        </State>
      </Specimen>
      <Specimen name="StarToggle">
        <div className="flex items-center gap-4">
          <StarToggle starred={false} onStarredChange={() => {}} labels={k} />
          <StarToggle starred onStarredChange={() => {}} labels={k} />
          <StarToggle starred size="header" onStarredChange={() => {}} labels={k} />
        </div>
      </Specimen>
      <Specimen name="TagChip">
        <State label="manual, in all eight colours">
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLOURS.map((col, i) => (
              <TagChip key={col} name={c.tagNames[i] ?? col} colour={col} />
            ))}
          </div>
        </State>
        <State label='source="rule" (tooltip) · source="intent" · removable · picker option'>
          <div className="flex flex-wrap gap-1.5">
            {first.tags.map(({ id, ...t }) => (
              <TagChip key={id} {...t} />
            ))}
            <TagChip name="VIP" colour="violet" onRemove={() => {}} removeLabel={c.remove('VIP')} />
            <TagChip name="Follow-up" colour="amber" selected />
          </div>
        </State>
      </Specimen>
      <Specimen name="SearchSnippet">
        <State label="Hebrew snippet, two lines, hits marked">
          <SearchSnippet text={first.snippet!.text} hits={first.snippet!.hits} />
        </State>
        <State label="English snippet in either UI">
          <SearchSnippet text={calls[1]!.snippet!.text} hits={['price', 'quote']} />
        </State>
      </Specimen>
      <Specimen name="HitMark">
        <p className="text-md">
          OK. And does that <HitMark>price</HitMark> include installation? · מה ה
          <HitMark>מחיר</HitMark>?
        </p>
      </Specimen>
      <Specimen name="DecryptingPlaceholder">
        <State label='shape="line" (announced once)'>
          <DecryptingPlaceholder width={0.5} label={k.decrypting} />
        </State>
        <State label='shape="paragraph"'>
          <DecryptingPlaceholder shape="paragraph" />
        </State>
        <State label='shape="row"'>
          <div className="rounded-lg border border-border bg-card">
            <DecryptingPlaceholder shape="row" />
          </div>
        </State>
      </Specimen>
    </>
  );
}
