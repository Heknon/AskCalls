'use client';

import { CopyableCode } from '@askcalls/ui/components/CopyableCode';
import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { Label } from '@askcalls/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import {
  AGENT_CLIENTS,
  type AgentClient,
  CLIENT_NAMES,
  CLIENT_SNIPPETS,
  loginCommands,
} from '../../../../../(gate)/app/welcome/_onboarding/agent-snippets';
import { mcpUrl, REMOTE_TOOLS, remoteCli, remoteJson } from './remote-snippets';

const path = (c: ReactNode) => <code dir="ltr">{c}</code>;

/** S4 Local agent: sign in, link, add to a client (the README's snippets). */
export function AgentSection() {
  const t = useTranslations('settings.api');
  const tc = useTranslations('common');
  const [client, setClient] = useState<AgentClient>('claudeCode');
  const pickerId = useId();
  const [login, link] = loginCommands(location.origin);
  const copy = { copy: tc('copy'), copied: tc('copied') };
  const snippet = CLIENT_SNIPPETS[client];
  return (
    <SettingsSection title={t('agent')} description={t('agentBody')}>
      <ol className="m-0 flex list-none flex-col gap-5 p-0 py-3">
        <li className="flex flex-col gap-2">
          <h3 className="font-medium">1. {t('step1')}</h3>
          <CopyableCode language="sh" code={login} labels={copy} />
        </li>
        <li className="flex flex-col gap-2">
          <h3 className="font-medium">2. {t('step2')}</h3>
          <CopyableCode language="sh" code={link} labels={copy} />
        </li>
        <li className="flex flex-col gap-3">
          <h3 className="font-medium">3. {t('step3')}</h3>
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
          {client === 'claudeDesktop' ? <p className="text-sm">{t('restart')}</p> : null}
          <p className="text-muted-foreground text-sm">{t('path')}</p>
        </li>
      </ol>
    </SettingsSection>
  );
}

/** S4 Remote MCP: the URL, its three tools, and the inbox data flow. */
export function RemoteSection() {
  const t = useTranslations('settings.api');
  const tc = useTranslations('common');
  const td = useTranslations('dataFlow.nodes');
  const copy = { copy: tc('copy'), copied: tc('copied') };
  const origin = location.origin;
  return (
    <SettingsSection title={t('remote')}>
      <div className="flex flex-col gap-4 py-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-sm">{t('url')}</span>
          <CopyableCode language="text" code={mcpUrl(origin)} labels={copy} />
        </div>
        <div className="flex flex-col gap-2">
          <p>{t('remoteBody')}</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {REMOTE_TOOLS.map((tool) => (
              <li key={tool}>
                <code dir="ltr" className="font-medium">
                  {tool}
                </code>
                : {t(`tools.${tool}`)}
              </li>
            ))}
          </ul>
        </div>
        <DataFlowNote
          route="inbox"
          nodes={{ device: td('device'), server: td('server'), source: t('remote') }}
        >
          {t('inbox')}
        </DataFlowNote>
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('remoteCli')}</p>
          <CopyableCode language="sh" code={remoteCli(origin)} labels={copy} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('remoteJson')}</p>
          <CopyableCode language="json" code={remoteJson(origin)} labels={copy} />
        </div>
      </div>
    </SettingsSection>
  );
}
