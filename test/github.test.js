// Smoke tests for the pure guard helpers in services/github.js. Run with
// `npm test` (node:test). The git/gh I/O ops aren't unit-tested here — they need
// a real repo + the gh CLI — but the guards that gate them are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isValidBranchName, isProtectedBranch, getRepoInfo } from '../src/services/github.js';

test('isValidBranchName accepts the convention and ordinary refs', () => {
  for (const ok of ['issue-30-pr-from-ui', 'feature/foo', 'fix.bug', 'a', 'release-1.2']) {
    assert.ok(isValidBranchName(ok), ok);
  }
});

test('isValidBranchName rejects unsafe / malformed refs', () => {
  for (const bad of ['', '   ', '-foo', '/foo', 'foo/', 'foo.', 'a..b', 'has space', 'tilde~1', 'caret^', null, undefined, 42]) {
    assert.equal(isValidBranchName(bad), false, JSON.stringify(bad));
  }
});

test('isProtectedBranch flags main/master only', () => {
  assert.ok(isProtectedBranch('main'));
  assert.ok(isProtectedBranch('master'));
  assert.equal(isProtectedBranch('issue-30-pr-from-ui'), false);
  assert.equal(isProtectedBranch('develop'), false);
});

test('getRepoInfo degrades to { isRepo:false } for a missing/placeholder path', async () => {
  // simpleGit() throws synchronously on a non-existent dir — the guard must
  // short-circuit (this is the default cities.json REPLACE_WITH/... case).
  assert.deepEqual(await getRepoInfo(path.join('REPLACE_WITH', 'path', 'to', 'nope')), { isRepo: false });
  assert.deepEqual(await getRepoInfo(''), { isRepo: false });
  assert.deepEqual(await getRepoInfo(undefined), { isRepo: false });
});
