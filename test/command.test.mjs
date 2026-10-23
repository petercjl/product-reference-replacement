import test from 'node:test';
import assert from 'node:assert/strict';
import {execute,redact,describeError} from '../src/command.mjs';
test('subprocess failure preserves exit/child code with redacted bounded diagnosis',()=>{
 assert.throws(()=>execute(process.execPath,['-e',`console.error(JSON.stringify({error:{code:'LOCAL_EDITS',message:'token=private-value Bearer confidential',details:{stage:'skill-preflight',token:'hidden'}}}));process.exit(7)`]),e=>{
  assert.equal(e.code,'COMMAND_FAILED');assert.equal(e.details.exit_code,7);assert.equal(e.details.child_code,'LOCAL_EDITS');
  assert.equal(e.details.child_details.stage,'skill-preflight');
  assert.doesNotMatch(JSON.stringify(describeError(e)),/private-value|confidential|hidden/);return true;
 });
 assert.doesNotMatch(redact('https://user:pass@example.test npm_abcd _authToken=abcd'),/user:pass|npm_abcd|=abcd/);
});
