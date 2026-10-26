import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {persistMediaExecution} from '../skills/product-reference-replacement/scripts/media-execution.mjs';

test('durable receipt survives discarded stdout and transports complete arguments without shell interpretation',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'执行 receipt '));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const output=path.join(directory,'图 $value `literal`');
 const args=['image','generate','--prompt','line 1\nline 2 $(literal)','--reference','原图 one.png','--reference','资产 two.png','--count','1','--output',output];
 const {execution_record}=await persistMediaExecution({directory,args});
 const saved=JSON.parse(await fs.readFile(execution_record,'utf8'));
 assert.equal(saved.command,'sealseek-media');assert.deepEqual(saved.base_args,args);
 assert.deepEqual(saved.dry_run_args,[...args,'--dry-run','--json']);
 assert.deepEqual(saved.submit_args,[...args,'--via','sealseek','--submit','--json']);
 for(const mode of ['dry_run_args','submit_args']){
  const consumer=spawnSync(process.execPath,['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))','--',...saved[mode]],{encoding:'utf8',shell:false});
  assert.equal(consumer.status,0,consumer.stderr);const received=JSON.parse(consumer.stdout);
  assert.deepEqual(received,saved[mode]);assert.equal(received[received.indexOf('--output')+1],output);
 }
 const before=await fs.readFile(execution_record);await assert.rejects(persistMediaExecution({directory,args}));assert.deepEqual(await fs.readFile(execution_record),before);
});
test('invalid argument arrays fail before creating an execution receipt',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'invalid-receipt-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 for(const args of [[],null,['image',1]])await assert.rejects(persistMediaExecution({directory,args}),{code:'INVALID_EXECUTION_ARGS'});
 await assert.rejects(fs.stat(path.join(directory,'execution.json')),{code:'ENOENT'});
});
