// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGate, sha256File, verifyEvidence } from '../lib/gate.mjs';

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oar-gate-'));
  fs.mkdirSync(path.join(root, 'evidence', 'G0'), { recursive: true });
  fs.writeFileSync(path.join(root, 'evidence', 'G0', 'artifact.txt'), 'evidence\n');
  return root;
}

const gate = (checks) => ({
  id: 'G0',
  title: 'test gate',
  checks,
  evidence: ['evidence/G0/report.json', 'evidence/G0/artifact.txt'],
  exit: ['ok'],
});

test('a passing gate writes a report with hashes', () => {
  const root = workspace();
  const report = runGate({
    root,
    gate: gate([{ id: 'ok', cmd: [process.execPath, '-e', 'process.exit(0)'], expect_exit: 0 }]),
    writeEvidence: true,
  });
  assert.equal(report.ok, true);
  assert.equal(report.checks.length, 1);
  assert.match(report.hashes['evidence/G0/artifact.txt'], /^[a-f0-9]{64}$/);
  assert.ok(fs.existsSync(path.join(root, 'evidence', 'G0', 'report.json')));
});

test('a failing check fails the gate', () => {
  const root = workspace();
  const report = runGate({
    root,
    gate: gate([
      { id: 'ok', cmd: [process.execPath, '-e', 'process.exit(0)'], expect_exit: 0 },
      { id: 'bad', cmd: [process.execPath, '-e', 'process.exit(3)'], expect_exit: 0 },
    ]),
  });
  assert.equal(report.ok, false);
  assert.equal(report.checks.find((check) => check.id === 'bad').exit, 3);
});

test('changed evidence fails verification', () => {
  const root = workspace();
  const spec = gate([{ id: 'ok', cmd: [process.execPath, '-e', 'process.exit(0)'], expect_exit: 0 }]);
  const report = runGate({ root, gate: spec, writeEvidence: true });
  fs.writeFileSync(path.join(root, 'evidence', 'G0', 'artifact.txt'), 'changed\n');
  const result = verifyEvidence({ root, gate: spec, report });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => problem.includes('changed since')));
});

test('a shell command is refused', () => {
  const root = workspace();
  const report = runGate({
    root,
    gate: gate([{ id: 'shell', cmd: ['sh', '-c', 'exit 0'], expect_exit: 0 }]),
  });
  assert.equal(report.ok, false);
  assert.match(report.checks[0].error, /not allowed/);
});

test('sha256File is stable', () => {
  const root = workspace();
  const file = path.join(root, 'evidence', 'G0', 'artifact.txt');
  assert.equal(sha256File(file), sha256File(file));
  assert.match(sha256File(file), /^[a-f0-9]{64}$/);
});

test('a gate never hashes its own report', () => {
  const root = workspace();
  const spec = gate([{ id: 'ok', cmd: [process.execPath, '-e', 'process.exit(0)'], expect_exit: 0 }]);
  runGate({ root, gate: spec, writeEvidence: true });
  const second = runGate({ root, gate: spec, writeEvidence: true });
  assert.equal(second.hashes['evidence/G0/report.json'], undefined);
  const result = verifyEvidence({ root, gate: spec, report: second });
  assert.equal(result.ok, true);
});
