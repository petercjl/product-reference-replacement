import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {install,status} from '../src/lifecycle.mjs';
import {SOURCE,hashes,readJSON,ROOT,writeNew} from '../src/common.mjs';
async function tmp(t){const d=await fs.mkdtemp(path.join(os.tmpdir(),'product-lifecycle-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;}
test('canonical integrity and managed runtime resolve bundled source',async()=>{assert.deepEqual(await hashes(SOURCE),await readJSON(path.join(ROOT,'skill-integrity.json')));});
test('managed copy protects edits and preserves UI metadata with verified backup',async t=>{const home=await tmp(t);let r=await install({home,mode:'copy'});assert.equal(r.managed,true);const yaml=path.join(r.target,'agents/openai.yaml');await fs.writeFile(yaml,'interface:\n  display_name: "自定义产品"\n');r=await install({home,update:true});assert.ok(r.backup);assert.match(await fs.readFile(yaml,'utf8'),/自定义产品/);assert.equal((await status({home})).edited.length,0);assert.equal((await install({home,update:true})).changed,false);const skill=path.join(r.target,'SKILL.md');await fs.writeFile(skill,'user local edit');await assert.rejects(install({home,update:true}),{code:'LOCAL_EDITS'});r=await install({home,update:true,backupEdits:true});assert.equal(await fs.readFile(path.join(r.backup,'SKILL.md'),'utf8'),'user local edit');assert.equal((await status({home})).up_to_date,true);});
test('locked-directory update backs up and syncs in place',async t=>{const home=await tmp(t),source=path.join(home,'source');await fs.cp(SOURCE,source,{recursive:true,filter:p=>path.basename(p)!=='node_modules'});const r=await install({home,source,mode:'copy'});await writeNew(path.join(source,'new-file.txt'),'canonical new content');const updated=await install({home,source,update:true,forceInPlace:true});assert.equal(updated.in_place,true);assert.ok(await fs.stat(path.join(updated.backup,'SKILL.md')));assert.equal(await fs.readFile(path.join(r.target,'new-file.txt'),'utf8'),'canonical new content');});
