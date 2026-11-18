// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { IsolationRefusal, openSessionWithIsolation } from '../lib/adapter/session.mjs';
import { REQUIRED_ZERO_SWITCHES } from '../lib/isolation.mjs';

const AGENT = { dataDir: '/tmp/oar-test', ovConfig: '/tmp/oar-test/ovcli.conf' };
const VERIFIED = {
  codex: {
    mechanism: 'launch-args',
    channel: 'launchArgs',
    helper: 'codexIsolationArgs',
    verified: true,
    note: 'test fixture',
  },
  pi: {
    mechanism: 'launch-args',
    channel: 'launchArgs',
    helper: 'piIsolationArgs',
    verified: true,
    note: 'test fixture',
  },
};

test('native opens without touching session options', async () => {
  let received;
  const result = await openSessionWithIsolation({
    runtimeId: 'codex',
    backend: 'native',
    open: async (input) => { received = input; return { id: 's1' }; },
  });
  assert.deepEqual(received, { backend: 'native', resume: undefined, sessionOptions: {} });
  assert.equal(result.session.id, 's1');
  assert.equal(result.isolation.ok, true);
});

test('verified OAR carries ownership switches and no credentials', async () => {
  let received;
  const result = await openSessionWithIsolation({
    runtimeId: 'codex',
    backend: 'oar',
    agent: AGENT,
    resume: 's1',
    catalog: VERIFIED,
    open: async (input) => { received = input; return { id: 's2' }; },
  });
  assert.equal(received.backend, 'oar');
  assert.equal(received.resume, 's1');
  for (const name of REQUIRED_ZERO_SWITCHES) assert.equal(received.sessionOptions.env[name], '0', name);
  assert.equal(received.sessionOptions.env.OPENVIKING_API_KEY, undefined);
  assert.equal(received.sessionOptions.env.OPENVIKING_BEARER_TOKEN, undefined);
  assert.equal(result.isolation.requires, 'ov-isolation launch arguments');
});

test('unverified OAR refuses before open', async () => {
  let called = false;
  await assert.rejects(
    openSessionWithIsolation({
      runtimeId: 'codex',
      backend: 'oar',
      agent: AGENT,
      open: async () => { called = true; },
    }),
    (error) => {
      assert.ok(error instanceof IsolationRefusal);
      assert.match(error.message, /not verified/);
      return true;
    },
  );
  assert.equal(called, false);
});

test('in-process pi refuses before open', async () => {
  await assert.rejects(
    openSessionWithIsolation({
      runtimeId: 'pi',
      backend: 'oar',
      execution: 'in_process',
      agent: AGENT,
      catalog: VERIFIED,
      open: async () => { throw new Error('must not open'); },
    }),
    /in-process/,
  );
});

test('a missing agent is a programming error, not a degraded open', async () => {
  await assert.rejects(
    openSessionWithIsolation({
      runtimeId: 'codex',
      backend: 'oar',
      catalog: VERIFIED,
      open: async () => { throw new Error('must not open'); },
    }),
    /agent is required/,
  );
});
