# Reconciliation fixtures

`classification-matrix.json` is an artifact-only fixture describing every
primary classification plus planned-disabled and unexpected conditions. Tests
materialize it into valid, digest-linked plan, envelope, and Playwright JSON
artifacts. This keeps expected counts hand-auditable while exercising real file
parsing, hashing, topology enumeration, and atomic output.
