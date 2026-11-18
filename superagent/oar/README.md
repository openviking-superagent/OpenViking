# OAR integration for OpenViking SuperAgent

This directory is the executable slice of **OAR-STD-002**: the spec, the
adaptive backend selector, the isolation mapping, and the gates that keep them
honest. It is deliberately dependency-free (Node built-ins only) so the
workflow runs on the Node version SuperAgent already ships.

## What it decides

SuperAgent already supports nine runtimes: `codex`, `traex`, `claude`, `volc`,
`pi`, `durable`, `dsh`, `opencode`, `agy`. This work adds a second backend for
the runtimes OAR covers, without removing or rewriting the native adapters:

| runtime | native | OAR | status |
|---|---|---|---|
| codex | yes | mapped | pending probe |
| claude | yes | mapped | pending probe |
| pi | yes | mapped | pending probe; subprocess only |
| opencode | yes | mapped | pending probe |
| dsh | yes | mapped | pending probe |
| agy | yes | mapped | pending probe |
| durable | yes | mapped | pending version alignment |
| traex | yes | no adapter | native-only |
| volc | yes | remote | native-only |

`backend=auto` is the only default. There is no built-in native fallback: the
selector filters hard constraints, scores the survivors, breaks ties
deterministically, and keeps the choice sticky for the session. If nothing is
eligible it raises `NoEligibleBackendError` with every candidate's reasons.

## The invariant this code enforces

OpenViking SuperAgent owns OpenViking memory for every runtime it launches
(`docs/openviking-ownership.md`): the daemon syncs and recalls, the Core's
`openviking_*` tools are the only memory surface, and a runtime's own
OpenViking plugin must stay out. The OAR backend therefore maps each runtime's
`ovIsolation` mechanism onto an OAR session channel and refuses to be a
candidate until that mapping is verified against the real CLI. `lib/isolation.mjs`
also reuses `openVikingAgentEnv()` from `deployment-config.cjs` as the second
line, so the six memory switches are always `0`.

This is stricter than the planning document: for SuperAgent, `memoryOwner` is
always `host`, not a per-session choice. A runtime whose plugin cannot be kept
out through OAR is ineligible, not degraded.

## Layout

```
AGENTS.md                 agent entry point (read order, commands, stop rules)
WORKFLOW.md               the /workflow states and gates
lib/selector.mjs          constraints, scoring, determinism, stickiness
lib/isolation.mjs         ovIsolation -> OAR channel mapping + ownership env
lib/spec-validate.mjs     REQ/AC/TC/TASK/GATE closure checks
lib/gate.mjs              argv-only checks + hashed evidence
lib/replay.mjs            decision replay (reproducibility + agreement)
lib/workflow.mjs          task DAG: status, next, context pack
spec/                     the source of truth (JSON, no YAML dependency)
test/                     node:test cases mapped to requirements
evidence/                 generated reports; hashes are checked by gates
```

## Commands

```bash
node lib/spec-validate.mjs          # spec closure; writes evidence/spec-validate.json
node --test                   # all unit and contract tests
node lib/replay.mjs                 # replay fixtures; must print mismatches: 0
node lib/workflow.mjs status        # task DAG and ready work
node lib/workflow.mjs next          # next runnable tasks
node lib/gate.mjs G0 --write-evidence
node lib/gate.mjs G0                # re-run and verify evidence hashes
```

## Adding or enabling a runtime

1. Add or update the runtime in `spec/matrix.json`.
2. Map its existing `ovIsolation` mechanism in `lib/isolation.mjs` and write the
   probe task in `spec/tasks.json`.
3. Verify the mapping against the real CLI; only then set `verified: true` and
   raise the matrix `oar` entry to `available` with E2 or better evidence.
4. Add the contract cases to `spec/tests/cases.json` and the gate check.

The native adapter is the behavioral baseline. An OAR candidate must pass the
same assertions or declare a documented difference; capabilities OAR does not
model (`prepared_rotation`, authority tokens, turn notices, the loop breaker)
stay hard constraints, so a candidate without them is ineligible.

## Scope of this change

Included: spec and closure checks, selector, isolation mapping, replay,
workflow runner, gates, tests. Not included yet: the OAR adapter itself
(`lib/adapter/*`), capture fallback, dark launch and canary. Those are tasks
`T2.1`-`T3.1` in `spec/tasks.json`; they need the `@botiverse/oar` dependency
and real CLI probes, which this change intentionally does not add.
