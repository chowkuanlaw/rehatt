'use strict';
// When does the last message of Claude Code (or Codex) count as a question for you? (question.cjs)
const test = require('node:test');
const assert = require('node:assert/strict');
const { questionFrom } = require('../question.cjs');

test('examples and quotes never count as a question', () => {
  assert.equal(questionFrom('Example: which colour do you want?'), '');
  assert.equal(questionFrom('> Which colour do you want?'), '');
});
test('a question near the end, or "type 1 or 2", also waits for you; a plain summary does not', () => {
  assert.notEqual(questionFrom('What should I do?\n\n1. Skill\n2. Tray\n\nType **1** or **2**.'), '');
  assert.notEqual(questionFrom('Done.\n\nShould I run the tests too?\n\nThen you know for sure everything works.'), '');
  assert.notEqual(questionFrom('It is ready. Let me know.'), '');
  assert.notEqual(questionFrom('Siap.\n\nAnda mahu saya jalankan ujian juga?\n\nKemudian anda pasti semuanya berfungsi.'), '');
  assert.notEqual(questionFrom('Semua sudah sedia. Beritahu saya.'), '');
  assert.equal(questionFrom('Do you want this?\n\n- line 1\n- line 2\n- line 3\n\nEverything works and is saved.'), '');
  assert.equal(questionFrom('Done! The app is open.'), '');
  assert.equal(questionFrom('Done.\n```\ndo you want this?\n```'), '');
});
