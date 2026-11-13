# askcalls

The [AskCalls](https://askcalls.com) agent: a local MCP server that holds your keys, so Claude, Cursor or any MCP client can search, read and import your end-to-end encrypted call transcripts. Decryption happens on your computer; the server only ever sees ciphertext.

Runs on Node 20+ or Bun.

```sh
npx askcalls login --url https://askcalls.com
npx askcalls link
```

`link` pairs this computer with your account through a verified fingerprint, like linking another browser. The root key is stored in your OS keychain.

Then add the MCP server to your client, for example Claude Code:

```sh
claude mcp add --scope user askcalls -- npx askcalls mcp
```

Bulk import uses the same on-device pipeline as the web app:

```sh
npx askcalls ingest ./calls --manifest manifest.csv --backup-recordings
```

`npx askcalls ingest --help` describes the folder layout and every `manifest.csv` column. `--dry-run` lists how the files pair into calls, what each call gets from the manifest, the files it skips and the manifest's problems by line, without logging in or sending anything; add `--json` for a machine-readable plan. The MCP server offers the same as `import_format` and `ingest_batch` with `dry_run: true`, so an AI agent can turn another layout into a folder AskCalls reads.

Setup for Claude Desktop, Cursor, VS Code, Windsurf and Codex, the list of MCP tools, and the security model are in the [project README](https://github.com/Heknon/AskCalls#use-with-your-ai) and the [threat model](https://github.com/Heknon/AskCalls/blob/master/docs/threat-model.md).

## Verify the package

Each release on GitHub lists the SHA-256 of `askcalls-<version>.tgz`, and the package is published with npm provenance, so `npm audit signatures` ties it to the release workflow run that built it.

## License

MIT
