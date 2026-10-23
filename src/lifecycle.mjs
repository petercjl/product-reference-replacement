import {materializeRuntime,verifyRuntime} from './isolated-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCE, ROOT, PACKAGE, exists, fail, hashes, packageInfo, readJSON, writeNew } from './common.mjs';
const MARKER='.product-reference-install.json';
const canonical=h=>Object.fromEntries(Object.entries(h).filter(([k])=>!k.startsWith('agents/')));
const changed=(a,b)=>Object.keys({...a,...b}).filter(k=>a[k]!==b[k]);
export function targetFor(agent='generic',home,targetDirectory){
 if(!/^[a-z][a-z0-9-]{0,63}$/.test(agent))fail('UNKNOWN_TARGET','Use a lowercase Agent identifier.');
 if(home)fail('INVALID_INPUT','Resolve the current host Skill directory and pass --target-directory; home inference is unsupported.');
 if(!targetDirectory)fail('TARGET_REQUIRED','Resolve your own Skill discovery directory and pass --target-directory EXACT_SKILL_DIR.');
 if(!path.isAbsolute(targetDirectory))fail('INVALID_INPUT','target-directory must be an absolute resolved Skill directory.');
 const target=path.resolve(targetDirectory);
 if(target===path.parse(target).root)fail('INVALID_INPUT','Filesystem root is not a Skill directory.');
 return target;
}
async function ownedSource(actual){
 if(!actual)return false;
 const root=path.resolve(actual,'../..');
 return path.resolve(root,'skills/product-reference-replacement')===actual && (await readJSON(path.join(root,'package.json')).catch(()=>null))?.name===PACKAGE;
}
export async function status({agent='generic',home,targetDirectory,source=SOURCE}={}){
 const target=targetFor(agent,home,targetDirectory),st=await exists(target);
 const sourceReal=await fs.realpath(source);
 const targetReal=st&&!st.isSymbolicLink()?await fs.realpath(target):path.join(await fs.realpath(path.dirname(target)).catch(()=>path.dirname(target)),path.basename(target));
 const normalize=p=>process.platform==='win32'?p.toLowerCase():p;
 const a=normalize(targetReal),b=normalize(sourceReal);
 const marker=st&&!st.isSymbolicLink()?await readJSON(path.join(target,MARKER)).catch(()=>null):null;
 const ownedRuntime=marker?.package===PACKAGE&&marker.runtime_entry==='.runtime/bin/product-reference-replacement.mjs'&&normalize(path.join(targetReal,'.runtime/skills/product-reference-replacement'))===b;
 if(!ownedRuntime&&(a===b||b.startsWith(a+path.sep)||a.startsWith(b+path.sep)))fail('INVALID_INPUT','Keep installation targets separate from the canonical Skill source.');
 if(!st)return {ok:true,installed:false,managed:false,target,source,host_registration:'pending'};
 if(st.isSymbolicLink()){
  const actual=await fs.realpath(target).catch(()=>null),managed=actual===sourceReal||await ownedSource(actual);
  const current=actual?canonical(await hashes(actual)):{};
  const knownBaseline=actual&&managed?await readJSON(path.resolve(actual,'../../skill-integrity.json')).catch(()=>null):null;
  const baseline=knownBaseline?canonical(knownBaseline):current;
  const edited=changed(baseline,current),matches=actual===sourceReal&&!changed(current,canonical(await hashes(source))).length;
  return {ok:true,installed:true,managed,mode:'link',target,source,actual,edited,up_to_date:false,needs_migration:true,host_registration:'pending'};
 }
 const m=await readJSON(path.join(target,MARKER)).catch(()=>null);
 if(m?.package!==PACKAGE)return {ok:true,installed:true,managed:false,target,source,host_registration:'pending'};
 const current=canonical(await hashes(target)),expected=canonical(await hashes(source));
 const edited=changed(current,canonical(m.hashes??{}));
 if(m.runtime_hashes){const now=await hashes(path.join(target,'.runtime')).catch(()=>({}));edited.push(...changed(now,m.runtime_hashes).map(k=>'.runtime/'+k));}
 const version=(await packageInfo()).version;const runtimeValid=await verifyRuntime(target,version);
 const receiptCurrent=m.version===version&&m.runtime_entry==='.runtime/bin/product-reference-replacement.mjs'&&m.runtime_version===version;
 return {ok:true,installed:true,managed:true,mode:'copy',target,source,version:m.version,edited,up_to_date:changed(current,expected).length===0&&receiptCurrent&&runtimeValid,runtime_verified:runtimeValid,runtime_entry:path.join(target,'.runtime/bin/product-reference-replacement.mjs'),host_registration:'pending'};
}
export async function install({agent='generic',home,targetDirectory,mode,source=SOURCE,update=false,backupEdits=false,forceInPlace=false}={}){
 const s=await status({agent,home,targetDirectory,source}),target=s.target;
 mode??='copy';
 if(mode!=='copy')fail('ISOLATION_REQUIRED','Skill installation requires a physical copy; link mode is unsupported.');
 if(s.installed&&!s.managed)fail('UNMANAGED_TARGET',`Preserving unrelated installation: ${target}`);
 if(s.edited?.length&&!backupEdits)fail('LOCAL_EDITS','Managed Skill content changed. Preserve it or use skill update --backup-edits.');
 if(s.installed&&!update&&!s.needs_migration)return {...s,changed:false,completion:s.up_to_date?'host-registration-pending':'skill-sync-required'};
 if(s.up_to_date&&!s.edited?.length)return {...s,changed:false,completion:'host-registration-pending'};
 await fs.mkdir(path.dirname(target),{recursive:true});
 let backup=null;
 if(s.installed){
  backup=await fs.mkdtemp(path.join(path.dirname(target),'.product-reference-backup-'));
  await fs.cp(await fs.realpath(target),backup,{recursive:true});
  if(JSON.stringify(await hashes(backup))!==JSON.stringify(await hashes(await fs.realpath(target))))fail('BACKUP_FAILED','Backup hash verification failed.');
 }
 if(backup&&await exists(path.join(target,'.runtime'))&&JSON.stringify(await hashes(path.join(backup,'.runtime')))!==JSON.stringify(await hashes(path.join(target,'.runtime'))))fail('BACKUP_FAILED','Runtime backup hash verification failed.');
 // Host-owned registration metadata lives outside canonical ownership. Retain it on both copy and link migrations.
 const hasMetadata=s.installed&&await exists(path.join(target,'agents'));
 if(hasMetadata)mode='copy';
 const stageRoot=await fs.mkdtemp(path.join(path.dirname(target),'.product-reference-stage-'));
 const stage=path.join(stageRoot,'skill');
 try{
  {
   await fs.cp(source,stage,{recursive:true,filter:p=>path.basename(p)!=='node_modules'});
   if(hasMetadata){await fs.rm(path.join(stage,'agents'),{recursive:true,force:true});await fs.cp(path.join(target,'agents'),path.join(stage,'agents'),{recursive:true});}
   const runtime=await materializeRuntime(stage);
   await writeNew(path.join(stage,MARKER),JSON.stringify({package:PACKAGE,version:(await packageInfo()).version,source_provenance:source,source:path.join(target,'.runtime/skills/product-reference-replacement'),runtime_entry:runtime.entry,runtime_version:runtime.version,runtime_hashes:await hashes(path.join(stage,'.runtime')),hashes:await hashes(stage)},null,2)+'\n');
  }
  let old=null;
  if(s.installed){
   old=path.join(stageRoot,'previous');
   try{if(forceInPlace)throw Object.assign(new Error('locked directory'),{code:'EPERM'});await fs.rename(target,old);}
   catch(e){
    if(!['EPERM','EACCES','EBUSY'].includes(e.code)||s.mode==='link')throw e;
    try{await syncInto(stage,target);}catch(error){await syncInto(backup,target);throw error;}
    return {...await verified({agent,targetDirectory:target,source}),changed:true,backup,in_place:true,completion:'host-registration-pending'};
   }
  }
  try{await fs.rename(stage,target);await verified({agent,targetDirectory:target,source});}
  catch(error){if(old){await fs.rm(target,{recursive:true,force:true});await fs.rename(old,target);}throw error;}
  return {...await verified({agent,targetDirectory:target,source}),changed:true,backup,completion:'host-registration-pending'};
 }finally{await fs.rm(stageRoot,{recursive:true,force:true});}
}
async function verified(args){const s=await status(args);if(!s.managed||!s.up_to_date||s.edited?.length)fail('INSTALL_VERIFY_FAILED','Installed canonical files differ.');return s;}
async function syncInto(from,to){
 for(const entry of await fs.readdir(to))await fs.rm(path.join(to,entry),{recursive:true,force:true});
 await fs.cp(from,to,{recursive:true,force:true});
 if(JSON.stringify(await hashes(from))!==JSON.stringify(await hashes(to)))fail('INSTALL_VERIFY_FAILED','In-place sync hash mismatch.');
}
