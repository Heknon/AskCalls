'use client';

import { SectionScreen } from '../_settings/section-screen';
import { AgentSection, RemoteSection } from './_api/agent';
import { TokensSection } from './_api/tokens';

/** S4 API and MCP: personal access tokens, the local agent and the remote MCP server. */
export default function ApiSettingsPage() {
  return (
    <SectionScreen section="api">
      <div className="flex flex-col gap-6">
        <TokensSection />
        <AgentSection />
        <RemoteSection />
      </div>
    </SectionScreen>
  );
}
