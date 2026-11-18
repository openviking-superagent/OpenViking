// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decide, scoreCandidate, validatePolicy, PolicyError, NoEligibleBackendError,
} from '../lib/selector.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const policy = () => JSON.parse(fs.readFileSync(path.join(here, '..', 'spec', 'policy', 'selector.json'), 'utf8'));
const NOW = Date.parse('2026-11-18T00:00:00Z');

function candidate(backend, overrides = {}) {
  return {
    backend,
    available: true,
    capabilities: ['open', 'resume', 'steer', 'queue', 'usage', 'context'],
    isolation: { ok: true, tenantSafe: true },
    evidence: { level: 'E2', verifiedAt: '2026-11-17' },
    confidence: 0.9,
    health: { openSuccessRate: 1, turnSuccessRate: 1 },
    latency: { p95Ms: 100, baselineP95Ms: 100 },
    cost: { tokensPerTurn: 1000, baselineTokensPerTurn: 1000 },
    hostValue: 0.5,
    rolloutWeight: 0.1,
    defects: { p0: 0, p1: 0 },
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    runtime: 'codex',
    instance: 'i',
    agent: 'a',
    sessionKey: 's1',
    requiredCapabilities: ['open', 'resume'],
    memoryOwner: 'host',
    multiTenant: false,
    ...overrides,
  };
}

const run = (candidates, overrides = {}, extra = {}) => decide({
  request: request(overrides.request),
  candidates,
  policy: overrides.policy ?? policy(),
  now: NOW,
  ...extra,
});

test('score beats tie-break priority', () => {
  const decision = run([
    candidate('native', { hostValue: 0.1 }),
    candidate('oar', { hostValue: 0.9 }),
  ]);
  assert.equal(decision.chosen, 'oar');
  assert.equal(decision.reasonCode, 'highest_score');
});

test('tie-break is deterministic', () => {
  const decision = run([candidate('native'), candidate('oar')]);
  assert.equal(decision.chosen, 'native');
  for (let index = 0; index < 50; index += 1) {
    assert.deepEqual(run([candidate('native'), candidate('oar')]), decision);
  }
});

test('stale evidence fails C8', () => {
  const decision = run([
    candidate('native', { evidence: { level: 'E2', verifiedAt: '2026-10-01' } }),
    candidate('oar'),
  ]);
  assert.equal(decision.chosen, 'oar');
  const native = decision.candidates.find((entry) => entry.backend === 'native');
  assert.equal(native.eligible, false);
  assert.ok(native.constraints.some((entry) => entry.code === 'C8' && entry.reason.includes('stale')));
});

test('missing required capability fails C3', () => {
  const decision = run(
    [candidate('native', { capabilities: ['open', 'prepared_rotation'] }), candidate('oar', { capabilities: ['open'] })],
    { request: { requiredCapabilities: ['open', 'prepared_rotation'] } },
  );
  assert.equal(decision.chosen, 'native');
  const oar = decision.candidates.find((entry) => entry.backend === 'oar');
  assert.ok(oar.constraints.some((entry) => entry.code === 'C3' && entry.reason.includes('prepared_rotation')));
});

test('no eligible candidate fails closed', () => {
  assert.throws(
    () => run(
      [candidate('native', { capabilities: ['open'] }), candidate('oar', { capabilities: ['open'] })],
      { request: { requiredCapabilities: ['open', 'prepared_rotation'] } },
    ),
    (error) => {
      assert.ok(error instanceof NoEligibleBackendError);
      assert.equal(error.failures.length, 2);
      assert.match(error.message, /native: C3/);
      assert.match(error.message, /oar: C3/);
      return true;
    },
  );
});

test('an open circuit fails C2', () => {
  const decision = run([
    candidate('native'),
    candidate('oar', { health: { openSuccessRate: 0, turnSuccessRate: 0, circuit: 'open' } }),
  ]);
  assert.equal(decision.chosen, 'native');
  assert.ok(decision.candidates.find((entry) => entry.backend === 'oar').constraints
    .some((entry) => entry.code === 'C2' && entry.reason.includes('circuit')));
});

test('multi-tenant needs tenant-safe isolation', () => {
  const decision = run(
    [candidate('native'), candidate('oar', { isolation: { ok: true, tenantSafe: false } })],
    { request: { multiTenant: true } },
  );
  assert.equal(decision.chosen, 'native');
  const oar = decision.candidates.find((entry) => entry.backend === 'oar');
  assert.ok(oar.constraints.some((entry) => entry.code === 'C5'));
});

test('low confidence fails C8', () => {
  const decision = run([candidate('native'), candidate('oar', { confidence: 0.3 })]);
  assert.equal(decision.chosen, 'native');
  assert.ok(decision.candidates.find((entry) => entry.backend === 'oar').constraints
    .some((entry) => entry.code === 'C8' && entry.reason.includes('confidence')));
});

test('invalid policy is rejected', () => {
  const broken = policy();
  broken.weights.capability = 0.5;
  assert.throws(() => validatePolicy(broken), PolicyError);
  assert.throws(() => decide({ request: request(), candidates: [candidate('native')], policy: broken, now: NOW }), PolicyError);
});

test('sticky decision survives an ordinary turn', () => {
  const first = run([candidate('native'), candidate('oar', { hostValue: 0.9 })]);
  assert.equal(first.chosen, 'oar');
  const second = run(
    [candidate('native'), candidate('oar', { hostValue: 0.1 })],
    { request: { sessionKey: 's1' } },
    { previous: { sessionKey: 's1', policyVersion: first.policyVersion, chosen: 'native' } },
  );
  assert.equal(second.chosen, 'native');
  assert.equal(second.reasonCode, 'sticky');
});

test('declared event re-evaluates', () => {
  const decision = run(
    [candidate('native'), candidate('oar', { hostValue: 0.9 })],
    {},
    { previous: { sessionKey: 's1', policyVersion: policy().version, chosen: 'native' }, event: 'session_rotation' },
  );
  assert.equal(decision.chosen, 'oar');
  assert.notEqual(decision.reasonCode, 'sticky');
});

test('rollout allowlist is enforced', () => {
  const restricted = policy();
  restricted.rollout.allowedBackends = ['native'];
  const decision = run([candidate('native'), candidate('oar', { hostValue: 0.9 })], { policy: restricted });
  assert.equal(decision.chosen, 'native');
  assert.ok(decision.candidates.find((entry) => entry.backend === 'oar').constraints
    .some((entry) => entry.code === 'C6'));
});

test('decision record is complete', () => {
  const decision = run([candidate('native'), candidate('oar')]);
  assert.match(decision.decisionId, /^dec_[a-f0-9]{16}$/);
  assert.match(decision.decisionKey, /^[a-f0-9]{64}$/);
  assert.equal(decision.runtime, 'codex');
  assert.equal(decision.policyVersion, policy().version);
  assert.equal(decision.evidenceVersion, policy().evidence.version);
  assert.equal(decision.candidates.length, 2);
  assert.ok(Array.isArray(decision.fallbackChain));
  assert.ok(decision.reasonCode);
});

test('score components are bounded', () => {
  const { score, components } = scoreCandidate(candidate('native', {
    latency: { p95Ms: 900, baselineP95Ms: 100 },
    cost: { tokensPerTurn: 9000, baselineTokensPerTurn: 1000 },
    health: { openSuccessRate: 0.5, turnSuccessRate: 0.5 },
  }), policy());
  for (const value of Object.values(components)) assert.ok(value >= 0 && value <= 1);
  assert.ok(score >= 0 && score <= 1);
});
