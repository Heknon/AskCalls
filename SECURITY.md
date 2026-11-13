# Security policy

AskCalls holds people's phone calls, so we treat security reports as the most important issues we get.

## Reporting a vulnerability

Report privately through GitHub: **[Security → Report a vulnerability](https://github.com/Heknon/AskCalls/security/advisories/new)**. Please do not open a public issue, pull request or discussion for a vulnerability.

Include what you can:

- what an attacker can do, and which of the adversaries in the [threat model](docs/threat-model.md) they are (the server operator, another user, a provider, script in the page…);
- the affected version or commit, and whether it is the hosted service, a self-hosted instance, local mode or the agent;
- steps to reproduce, or a proof of concept.

Never include real call data. Test against your own account or a local instance (`bun run dev` runs one with in-memory storage and mock providers).

## What to expect

- An acknowledgement within 3 working days.
- An assessment within 10 working days: whether we can reproduce it, how severe it is, and a fix plan.
- A fix in a release, then a published GitHub security advisory crediting you unless you ask us not to. We aim to fix critical issues within 14 days.

We ask that you give us time to ship a fix before disclosing, and coordinate the date with us in the advisory.

## In scope

Anything that breaks a promise in the [threat model](docs/threat-model.md), in particular:

- plaintext (transcript text, words, names, phone numbers, tag names, notes, recordings) reaching server storage, logs, caches or telemetry;
- keys leaving a device unwrapped, or a way to unwrap them without an unlock method;
- one user reading or changing another user's data;
- a way to run script from another origin on app pages, or to widen their CSP;
- the published client asset hashes not matching a build of the tagged commit;
- authentication, token scope, rate-limit or quota bypasses.

Out of scope: denial of service by volume, findings that need a compromised device or browser, missing headers without a demonstrated impact, and the metadata the threat model lists as visible to the server.

## Supported versions

Security fixes go to the latest release and to askcalls.com. Self-hosted instances should run the latest release; [docs/self-hosting.md](docs/self-hosting.md) covers upgrades.
