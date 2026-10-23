import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,PACKAGE,fail,hashes,readJSON} from './common.mjs';
import {status,targetFor} from './lifecycle.mjs';
import {beginOperation,latestOperation,operationFailure} from './operations.mjs';
import {execute} from './command.mjs';
export {execute} from './command.mjs';

export async function upgrade(options={},deps={}){
 if(options.mode&&!['copy','link'].includes(options.mode))fail('INVALID_INPUT','mode must be copy or link.');
 if(!options.yes)fail('PERMISSION_REQUIRED','update install requires --yes.');
 const target=targetFor(options.agent??'generic',undefined,options.targetDirectory);
 const root=deps.root??ROOT,source=path.join(root,'skills/product-reference-replacement');
 const run=deps.run??execute;
 const s=await status({targetDirectory:target,source});
 if(s.installed&&!s.managed)fail('UNMANAGED_TARGET','Preserving unrelated Skill installation.');
 if(s.edited?.length)fail('LOCAL_EDITS','Preserve managed edits before package replacement.');
 const prefix=path.resolve(root,'../../..');
 if(path.resolve(prefix,'node_modules',...PACKAGE.split('/'))!==path.resolve(root)&&path.resolve(root)!==path.join(target,'.runtime'))fail('DEV_CHECKOUT','Git-owned sources stay unchanged; use an npm-managed installation.');
 const previous=await latestOperation(target,{kind:'package-update'});
 const lock=path.join(path.dirname(target),'.product-reference-maintenance-lock');await fs.mkdir(path.dirname(lock),{recursive:true});
 try{await fs.mkdir(lock);}catch(e){if(e.code==='EEXIST')fail('UPDATE_BUSY','An update lock exists; inspect update status and the previous process before retrying.');throw e;}
 let op;
 try{
  const current=deps.currentVersion??(await readJSON(path.join(root,'package.json'))).version;
  op=await beginOperation(target,'package-update',{stage:'registry-check',current,package_changed:false,package_acquired:false,skill_changed:false,skill_verified:false});
  await op.record();
  let latest;try{latest=JSON.parse(await run('npm',['view',PACKAGE,'dist-tags.latest','--json','--fetch-retries=0','--fetch-timeout=5000']));}catch(error){error.code='REGISTRY_UNAVAILABLE';throw error;}
  if(!/^\d+\.\d+\.\d+$/.test(latest))fail('INVALID_REGISTRY','Expected stable latest version.');
  const a=current.split('.').map(Number),b=latest.split('.').map(Number);if(a.some((x,i)=>x!==b[i]&&a.slice(0,i).every((y,j)=>y===b[j])&&x>b[i]))fail('REGISTRY_OLDER','Refusing to downgrade the installed package.');
  op.state.requested=latest;
  if(current===latest&&s.up_to_date){
   const result={ok:true,current,installed:latest,target,changed:false,package_changed:false,skill_changed:false,package_verified:true,skill_verified:true,backup:null,host_registration:'pending',completion:'host-registration-pending'};
   return {...result,operation_receipt:await op.record({...result,stage:'complete'})};
  }
  const backup=await fs.mkdtemp(path.join(path.dirname(target),'.product-reference-maintenance-backup-'));
  await op.record({stage:'backup',backup});
  await fs.cp(root,path.join(backup,'package'),{recursive:true});
  if(JSON.stringify(await hashes(root))!==JSON.stringify(await hashes(path.join(backup,'package'))))fail('BACKUP_FAILED','Package backup verification failed.');
  if(s.installed){await fs.cp(await fs.realpath(target),path.join(backup,'skill'),{recursive:true});if(JSON.stringify(await hashes(await fs.realpath(target)))!==JSON.stringify(await hashes(path.join(backup,'skill'))))fail('BACKUP_FAILED','Skill backup verification failed.');}
  let entry=path.join(root,'bin/product-reference-replacement.mjs'),reused=false;
  if(current!==latest){
   // Inspect an interrupted download before requesting another npm installation.
   const candidate=previous?.candidate_root;
   const candidateBackup=previous?.candidate_backup??previous?.backup;
   const safe=candidate&&candidateBackup&&path.resolve(candidate)===path.join(path.resolve(candidateBackup),'download/node_modules',...PACKAGE.split('/'));
   const observed=safe?await readJSON(path.join(candidate,'package.json')).catch(()=>null):null;
   if(observed?.name===PACKAGE&&observed.version===latest){
    const probe=path.join(candidate,'bin/product-reference-replacement.mjs');
    try{if(JSON.parse(await run(process.execPath,[probe,'version','--json'])).version===latest){entry=probe;reused=true;}}catch{}
   }
   if(!reused){
    const fresh=path.join(backup,'download'),candidateRoot=path.join(fresh,'node_modules',...PACKAGE.split('/'));
    await op.record({stage:'package-acquire',candidate_root:candidateRoot,candidate_backup:backup});
    await run('npm',['install','--prefix',fresh,PACKAGE+'@'+latest,'--ignore-scripts','--no-audit','--no-fund','--prefer-offline']);
    entry=path.join(candidateRoot,'bin/product-reference-replacement.mjs');
   }else await op.record({stage:'package-recovery-inspect',candidate_root:candidate,candidate_backup:candidateBackup,reused_candidate:true});
  }
  await op.record({stage:'package-verify'});
  const version=JSON.parse(await run(process.execPath,[entry,'version','--json']));if(version.version!==latest)fail('VERSION_MISMATCH','Installed entry reports a different version.');
  await op.record({stage:'skill-sync',package_acquired:current!==latest,package_verified:true});
  const sync=JSON.parse(await run(process.execPath,[entry,'skill','update','--target-directory',target,'--mode','copy','--json']));
  if(!sync.ok||!sync.managed||!sync.up_to_date)fail('SKILL_SYNC_FAILED','Selected Skill did not synchronize.');
  await op.record({stage:'skill-verify',skill_changed:sync.changed,package_changed:current!==latest,migration:sync.migration});
  const verified=JSON.parse(await run(process.execPath,[entry,'skill','status','--target-directory',target,'--json']));if(!verified.managed||!verified.up_to_date)fail('INSTALL_VERIFY_FAILED','Selected Skill verification failed.');
  const result={ok:true,current,installed:latest,entry:path.join(target,'.runtime/bin/product-reference-replacement.mjs'),source:path.join(target,'.runtime/skills/product-reference-replacement'),target,backup,changed:current!==latest||sync.changed,package_changed:current!==latest,skill_changed:sync.changed,package_verified:true,skill_verified:true,reused_candidate:reused,migration:sync.migration,host_registration:'pending',completion:'host-registration-pending',next_action:'Refresh/register this Skill using your own host mechanism and verify discovery before reporting complete.'};
  return {...result,operation_receipt:await op.record({...result,stage:'complete'})};
 }catch(error){
  if(!op)throw error;
  const observed=op.state.candidate_root?await readJSON(path.join(op.state.candidate_root,'package.json')).catch(()=>null):null;
  const owned=await readJSON(path.join(target,'.runtime/package.json')).catch(()=>null);
  const skill=await status({targetDirectory:target,source}).catch(()=>null);
  const observedVersion=owned?.version??s.version??op.state.current;
  op.state.package_acquired=observed?.name===PACKAGE&&observed.version===op.state.requested;
  op.state.package_changed=observedVersion!==op.state.current;
  op.state.skill_verified=Boolean(skill?.up_to_date);
  op.state.recovery='Inspect update status --target-directory and the recorded candidate version. Resume skill update from a verified candidate when the package is acquired; preserve backups and local edits. Do not repeat npm installation solely because the parent failed.';
  error.message+=` Recoverable package and Skill snapshots: ${op.state.backup??'not created'}.`;
  throw await operationFailure(op,error,{observed_runtime_version:observedVersion,observed_candidate_version:observed?.version??null});
 }finally{await fs.rm(lock,{recursive:true,force:true});}
}
