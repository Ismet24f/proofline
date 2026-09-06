# Security Policy

## Supported versions

Security fixes are provided for the latest released Proofline `v0.1.x` version. The unreleased `main` branch is supported for development only. Node 22 and Node 24 on GitHub-hosted Linux runners are the supported runtimes for v0.1.

GitHub Enterprise Server and Windows runners are not supported in v0.1 because they have not been validated. macOS is used for local development but is not a supported action runtime.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository: **Security -> Advisories -> Report a vulnerability**. Do not open a public issue for a suspected vulnerability. Include the affected commit or version, reproduction steps, impact, and any suggested mitigation. We will acknowledge a report within five business days and coordinate disclosure after a fix is available.

## Data and permission model

Proofline runs locally inside the consumer's GitHub Actions runner. The action does not make network requests, send telemetry, require a Proofline token, or read `GITHUB_TOKEN`. Consumers should grant only `contents: read` unless their surrounding workflow needs more access.

Plan fragments, Playwright JSON reports, result envelopes, and reconciliation reports can contain repository paths, test titles, project names, tags, and failure details. Treat these artifacts as potentially sensitive. Keep retention short, restrict repository and Actions access appropriately, and do not upload secrets or production data through test names, attachments, or failure messages.

All action input and output paths must be repository-relative. Proofline rejects absolute paths and `..` traversal. Existing path inputs, including an explicitly supplied Playwright config, are resolved before use and rejected when their resolved target escapes the checked-out workspace. Artifact discovery does not follow symlinks. These checks are performed at access time; v0.1 does not claim protection against another process concurrently replacing validated filesystem entries.

Reconciliation scans at most 32 directory levels, 4,096 directories, 20,000 entries, and 4,096 plan/envelope files. It reads at most 512 MiB of distinct artifact JSON across the run, sequentially. Each JSON file is independently limited to 50 MiB, depth 64, 1 MiB strings, and 200,000 nodes. A breached bound produces a tool error.
