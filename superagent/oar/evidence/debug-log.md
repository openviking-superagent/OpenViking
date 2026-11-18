# Debug log: G0 foundation slice

Each entry follows D0-D7: symptom, reproduction, root cause, fix, regression.

## 1. `node --test test/` failed on Node 22

- Symptom: the runner treated `test/` as a single module and reported one
  failure instead of discovering the cases.
- Reproduction: `node --test test/`.
- Root cause: this Node version expects a glob or auto-discovery, not a
  directory argument.
- Fix: use `node --test` everywhere (package script, AGENTS.md, README).
- Regression: the gate runs each test file explicitly, so the runner's
  discovery behavior cannot hide a file.

## 2. A gate hashed its own report

- Symptom: `node lib/gate.mjs G0` failed with "evidence changed since the gate
  ran" right after a passing write.
- Reproduction: run G0 twice with `--write-evidence`.
- Root cause: the gate's evidence list contains `evidence/G0/report.json`, and
  the second run hashed the previous report before rewriting it.
- Fix: skip the gate's own report when hashing; add a test that writes twice and
  verifies.
- Regression: `test/gate.test.mjs#a gate never hashes its own report`.

## 3. Restricted replay counted an expected failure as a mismatch

- Symptom: the policy-change replay test reported `mismatches: 1`.
- Reproduction: restrict `rollout.allowedBackends` to native and replay the
  stale-native fixture.
- Root cause: that sample's native evidence is stale on purpose, so with OAR
  disallowed there is no eligible backend; the sample is a fail-closed case,
  not a reproducibility case.
- Fix: the test filters that sample out; the fail-closed path has its own case.
- Regression: `test/selector.test.mjs#no eligible candidate fails closed`.

## 4. In-process pi reported the wrong refusal

- Symptom: the adapter test expected "in-process" but got "no mapping".
- Reproduction: open an OAR session for pi with `execution: in_process` and a
  test catalog that only contained codex.
- Root cause: the test catalog omitted pi, so the lookup failed before the
  execution check.
- Fix: the test catalog contains pi with a verified mapping; the execution
  check then produces the intended refusal.
- Regression: `test/adapter-session.test.mjs#in-process pi refuses before open`.

## 5. Empty isolation envelope looked like a valid launch

- Symptom: the first `isolationEnvelope` returned `launchArgs: []` for a
  verified launch-args mapping, which would launch without isolation.
- Reproduction: call the envelope with a verified test catalog.
- Root cause: the envelope described the channel but not who supplies the
  arguments.
- Fix: drop the empty array and return `requires: "ov-isolation launch
  arguments"`, so the adapter must merge the real arguments.
- Regression: `test/adapter-session.test.mjs#verified OAR carries ownership
  switches and no credentials`.
