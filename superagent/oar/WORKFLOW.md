# /workflow

The workflow is a state machine over `spec/tasks.json`. It is designed for an
agent to pick up after an interruption without guessing: every state has a
command, an artifact, and an exit condition.

```
intake -> spec -> build -> verify -> review -> gate -> pr -> operate
             ^                         |
             +--------- debug <--------+   (review finding, test failure, gate failure)
```

## Commands by state

| state | command | artifact | exit |
|---|---|---|---|
| spec | `node lib/spec-validate.mjs` | `evidence/spec-validate.json` | zero errors |
| build | `node lib/workflow.mjs next` | task card | one task claimed |
| verify | the task's `verify` commands | `evidence/<task>/report.json` | every exit matches |
| review | rubric in `spec/reviews/rubric.json` | `evidence/review.json` | score >= 3.5, no S1/S2 |
| gate | `node lib/gate.mjs <id> --write-evidence` | `evidence/<gate>/report.json` | all checks pass |
| pr | PR body with evidence paths | PR | review approved |
| operate | `node lib/workflow.mjs status` | weekly report | no regression |

## Claim a task

```bash
node lib/workflow.mjs next
node lib/workflow.mjs context T1.1
```

Copy the context pack into the agent run. Do not start a task whose
`depends_on` is not `done`; the runner only lists ready tasks, but a hand-edited
task can still violate the DAG. `spec:validate` catches that.

## Handoff (after two failed verifies or a blocked dependency)

```json
{
  "task_id": "T2.1",
  "status": "blocked",
  "artifacts": ["lib/adapter/claude.mjs"],
  "evidence": ["evidence/T2.1/report.json"],
  "commands": [{"cmd": "node --testadapter.test.mjs", "exit": 1}],
  "blocked_by": "OAR cannot carry the claude settings layer without a second --settings flag",
  "needs": "a decision on composing settings or an OAR upstream option",
  "unblocks": []
}
```

## Debug entry

A review S1/S2, a failing business assertion, a gate failure, or a canary
metric breach enters `debug` at D0. The D0-D7 procedure and the evidence bundle
shape are in `spec/debug/playbooks.json` and `docs/RUNBOOK.md`. A fix always
lands with the regression case first.

## Gates

| gate | meaning | evidence |
|---|---|---|
| G0 | spec closes; selector, isolation, gate, replay, workflow pass | `evidence/G0/report.json` |
| G1 | claude/pi adapters pass the native contract with isolation | `evidence/G1/` |
| G2 | replay, review and G0 are green for admission | `evidence/G2/`, `evidence/review.json` |

`node lib/gate.mjs G0` re-runs the checks and then verifies that every hashed
evidence file still matches the passing run. A modified report fails.
