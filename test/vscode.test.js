// Tests for the VS Code launch arg builder — the path goes through a Windows
// shell (code.cmd needs shell:true), so it must be quoted to neutralize spaces
// and shell metacharacters. Run with `npm test` (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCodeArg } from '../src/services/vscode.js';

test('Windows arg quotes the path (spaces stay together)', () => {
  assert.equal(buildCodeArg('C:\\Program Files\\proj', true), '"C:\\Program Files\\proj"');
});

test('Windows arg quotes a path with shell metacharacters (no injection)', () => {
  // Inside double quotes cmd.exe treats & | ^ literally, so a real directory
  // named like this opens correctly instead of splitting the command line.
  assert.equal(buildCodeArg('C:\\repos\\a&b', true), '"C:\\repos\\a&b"');
  assert.equal(buildCodeArg('C:\\x & calc.exe', true), '"C:\\x & calc.exe"');
});

test('Windows arg rejects a path containing a double quote', () => {
  assert.equal(buildCodeArg('C:\\a"b', true), null);
});

test('Windows arg doubles a trailing backslash so the closing quote survives', () => {
  // "C:\\dir\\" would be read as an escaped quote; doubled it stays literal.
  assert.equal(buildCodeArg('C:\\dir\\', true), '"C:\\dir\\\\"');
  assert.equal(buildCodeArg('C:\\dir', true), '"C:\\dir"'); // no trailing slash: unchanged
});

test('Windows arg rejects % (env-var expansion survives quoting) and control chars', () => {
  // %VAR% is expanded by cmd AFTER quoting; a hostile var value could re-inject.
  assert.equal(buildCodeArg('C:\\a%EVIL%b', true), null);
  assert.equal(buildCodeArg('C:\\100%done', true), null);
  // CR/LF/NUL truncate or corrupt the command line.
  assert.equal(buildCodeArg('C:\\a\r\nb', true), null);
  assert.equal(buildCodeArg('C:\\a\x00b', true), null);
});

test('non-Windows arg is the literal path (shell:false, no quoting)', () => {
  assert.equal(buildCodeArg('/home/u/my proj', false), '/home/u/my proj');
});
