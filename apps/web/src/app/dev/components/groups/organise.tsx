'use client';

import { ContactRow } from '@askcalls/ui/components/ContactRow';
import { IntentEditor } from '@askcalls/ui/components/IntentEditor';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { RuleAction } from '@askcalls/ui/components/RuleAction';
import { RuleBuilder } from '@askcalls/ui/components/RuleBuilder';
import { RuleCondition } from '@askcalls/ui/components/RuleCondition';
import { RuleListItem } from '@askcalls/ui/components/RuleListItem';
import { SaveStatus } from '@askcalls/ui/components/SaveStatus';
import { SynonymRow } from '@askcalls/ui/components/SynonymRow';
import { TagChip } from '@askcalls/ui/components/TagChip';
import { TagManagerRow } from '@askcalls/ui/components/TagManagerRow';
import { TermInput } from '@askcalls/ui/components/TermInput';
import type { TagColour } from '@askcalls/ui/lib/tag-colour';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Input } from '@askcalls/ui/primitives/input';
import { Filter } from 'lucide-react';
import { useState } from 'react';
import { common } from '../copy';
import { Specimen, useCopy } from '../shell';

const copy = {
  en: {
    tags: [
      ['Hot lead', 'rose', '23 calls'],
      ['Quote sent', 'blue', '41 calls'],
      ['Follow-up', 'amber', '9 calls'],
    ] as [string, TagColour, string][],
    tagLabels: {
      colour: 'Colour',
      colourNames: {
        gray: 'Gray',
        blue: 'Blue',
        violet: 'Violet',
        rose: 'Rose',
        amber: 'Amber',
        green: 'Green',
        orange: 'Orange',
        cyan: 'Cyan',
      },
      rename: 'Rename',
      save: 'Save',
      delete: 'Delete',
      deleteTitle: 'Delete this tag?',
      deleteBody: 'It comes off every call that has it. The calls stay.',
      cancel: 'Cancel',
    },
    intent: {
      name: 'Purchase interest',
      examples: 'I want to order a kitchen\nHow much would it cost to\nאני רוצה להזמין מטבח',
      labels: {
        name: 'Intent name',
        builtIn: 'Built-in',
        examples: 'Example sentences',
        examplesHint: 'One per line. Calls that say something close get this intent.',
        threshold: 'How close',
        looser: 'More calls',
        stricter: 'Fewer, closer calls',
      },
    },
    custom: 'Warranty claim',
    customExamples: 'The hinge broke after a month\nהדלת של הארון לא נסגרת',
    rule: {
      name: 'Hot leads',
      labels: {
        name: 'Rule name',
        on: 'On',
        when: 'When',
        ofThese: 'of these match',
        actions: 'Then',
        addCondition: 'Add condition',
        addAction: 'Add action',
        save: 'Save rule',
        apply: 'Apply to existing calls',
        delete: 'Delete rule',
      },
      match: [
        ['all', 'all'],
        ['any', 'any'],
      ],
      fields: [
        ['keyword', 'Keyword'],
        ['intent', 'Intent'],
        ['duration', 'Duration'],
        ['contact', 'Contact'],
      ],
      ops: {
        keyword: [
          ['any', 'contains any of'],
          ['all', 'contains all of'],
        ],
        intent: [['is', 'is']],
        duration: [
          ['gt', 'is longer than'],
          ['lt', 'is shorter than'],
        ],
      } as Record<string, [string, string][]>,
      actions: [
        ['tag', 'Add tag'],
        ['star', 'Star the call'],
      ],
      removeCondition: 'Remove condition',
      removeAction: 'Remove action',
      keywords: 'Keywords',
      fuzzy: 'Fuzzy',
      minutes: 'minutes',
      preview: 'Matches 23 calls.',
      show: 'Show them',
      condition: 'Condition',
      comparison: 'Comparison',
      action: 'Action',
      match_: 'Match',
      job: { pause: 'Pause', resume: 'Resume', stop: 'Stop', progress: 'Applying the rule' },
      applying: 'Applying to existing calls: 136 of 212',
      off: 'Off',
      list: [
        ['Hot leads', 'Price words + Purchase interest → tag Hot lead, star', true],
        ['Service calls', 'Service request → tag Service', true],
        ['Lawyer', 'Contact is Avi Ben David → tag Legal', false],
      ] as [string, string, boolean][],
    },
    synonym: { canonical: 'Canonical term', remove: 'Remove synonym group', forms: 'Other forms' },
    contacts: [
      ['דנה לוי', ['+972525550134'], '12 calls · last today'],
      ['Yossi Mizrahi', ['+972545550178', '+97235550177'], '4 calls · last yesterday'],
    ] as [string, string[], string][],
    edit: 'Edit',
    hot: 'Hot lead',
    purchase: 'Purchase interest',
  },
  he: {
    tags: [
      ['ליד חם', 'rose', '23 שיחות'],
      ['נשלחה הצעה', 'blue', '41 שיחות'],
      ['מעקב', 'amber', '9 שיחות'],
    ] as [string, TagColour, string][],
    tagLabels: {
      colour: 'צבע',
      colourNames: {
        gray: 'אפור',
        blue: 'כחול',
        violet: 'סגול',
        rose: 'ורוד',
        amber: 'ענבר',
        green: 'ירוק',
        orange: 'כתום',
        cyan: 'תכלת',
      },
      rename: 'שינוי שם',
      save: 'שמירה',
      delete: 'מחיקה',
      deleteTitle: 'למחוק את התגית?',
      deleteBody: 'היא תוסר מכל השיחות שמסומנות בה. השיחות נשארות.',
      cancel: 'ביטול',
    },
    intent: {
      name: 'עניין ברכישה',
      examples: 'אני רוצה להזמין מטבח\nכמה יעלה לעשות\nI want to order a kitchen',
      labels: {
        name: 'שם הכוונה',
        builtIn: 'מובנית',
        examples: 'משפטים לדוגמה',
        examplesHint: 'משפט אחד בכל שורה. שיחות שאומרות משהו קרוב יקבלו את הכוונה.',
        threshold: 'מידת הקרבה',
        looser: 'יותר שיחות',
        stricter: 'פחות שיחות, קרובות יותר',
      },
    },
    custom: 'תביעת אחריות',
    customExamples: "הציר נשבר אחרי חודש\nThe cabinet door won't close",
    rule: {
      name: 'לידים חמים',
      labels: {
        name: 'שם הכלל',
        on: 'פעיל',
        when: 'כאשר',
        ofThese: 'התנאים האלה מתקיימים',
        actions: 'אז',
        addCondition: 'הוספת תנאי',
        addAction: 'הוספת פעולה',
        save: 'שמירת הכלל',
        apply: 'החלה על שיחות קיימות',
        delete: 'מחיקת הכלל',
      },
      match: [
        ['all', 'כל'],
        ['any', 'אחד מ'],
      ],
      fields: [
        ['keyword', 'מילת מפתח'],
        ['intent', 'כוונה'],
        ['duration', 'משך'],
        ['contact', 'איש קשר'],
      ],
      ops: {
        keyword: [
          ['any', 'מכילה אחת מ'],
          ['all', 'מכילה את כל'],
        ],
        intent: [['is', 'היא']],
        duration: [
          ['gt', 'ארוך מ'],
          ['lt', 'קצר מ'],
        ],
      } as Record<string, [string, string][]>,
      actions: [
        ['tag', 'הוספת תגית'],
        ['star', 'סימון בכוכב'],
      ],
      removeCondition: 'הסרת תנאי',
      removeAction: 'הסרת פעולה',
      keywords: 'מילות מפתח',
      fuzzy: 'גמיש',
      minutes: 'דקות',
      preview: 'מתאים ל-23 שיחות.',
      show: 'הצגה',
      condition: 'תנאי',
      comparison: 'השוואה',
      action: 'פעולה',
      match_: 'התאמה',
      job: { pause: 'השהיה', resume: 'המשך', stop: 'עצירה', progress: 'החלת הכלל' },
      applying: 'מחיל על שיחות קיימות: 136 מתוך 212',
      off: 'כבוי',
      list: [
        ['לידים חמים', 'מילות מחיר + עניין ברכישה → תגית ליד חם, כוכב', true],
        ['שיחות שירות', 'בקשת שירות → תגית שירות', true],
        ['עורך דין', 'איש הקשר הוא אבי בן דוד → תגית משפטי', false],
      ] as [string, string, boolean][],
    },
    synonym: { canonical: 'מונח עיקרי', remove: 'הסרת קבוצת מילים נרדפות', forms: 'צורות נוספות' },
    contacts: [
      ['דנה לוי', ['+972525550134'], '12 שיחות · אחרונה היום'],
      ['יוסי מזרחי', ['+972545550178', '+97235550177'], '4 שיחות · אחרונה אתמול'],
    ] as [string, string[], string][],
    edit: 'עריכה',
    hot: 'ליד חם',
    purchase: 'עניין ברכישה',
  },
};

const opts = (pairs: [string, string][] | string[][]) =>
  pairs.map(([value, label]) => ({ value: value!, label: label! }));

export function OrganiseGroup() {
  const c = useCopy(copy);
  const k = useCopy(common);
  const r = c.rule;
  const [terms, setTerms] = useState(['מחיר', 'הצעת מחיר', 'price', 'quote']);
  const [fuzzy, setFuzzy] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [syn, setSyn] = useState(['price', 'עלות', 'cost']);
  const [threshold, setThreshold] = useState(0.72);
  const [selectedRule, setSelectedRule] = useState(0);
  const sel = (value: string, options: [string, string][] | string[][], label: string) => ({
    value,
    options: opts(options),
    onChange: () => {},
    label,
  });
  return (
    <>
      <Specimen
        name="RuleBuilder"
        note="with RuleCondition, RuleAction, TermInput, JobProgress, SaveStatus"
        wide
      >
        <RuleBuilder
          name={r.name}
          onNameChange={() => {}}
          enabled={enabled}
          onEnabledChange={setEnabled}
          match={sel('all', r.match, r.match_)}
          conditions={
            <>
              <RuleCondition
                field={sel('keyword', r.fields, r.condition)}
                operator={sel('any', r.ops.keyword!, r.comparison)}
                onRemove={() => {}}
                removeLabel={r.removeCondition}
              >
                <TermInput
                  terms={terms}
                  onChange={setTerms}
                  label={r.keywords}
                  removeLabel={k.remove}
                  fuzzy={{ checked: fuzzy, onChange: setFuzzy, label: r.fuzzy }}
                />
              </RuleCondition>
              <RuleCondition
                field={sel('intent', r.fields, r.condition)}
                operator={sel('is', r.ops.intent!, r.comparison)}
                onRemove={() => {}}
                removeLabel={r.removeCondition}
              >
                <TagChip name={c.purchase} colour="gray" source="intent" />
              </RuleCondition>
              <RuleCondition
                field={sel('duration', r.fields, r.condition)}
                operator={sel('gt', r.ops.duration!, r.comparison)}
                onRemove={() => {}}
                removeLabel={r.removeCondition}
              >
                <span className="flex items-center gap-2">
                  <Input
                    defaultValue="2"
                    inputMode="numeric"
                    aria-label={r.minutes}
                    className="w-20"
                  />
                  <span className="text-muted-foreground text-sm">{r.minutes}</span>
                </span>
              </RuleCondition>
            </>
          }
          onAddCondition={() => {}}
          actions={
            <>
              <RuleAction
                action={sel('tag', r.actions, r.action)}
                onRemove={() => {}}
                removeLabel={r.removeAction}
              >
                <TagChip name={c.hot} colour="rose" source="rule" />
              </RuleAction>
              <RuleAction
                action={sel('star', r.actions, r.action)}
                onRemove={() => {}}
                removeLabel={r.removeAction}
              />
            </>
          }
          onAddAction={() => {}}
          preview={
            <>
              <Filter className="size-4" aria-hidden />
              {r.preview}{' '}
              <Button variant="link" className="text-sm">
                {r.show}
              </Button>
            </>
          }
          job={
            <JobProgress
              done={136}
              total={212}
              label={r.applying}
              onStop={() => {}}
              labels={r.job}
            />
          }
          saveStatus={<SaveStatus state="saved" labels={k.save} />}
          onSave={() => {}}
          onApply={() => {}}
          onDelete={() => {}}
          labels={r.labels}
        />
      </Specimen>
      <Specimen name="RuleListItem" note="selected · default · off">
        <Card className="max-w-72 p-2">
          <ul className="m-0 flex flex-col gap-0.5 p-0">
            {r.list.map(([name, summary, enabled], i) => (
              <RuleListItem
                key={name}
                name={name}
                summary={summary}
                enabled={enabled}
                offLabel={r.off}
                selected={i === selectedRule}
                onSelect={() => setSelectedRule(i)}
              />
            ))}
          </ul>
        </Card>
      </Specimen>
      <Specimen name="TagManagerRow">
        <Card>
          {c.tags.map(([name, colour, usage]) => (
            <TagManagerRow
              key={name}
              name={name}
              colour={colour}
              usage={usage}
              onRename={() => {}}
              onColourChange={() => {}}
              onDelete={() => {}}
              labels={c.tagLabels}
            />
          ))}
        </Card>
      </Specimen>
      <Specimen name="SynonymRow">
        <Card>
          <SynonymRow
            canonical="מחיר"
            onCanonicalChange={() => {}}
            forms={{ terms: syn, onChange: setSyn, label: c.synonym.forms, removeLabel: k.remove }}
            onRemove={() => {}}
            labels={c.synonym}
          />
        </Card>
      </Specimen>
      <Specimen name="IntentEditor">
        <IntentEditor
          builtIn
          name={c.intent.name}
          onNameChange={() => {}}
          examples={c.intent.examples}
          onExamplesChange={() => {}}
          threshold={threshold}
          onThresholdChange={setThreshold}
          saveStatus={<SaveStatus state="saving" labels={k.save} />}
          labels={c.intent.labels}
        />
        <IntentEditor
          name={c.custom}
          onNameChange={() => {}}
          examples={c.customExamples}
          onExamplesChange={() => {}}
          threshold={0.6}
          onThresholdChange={() => {}}
          saveStatus={<SaveStatus state="error" labels={k.save} onRetry={() => {}} />}
          labels={c.intent.labels}
        />
      </Specimen>
      <Specimen name="ContactRow" note="loaded · locked">
        <ul className="m-0 list-none overflow-hidden rounded-lg border border-border bg-card p-0">
          {c.contacts.map(([name, phones, detail]) => (
            <ContactRow
              key={name}
              name={name}
              phones={phones}
              detail={detail}
              href="#"
              onEdit={() => {}}
              labels={{ edit: c.edit }}
            />
          ))}
          <ContactRow
            name=""
            phones={[]}
            href="#"
            onEdit={() => {}}
            labels={{ edit: c.edit }}
            locked
          />
        </ul>
      </Specimen>
      <Specimen name="TermInput">
        <TermInput terms={syn} onChange={setSyn} label={c.synonym.forms} removeLabel={k.remove} />
      </Specimen>
    </>
  );
}
