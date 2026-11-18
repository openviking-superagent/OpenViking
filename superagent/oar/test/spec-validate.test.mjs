// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSpec, validateSpec } from '../lib/spec-validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function fixture() {
  return {
    requirements: {
      requirements: [{
        id: 'REQ-001', level: 'MUST', title: 'one', statement: 'the system must do one thing',
        acceptance: [{ id: 'AC-001-1', given: 'g', when: 'w', then: 't' }],
        tests: ['TC-001'], owner: 'owner',
      }],
    },
    tests: {
      cases: [{
        id: 'TC-001', level: 'L1', given: 'g', when: 'w', then: 't',
        requirements: ['REQ-001'], automation: 'test/x.test.mjs#case',
      }],
    },
    tasks: {
      tasks: [{
        id: 'T1.0', title: 't', owner_role: 'implementer', status: 'todo', depends_on: [],
        requirements: ['REQ-001'], outputs: ['lib/x.mjs'],
        verify: [{ cmd: ['node', '-e', '0'], expect_exit: 0 }],
      }],
    },
    gates: {
      gates: [{
        id: 'G0',
        checks: [{ id: 'c', cmd: ['node', '-e', '0'], expect_exit: 0 }],
        evidence: ['evidence/G0/report.json'], exit: ['ok'],
      }],
    },
    matrix: {
      runtimes: [{
        id: 'codex',
        native: { evidence: { level: 'E1' } },
        oar: { status: 'pending', evidence: { level: 'E0' } },
      }],
    },
    capabilities: { capabilities: [{ id: 'open', title: 'Open' }] },
  };
}

const codes = (spec) => validateSpec(spec).errors.map((error) => error.code);

test('committed spec passes', () => {
  const report = validateSpec(loadSpec(root));
  assert.deepEqual(report.errors, []);
  assert.equal(report.ok, true);
  assert.equal(report.stats.requirementCoverage, 1);
});

test('valid fixture passes', () => {
  assert.equal(validateSpec(fixture()).ok, true);
});

test('duplicate ids are reported', () => {
  const spec = fixture();
  spec.requirements.requirements.push(structuredClone(spec.requirements.requirements[0]));
  assert.ok(codes(spec).includes('E-DUP'));
});

test('orphan test and dangling requirement are reported', () => {
  const spec = fixture();
  spec.tests.cases.push({
    id: 'TC-099', level: 'L1', given: 'g', when: 'w', then: 't',
    requirements: ['REQ-999'], automation: 'test/y.test.mjs#case',
  });
  const found = codes(spec);
  assert.ok(found.includes('E-TRACE'));
  assert.ok(validateSpec(spec).errors.some((error) => error.message.includes('REQ-999')));
});

test('dangling task dependency is reported', () => {
  const spec = fixture();
  spec.tasks.tasks[0].depends_on = ['T9.9'];
  assert.ok(codes(spec).includes('E-DAG'));
});

test('a dependency cycle is reported', () => {
  const spec = fixture();
  spec.tasks.tasks.push({
    id: 'T1.1', title: 't', owner_role: 'implementer', status: 'todo', depends_on: ['T1.0'],
    requirements: ['REQ-001'], outputs: ['lib/y.mjs'],
    verify: [{ cmd: ['node', '-e', '0'], expect_exit: 0 }],
  });
  spec.tasks.tasks[0].depends_on = ['T1.1'];
  assert.ok(codes(spec).includes('E-CYCLE'));
});

test('a MUST cannot stay TBD', () => {
  const spec = fixture();
  spec.requirements.requirements[0].statement = 'TODO decide this';
  assert.ok(codes(spec).includes('E-TODO'));
});

test('available oar needs E2', () => {
  const spec = fixture();
  spec.matrix.runtimes[0].oar = { status: 'available', evidence: { level: 'E1' } };
  assert.ok(codes(spec).includes('E-MATRIX'));
});

test('a task without verify is rejected', () => {
  const spec = fixture();
  spec.tasks.tasks[0].verify = [];
  assert.ok(codes(spec).includes('E-EMPTY'));
});
