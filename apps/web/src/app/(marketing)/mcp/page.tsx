import { getTranslations } from 'next-intl/server';
import { CodeBlock } from '../_components/code';
import { meta } from '../_components/meta';
import { Cmd, code, Doc, PageHero, SiteEnd, Term } from '../_components/site';

export const generateMetadata = meta('mcp', '/mcp');

const SERVERS_JSON = `{
  "mcpServers": {
    "askcalls": {
      "command": "bunx",
      "args": ["askcalls", "mcp"]
    }
  }
}`;

const VSCODE_JSON = `{
  "servers": {
    "askcalls": {
      "type": "stdio",
      "command": "bunx",
      "args": ["askcalls", "mcp"]
    }
  }
}`;

const CODEX_TOML = `[mcp_servers.askcalls]
command = "bunx"
args = ["askcalls", "mcp"]`;

const REMOTE_JSON = `{
  "mcpServers": {
    "askcalls-remote": {
      "url": "https://askcalls.com/api/mcp",
      "headers": { "Authorization": "Bearer ac_..." }
    }
  }
}`;

const TOOLS = [
  ['search_calls', 'search'],
  ['get_call', 'get'],
  ['list_recent_calls', 'recent'],
  ['ingest_call, ingest_batch', 'ingest'],
  ['star_call, tag_call', 'update'],
  ['list_tags, list_contacts', 'catalogs'],
] as const;

const SECTIONS = ['link', 'clients', 'tools', 'ingest', 'remote'] as const;

export default async function McpPage() {
  const t = await getTranslations('marketing.mcpPage');
  return (
    <>
      <PageHero path="/mcp" title={t('title')} lead={t('lead')} />
      <Doc toc={SECTIONS.map((id) => ({ id, label: t(`toc.${id}`) }))}>
        <section className="sec" id="link" aria-labelledby="link-t">
          <h2 className="h2" id="link-t">
            {t('link.title')}
          </h2>
          <p>{t('link.body')}</p>
          <Term bar="~">
            <Cmd>bunx askcalls login --url https://askcalls.com</Cmd>
            <Cmd>bunx askcalls link</Cmd>
          </Term>
        </section>

        <section className="sec" id="clients" aria-labelledby="clients-t">
          <h2 className="h2" id="clients-t">
            {t('clients.title')}
          </h2>
          <h3>Claude Code</h3>
          <Term bar="~">
            <Cmd>claude mcp add --scope user askcalls -- bunx askcalls mcp</Cmd>
          </Term>
          <h3>Claude Desktop</h3>
          <p>{t('clients.claudeDesktop')}</p>
          <ul>
            <li>
              macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
            </li>
            <li>
              Windows: <code>%APPDATA%\Claude\claude_desktop_config.json</code>
            </li>
          </ul>
          <CodeBlock title="claude_desktop_config.json">{SERVERS_JSON}</CodeBlock>
          <h3>Cursor</h3>
          <p>{t.rich('clients.cursor', { code })}</p>
          <CodeBlock title="mcp.json">{SERVERS_JSON}</CodeBlock>
          <h3>VS Code</h3>
          <p>{t.rich('clients.vscode', { code })}</p>
          <CodeBlock title=".vscode/mcp.json">{VSCODE_JSON}</CodeBlock>
          <h3>Windsurf</h3>
          <p>{t.rich('clients.windsurf', { code })}</p>
          <CodeBlock title="mcp_config.json">{SERVERS_JSON}</CodeBlock>
          <h3>Codex CLI</h3>
          <Term bar="~">
            <Cmd>codex mcp add askcalls -- bunx askcalls mcp</Cmd>
          </Term>
          <p className="mt-4">{t.rich('clients.codex', { code })}</p>
          <CodeBlock title="config.toml">{CODEX_TOML}</CodeBlock>
          <p className="mt-6">{t.rich('clients.path', { code })}</p>
        </section>

        <section className="sec" id="tools" aria-labelledby="tools-t">
          <h2 className="h2" id="tools-t">
            {t('tools.title')}
          </h2>
          <p>{t('tools.body')}</p>
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">{t('tools.tool')}</th>
                <th scope="col">{t('tools.does')}</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, key]) => (
                <tr key={key}>
                  <td>
                    <code dir="ltr">{name}</code>
                  </td>
                  <td>{t(`tools.${key}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sec" id="ingest" aria-labelledby="ingest-t">
          <h2 className="h2" id="ingest-t">
            {t('ingest.title')}
          </h2>
          <p>{t('ingest.body')}</p>
          <Term bar="~">
            <Cmd>askcalls ingest ./calls --manifest manifest.csv --backup-recordings</Cmd>
          </Term>
        </section>

        <section className="sec" id="remote" aria-labelledby="remote-t">
          <h2 className="h2" id="remote-t">
            {t('remote.title')}
          </h2>
          <p>{t.rich('remote.body', { code })}</p>
          <p>{t('remote.token')}</p>
          <Term bar="~">
            <Cmd>
              {
                'claude mcp add --transport http askcalls-remote https://askcalls.com/api/mcp \\\n  --header "Authorization: Bearer ac_..."'
              }
            </Cmd>
          </Term>
          <p className="mt-6">{t('remote.json')}</p>
          <CodeBlock title="mcp.json">{REMOTE_JSON}</CodeBlock>
        </section>
      </Doc>
      <SiteEnd />
    </>
  );
}
