# Runbook: review, tests and debug

## D0-D7

| phase | goal | time box | artifact |
|---|---|---|---|
| D0 detect | classify severity and blast radius | 5 min | incident id |
| D1 stabilize | pin backend, disable candidate, roll back policy or build | 15 min (S1) / 1 h (S2) | pin record |
| D2 reproduce | scripted runtime or fixture; smallest input | 30 min | repro script |
| D3 localize | bisect version/config, diff native vs OAR, isolate one runtime | 1 h | evidence set |
| D4 evidence | decision record, rawEvents slice, OV session ids, versions, flags | 30 min | debug bundle |
| D5 hypothesis | one variable at a time; predict then test | 1 h | hypothesis table |
| D6 fix | regression case first, then fix, then rerun the gate | as needed | test + PR |
| D7 learn | RCA, action items, update playbook/test | 3 days (S1/S2) | RCA |

Rules: no D2 before D1; restarting is not a root cause; every fix adds a
regression case; a changed evidence file fails the gate on purpose.

## Entering debug

| trigger | route |
|---|---|
| review S1 | block merge, D0, reproduce |
| review S2 | merge blocked, D2 and D5 |
| gate failure | D3 first: is it a spec link, a test, or evidence? |
| business assertion failure | D2 with the failing case, then D6 |
| canary metric breach | D1 first, then D2 |

## Evidence bundle

```json
{
  "incident_id": "INC-...",
  "severity": "S1",
  "symptom": "one turn in two OV sessions",
  "versions": { "oar": "0.118.0", "cli": "codex 0.166.0", "node": "24.21.0", "policy": "2026-11-18.1" },
  "decision": "evidence/INC-.../decision.json",
  "records": "evidence/INC-.../records.jsonl",
  "ov_sessions": ["sess-a", "sess-b"],
  "env": { "OPENVIKING_AUTO_CAPTURE": "1" },
  "repro": "scripts/repro/inc-....sh",
  "hypotheses": [{ "h": "plugin was not inert", "test": "read env", "result": "confirmed" }],
  "root_cause": "adapter omitted host-managed switches",
  "fix": "PR#...",
  "regression": "TC-009",
  "actions": [{ "item": "assert the switches in the adapter test", "owner": "...", "due": "..." }]
}
```

## Symptom map

| symptom | first checks | usual cause |
|---|---|---|
| NoEligibleBackendError | evidence age, CLI availability, allowlist | stale probe or a version jump |
| OAR open fails | versions, login, session options | version or settings conflict |
| tools work, recall does not | isolation channel, plugin load | plugin still loaded or no context assemble |
| one turn in two sessions | OPENVIKING_* switches, isolation | host-managed switches missing |
| resume repeats | message id, controller, commit id | no idempotency |
| tokens jump | context budget, recall dedup | repeated injection |
| selector always native | weights, evidence, isolation | pending OAR or biased score |
| decision flaps | sticky key, event list | re-evaluation too broad |
