// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replayDecisions } from '../lib/replay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(fs.readFileSync(path.join(here, '..', 'spec', file), 'utf8'));
const policy = () => read('policy/selector.json');
const fixture = () => read('fixtures/replay.json');

test('replay is reproducible', () => {
  const report = replayDecisions({ policy: policy(), samples: fixture().samples });
  assert.equal(report.mismatches, 0);
  assert.equal(report.agreement, 1);
  assert.equal(report.samples, fixture().samples.length);
  assert.ok(report.rows.every((row) => row.reproducible));
});

test('replay exposes a policy change', () => {
  const restricted = policy();
  restricted.rollout.allowedBackends = ['native'];
  const samples = fixture().samples.filter((sample) => sample.id !== 'stale-native');
  const report = replayDecisions({ policy: restricted, samples });
  assert.equal(report.mismatches, 0);
  assert.ok(report.rows.every((row) => row.chosen === 'native'));
});

test('an empty fixture is valid', () => {
  const report = replayDecisions({ policy: policy(), samples: [] });
  assert.deepEqual(report, { samples: 0, mismatches: 0, agreement: null, rows: [] });
});
