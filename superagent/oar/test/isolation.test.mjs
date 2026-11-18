// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OAR_ISOLATION_RUNTIMES, REQUIRED_ZERO_SWITCHES, assertOwnershipEnv,
  isolationFor, isolationEnvelope, ownershipEnv,
} from '../lib/isolation.mjs';

const AGENT = { dataDir: '/tmp/oar-test', ovConfig: '/tmp/oar-test/ovcli.conf' };
const CATALOG = ['codex', 'traex', 'claude', 'volc', 'pi', 'durable', 'dsh', 'opencode', 'agy'];

test('native always uses the existing isolation', () => {
  for (const runtime of CATALOG) {
    const state = isolationFor(runtime, { backend: 'native' });
    assert.equal(state.ok, true, runtime);
    assert.equal(state.verified, true, runtime);
  }
});

test('in-process pi cannot receive isolation', () => {
  const state = isolationFor('pi', { backend: 'oar', execution: 'in_process' });
  assert.equal(state.ok, false);
  assert.match(state.reason, /in-process/);
});

test('unverified mapping stays pending', () => {
  for (const runtime of ['codex', 'claude', 'pi', 'opencode', 'dsh', 'agy', 'durable']) {
    const state = isolationFor(runtime, { backend: 'oar', execution: 'process' });
    assert.equal(state.ok, false, runtime);
    assert.equal(state.pending, true, runtime);
    assert.match(state.reason, /not verified/, runtime);
  }
});

test('runtimes without an OAR adapter are refused', () => {
  for (const runtime of ['traex', 'volc']) {
    const state = isolationFor(runtime, { backend: 'oar' });
    assert.equal(state.ok, false, runtime);
    assert.equal(state.pending, undefined, runtime);
  }
  assert.equal(OAR_ISOLATION_RUNTIMES.traex.oar, false);
  assert.equal(OAR_ISOLATION_RUNTIMES.volc.oar, false);
});

test('unknown runtime is refused', () => {
  const state = isolationFor('missing', { backend: 'oar' });
  assert.equal(state.ok, false);
  assert.match(state.reason, /no OAR isolation mapping/);
});

test('every catalog runtime has a mapping', () => {
  for (const runtime of CATALOG) {
    assert.ok(OAR_ISOLATION_RUNTIMES[runtime], runtime);
  }
});

test('ownership env pins the instance', () => {
  const env = ownershipEnv(AGENT);
  for (const name of REQUIRED_ZERO_SWITCHES) assert.equal(env[name], '0', name);
  assert.equal(env.OPENVIKING_CLI_CONFIG_FILE, AGENT.ovConfig);
  assert.deepEqual(assertOwnershipEnv(env), []);
});

test('ownership env refuses a missing or non-zero switch', () => {
  const env = { ...ownershipEnv(AGENT), OPENVIKING_AUTO_CAPTURE: '1' };
  const problems = assertOwnershipEnv(env);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /OPENVIKING_AUTO_CAPTURE/);
  assert.ok(assertOwnershipEnv({}).some((problem) => /OPENVIKING_CLI_CONFIG_FILE/.test(problem)));
});

test('isolation envelope never carries credentials', () => {
  const native = isolationEnvelope('codex', { backend: 'native' });
  assert.equal(native.ok, true);
  assert.deepEqual(native.sessionOptions, {});
  const oar = isolationEnvelope('codex', { backend: 'oar', execution: 'process', agent: AGENT });
  assert.equal(oar.ok, false);
  assert.match(oar.reason, /not verified/);
});
