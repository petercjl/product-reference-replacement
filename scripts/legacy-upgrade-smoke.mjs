import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const NAME='@petercjl/product-reference-replacement';
const current=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
assert.notEqual(current.version,'0.3.0');
const work=await fs.mkdtemp(path.join(os.tmpdir(),'legacy-real-cli-'));
const env={...process.env,PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK:'0',npm_config_dry_run:'false',npm_config_json:'false',npm_config_ignore_scripts:'true'};
function run(cmd,args,extra={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(cmd,args,{cwd:root,env:{...env,...extra},windowsHide:true,shell:process.platform==='win32'&&cmd==='npm'});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const timer=setTimeout(()=>{child.kill();reject(Error('CLI timeout: '+cmd+' '+args.slice(0,3).join(' ')));},240000);
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
 });
}
function ok(result){assert.equal(result.code,0,result.stderr||result.stdout);return JSON.parse(result.stdout);}
const results=[];let server;
try{
 const oldPack=ok(await run('npm',['pack',NAME+'@0.3.0','--pack-destination',work,'--json','--prefer-offline','--ignore-scripts']));
 const candidatePack=process.env.LEGACY_UPGRADE_CANDIDATE_TARBALL?null:ok(await run('npm',['pack','--pack-destination',work,'--json']));
 const old=await fs.readFile(path.join(work,oldPack[0].filename));
 const candidate=await fs.readFile(process.env.LEGACY_UPGRADE_CANDIDATE_TARBALL??path.join(work,candidatePack[0].filename));
 let candidateRequests=0,onCandidate=null;
 const digest=b=>({integrity:'sha512-'+createHash('sha512').update(b).digest('base64'),shasum:createHash('sha1').update(b).digest('hex')});
 server=http.createServer(async(req,res)=>{
  try{
   const u=decodeURIComponent(req.url.split('?')[0]);
   if(u==='/candidate.tgz'||u==='/old.tgz'){
    const data=u==='/candidate.tgz'?candidate:old;
    if(u==='/candidate.tgz'){candidateRequests++;if(onCandidate){const fn=onCandidate;onCandidate=null;await fn();}}
    res.writeHead(200,{'content-type':'application/octet-stream','content-length':data.length});res.end(data);return;
   }
   if(u==='/'+NAME||u.startsWith('/'+NAME+'/')){
    if(onCandidate){const fn=onCandidate;onCandidate=null;await fn();}
    const base='http://127.0.0.1:'+server.address().port;
    const version=(v,b,name)=>({...current,version:v,dist:{...digest(b),tarball:base+'/'+name+'.tgz'}});
    const metadata={name:NAME,'dist-tags':{latest:current.version},versions:{'0.3.0':version('0.3.0',old,'old'),[current.version]:version(current.version,candidate,'candidate')}};
    const suffix=u.slice(('/'+NAME).length+1);res.setHeader('content-type','application/json');
    res.end(JSON.stringify(metadata.versions[suffix]??metadata));return;
   }
   // Public dependency metadata only. No incoming auth headers are forwarded.
   const upstream=await fetch('https://registry.npmjs.org'+req.url);
   res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'application/json'});
   res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(String(error.message));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const registry='http://127.0.0.1:'+server.address().port;
 async function fixture(name,mode){
  const d=path.join(work,name),prefix=path.join(d,'global');await fs.mkdir(d);
  const localEnv={npm_config_prefix:prefix,npm_config_registry:registry};
  ok(await run('npm',['install','--global','--prefix',prefix,path.join(work,oldPack[0].filename),'--no-audit','--no-fund','--prefer-offline','--json'],localEnv));
  const globalRoot=(await run('npm',['root','--global'],localEnv)).stdout.trim();
  const packageRoot=path.join(globalRoot,...NAME.split('/')),entry=path.join(packageRoot,'bin/product-reference-replacement.mjs');
  const target=path.join(d,'host-skill');const cmd=(args)=>run(process.execPath,[entry,...args],localEnv);
  ok(await cmd(['skill','install','--target-directory',target,'--mode',mode,'--json']));
  const original=await fs.readFile(path.join(target,'SKILL.md'),'utf8');
  const upgrade=()=>cmd(['update','install','--target-directory',target,'--yes','--json']);
  return {d,prefix,entry,target,original,cmd,upgrade,localEnv,packageRoot};
 }
 for(const mode of ['link','copy']){
  const f=await fixture('old-'+mode,mode),r=ok(await f.upgrade());assert.equal(r.installed,current.version);
  assert.equal((await fs.lstat(f.target)).isSymbolicLink(),false);
  const status=ok(await f.cmd(['skill','status','--target-directory',f.target,'--json']));assert.equal(status.up_to_date,true);
  const journal=ok(await f.cmd(['update','status','--target-directory',f.target,'--json'])).operation;
  assert.equal(journal.migration.from,mode);assert.equal(journal.migration.to,'copy');assert.equal(journal.migration.performed,mode==='link');
  if(mode==='link'){
   assert.equal(journal.pre_replacement_backup.version,'0.3.0');
   assert.equal(await fs.readFile(path.join(journal.backup,'SKILL.md'),'utf8'),f.original);
   assert.equal(await fs.readFile(path.join(journal.pre_replacement_backup.skill,'SKILL.md'),'utf8'),f.original);
  }
  assert.equal(JSON.parse(await fs.readFile(path.join(r.backup,'package/package.json'),'utf8')).version,'0.3.0');
  const n=candidateRequests;
  const same=ok(await f.cmd(['update','install','--target-directory',f.target,'--yes','--json']));
  assert.equal(same.changed,false);assert.equal(same.package_changed,false);assert.equal(same.skill_changed,false);assert.equal(candidateRequests,n);
  results.push({case:'actual-0.3.0-'+mode+'-to-candidate',ok:true,same_version:'verified-no-op',true_old_backup:true});
 }
 const protectedCase=await fixture('local-edits','copy');
 await fs.appendFile(path.join(protectedCase.target,'SKILL.md'),'\nlocal user change');
 const before=candidateRequests,blocked=await protectedCase.upgrade();assert.notEqual(blocked.code,0);assert.equal(JSON.parse(blocked.stderr).error.code,'LOCAL_EDITS');assert.equal(candidateRequests,before);
 assert.equal(JSON.parse(await fs.readFile(path.join(protectedCase.packageRoot,'package.json'),'utf8')).version,'0.3.0');
 results.push({case:'old-updater-preflight-local-edits',ok:true,no_package_replacement:true});
 const failed=await fixture('sync-failure','copy');
 onCandidate=()=>fs.appendFile(path.join(failed.target,'SKILL.md'),'\nconcurrent user edit');
 const outcome=await failed.upgrade();assert.notEqual(outcome.code,0);
 assert.equal(JSON.parse(outcome.stderr).error.code,'COMMAND_FAILED'); // Immutable old parent discards stderr.
 assert.equal(JSON.parse(await fs.readFile(path.join(failed.packageRoot,'package.json'),'utf8')).version,current.version);
 const receipt=ok(await failed.cmd(['update','status','--target-directory',failed.target,'--json'])).operation;
 assert.equal(receipt.ok,false);assert.equal(receipt.error.code,'LOCAL_EDITS');assert.equal(receipt.stage,'skill-preflight');
 assert.equal(receipt.package_changed,true);assert.equal(receipt.skill_verified,false);assert.equal(receipt.pre_replacement_backup.version,'0.3.0');
 assert.equal(JSON.parse(await fs.readFile(path.join(failed.target,'.product-reference-install.json'),'utf8')).version,'0.3.0');
 const fetches=candidateRequests;
 // Resolve the test's deliberate concurrent edit explicitly, preserving the failed state.
 await fs.copyFile(path.join(failed.target,'SKILL.md'),path.join(failed.d,'preserved-user-edit.md'),fs.constants.COPYFILE_EXCL);
 await fs.writeFile(path.join(failed.target,'SKILL.md'),failed.original);
 ok(await failed.cmd(['skill','update','--target-directory',failed.target,'--mode','copy','--json']));
 assert.equal(candidateRequests,fetches);
 assert.equal(ok(await failed.cmd(['skill','status','--target-directory',failed.target,'--json'])).up_to_date,true);
 results.push({case:'old-updater-sync-failure-and-status-based-recovery',ok:true,package_upgraded_before_failure:true,repeated_package_install:false,local_edit_preserved:true});
 console.log(JSON.stringify({ok:true,old_version:'0.3.0',candidate_version:current.version,uses_real_old_cli:true,uses_real_npm:true,registry:'isolated HTTP fixture; candidate unpublished',results}));
}finally{
 if(server)await new Promise(r=>server.close(r));
 await fs.rm(work,{recursive:true,force:true});
}
