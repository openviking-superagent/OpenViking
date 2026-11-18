// Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: AGPL-3.0

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, contextPack, readyTasks, summarize } from '../lib/workflow.mjs';

const task = (id, status, depends) => ({
  id,
  title: id,
  owner_role: 'implementer',
  status,
  depends_on: depends,
  requirements: ['REQ-001'],
  outputs: [`lib/${id}.mjs`],
  verify: [{ cmd: ['node', '-e', '0'], expect_exit: 0 }],
});

test('ready tasks follow the DAG', () => {
  const tasks = [task('T1', 'done', []), task('T2', 'todo', ['T1']), task('T3', 'todo', ['T2'])];
  const state = readyTasks(tasks);
  assert.deepEqual(state.ready.map((entry) => entry.id), ['T2']);
  assert.deepEqual(state.blocked.map((entry) => entry.id), ['T3']);
  assert.deepEqual(state.problems, []);
});

test('a cycle is reported', () => {
  const tasks = [task('T1', 'todo', ['T2']), task('T2', 'todo', ['T1'])];
  assert.ok(buildGraph(tasks).problems.some((problem) => problem.includes('cycle')));
});

test('summary counts and percentage', () => {
  const tasks = [task('T1', 'done', []), task('T2', 'todo', ['T1']), task('T3', 'blocked', [])];
  const summary = summarize(tasks);
  assert.equal(summary.counts.done, 1);
  assert.equal(summary.counts.todo, 1);
  assert.equal(summary.counts.blocked, 1);
  assert.equal(summary.percentDone, 33.3);
});

test('context pack carries verify and requirements', () => {
  const pack = contextPack([task('T1', 'todo', [])], 'T1');
  assert.equal(pack.task.id, 'T1');
  assert.deepEqual(pack.requirements, ['REQ-001']);
  assert.equal(pack.verify.length, 1);
  assert.throws(() => contextPack([], 'missing'), /unknown task/);
});
