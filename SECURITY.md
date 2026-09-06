# Security Policy

## Supported versions

Security fixes are provided for the latest released Proofline `v0.1.x` version. The unreleased `main` branch is supported for development only. Node 22 and Node 24 on GitHub-hosted Linux runners are the supported runtimes for v0.1.

GitHub Enterprise Server and Windows runners are not supported in v0.1 because they have not been validated. macOS is used for local development but is not a supported action runtime.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository: **Security -> Advisories -> Report a vulnerability**. Do not open a public issue for a suspected vulnerability. Include the affected commit or version, reproduction steps, impact, and any suggested mitigation. We will acknowledge a report within five business days and coordinate disclosure after a fix is available.

## Data and permission model

Proofline runs locally inside the consumer's GitHub Actions runner. The action does not make network requests, send telemetry, require a Proofline token, or read `GITHUB_TOKEN`. Consumers should grant only `contents: read` unless their surrounding workflow needs more access.

Plan fragments, Playwright JSON reports, result envelopes, and reconciliation reports can contain repository paths, test titles, project names, tags, and failure details. Treat these artifacts as potentially sensitive. Keep retention short, restrict repository and Actions access appropriately, and do not upload secrets or production data through test names, attachments, or failure messages.

All action input and output paths must be repository-relative. Proofline rejects absolute paths and `..` traversal, resolves real paths, and refuses files that escape the checked-out workspace. Symlinks do not relax this boundary.
