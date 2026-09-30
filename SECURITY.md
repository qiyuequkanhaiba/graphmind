# Security Policy

## Reporting A Vulnerability

**Please do not open a public issue, discussion, or pull request for a suspected
vulnerability.**

Report it privately through GitHub private vulnerability reporting:

> ### → [Report a vulnerability](https://github.com/qiyuequkanhaiba/graphmind/security/advisories/new)

The report stays visible only to you and the maintainers until a fix is
published and a coordinated disclosure date is agreed. If you cannot use the
form above, open a minimal public issue that asks a maintainer to contact you —
without disclosing any detail of the vulnerability.

### What to include

A report we can act on quickly usually contains:

- A description of the issue and the security impact you believe it has.
- The affected component and the commit SHA or branch you tested.
- The deployment mode involved, if relevant (see `deploy/`).
- Reproduction steps or a proof of concept, including any required configuration.
- The conditions an attacker needs: network position, authentication state,
  user interaction.
- Any proposed mitigation or patch.
- How you would like to be credited, if at all.

Never include real credentials, production data, or third-party personal data.
Redact secrets and use synthetic data in proof-of-concept material.

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement of a complete report | within 5 business days |
| Initial triage and severity assessment | within 10 business days |
| Status update while a fix is in progress | at least every 14 days |
| Fix or documented mitigation | within 90 days for high and critical severity |

These are targets, not guarantees. This project is maintained on a best-effort
basis; if a timeline slips we will tell you rather than go quiet.

### Coordinated disclosure

We ask for the timelines above before you publish. Once a fix or mitigation is
available we will publish a GitHub Security Advisory, credit the reporter unless
they prefer to stay anonymous, and request a CVE where the issue warrants one.

If we cannot reproduce an issue, or disagree about its severity or whether it is
a vulnerability at all, we will say so directly and explain our reasoning rather
than leave the report unanswered.

## Scope

In scope:

- The backend API, including authentication, session handling, authorization,
  and sharing logic.
- The frontend application and any code path that handles untrusted input.
- The import pipeline, including URL import allowlisting and outbound fetch
  behaviour.
- The deployment assets in `deploy/`: container images, Compose configuration,
  TLS ingress, and the operator tooling in `deploy/graphmind-ops.py`.
- Dependency and supply-chain issues that affect a supported version.

Out of scope:

- Findings that require an already-compromised host, shell access, or a
  malicious operator in control of the deployment environment.
- Missing hardening headers or TLS configuration on a deployment that does not
  follow `deploy/` — for example a bare `uvicorn` process without the Caddy
  ingress from `deploy/docker-compose.tls.yml`.
- Resource exhaustion by an authenticated user acting within the access they
  were granted.
- Output of an automated scanner with no demonstrated impact.
- Social engineering, physical access, and third-party services we do not
  operate.

## Supported Versions

This project has not published versioned releases yet, so no version table
applies. Security fixes land on `main`, and only the tip of `main` is supported.

| Version | Supported |
| --- | --- |
| `main` (latest commit) | ✅ |
| Any fork, or a commit behind `main` | ❌ |

Once versioned release channels are introduced this table will list them.

## Safe Harbour

We will not pursue or support legal action against anyone who, in good faith,
researches and reports a vulnerability following this policy — including when
testing against a self-hosted instance they own or are authorised to test. We
consider good-faith security research conducted under this policy to be
authorised, and we will say so to any third party that asks.

Good faith means staying within the scope above, not accessing or exfiltrating
data that is not yours, not degrading the service, and honouring the disclosure
timelines in this document.

## Hardening Notes For Operators

The security posture of a self-hosted deployment depends on your configuration.
At a minimum:

- Generate real values for `GRAPHMIND_SESSION_SECRET` and
  `GRAPHMIND_ADMIN_PASSWORD`. Do not deploy
  `deploy/.env.production.example` as-is; the CI preflight in `deploy/` is
  designed to reject exactly that.
- Terminate TLS at the bundled Caddy ingress
  (`deploy/docker-compose.tls.yml`) instead of publishing the application port
  directly.
- Scope `GRAPHMIND_TRUSTED_PROXY_CIDRS`, `GRAPHMIND_ALLOWED_ORIGINS`, and
  `GRAPHMIND_TRUSTED_HOSTS` to your own network and domain.
- Treat `GRAPHMIND_AI_CHAT_API_KEY` and `GRAPHMIND_AI_VECTOR_API_KEY` as
  production credentials.

GitHub secret scanning and push protection are enabled on this repository, and
the `Secret Scanning` workflow runs gitleaks across the full commit history.
A credential that has ever been committed should be treated as compromised and
rotated — removing it in a later commit is not sufficient.

## Credits

We are glad to credit reporters in the published advisory and in release notes.
Tell us the name or handle to use, or ask to remain anonymous.

## Preferred Languages

Reports are accepted in English or Simplified Chinese.
