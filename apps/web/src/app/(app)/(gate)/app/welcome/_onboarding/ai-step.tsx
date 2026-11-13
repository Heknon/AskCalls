'use client';

import { CopyableCode } from '@askcalls/ui/components/CopyableCode';
import { GateHeading, GateNote } from '@askcalls/ui/components/Gate';
import { Button } from '@askcalls/ui/primitives/button';
import { Label } from '@askcalls/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import {
  AGENT_CLIENTS,
  type AgentClient,
  CLIENT_NAMES,
  CLIENT_SNIPPETS,
  loginCommands,
} from './agent-snippets';

/** O6: install and sign in the agent, link it, add it to an MCP client. */
export function AiStep({ onDone }: { onDone: () => void }) {
  const t = useTranslations('onboarding.ai');
  const tc = useTranslations('common');
  const [client, setClient] = useState<AgentClient>('claudeCode');
  const pickerId = useId();
  const [login, link] = loginCommands(location.origin);
  const copy = { copy: tc('copy'), copied: tc('copied') };
  const snippet = CLIENT_SNIPPETS[client];
  const path = (c: ReactNode) => <code dir="ltr">{c}</code>;
  return (
    <>
      <GateHeading title={t('title')} description={<p>{t('body')}</p>} />
      <ol className="m-0 flex list-none flex-col gap-6 p-0">
        <li className="flex flex-col gap-2">
          <h2 className="font-semibold">1. {t('step1')}</h2>
          <CopyableCode language="sh" code={login} labels={copy} />
        </li>
        <li className="flex flex-col gap-2">
          <h2 className="font-semibold">2. {t('step2')}</h2>
          <CopyableCode language="sh" code={link} labels={copy} />
        </li>
        <li className="flex flex-col gap-3">
          <h2 className="font-semibold">3. {t('step3')}</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={pickerId}>{t('client')}</Label>
            <Select value={client} onValueChange={(v) => setClient(v as AgentClient)}>
              <SelectTrigger id={pickerId} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_CLIENTS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CLIENT_NAMES[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p>{t.rich(`where.${client}`, { path })}</p>
          <CopyableCode language={snippet.language} code={snippet.code} labels={copy} />
        </li>
      </ol>
      <GateNote>
        {t.rich('tokens', { link: (c) => <Link href="/app/settings/api">{c}</Link> })}
      </GateNote>
      <div>
        <Button variant="primary" size="lg" onClick={onDone}>
          {t('done')}
        </Button>
      </div>
    </>
  );
}
