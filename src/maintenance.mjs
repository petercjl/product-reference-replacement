import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT,PACKAGE,exists,fail,packageInfo,hashes} from './common.mjs';
import {status,targetFor} from './lifecycle.mjs';
export function execute(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:180000,windowsHide:true,shell:process.platform==='win32'&&cmd==='npm'});if(r.status!==0)fail('COMMAND_FAILED',`${cmd} failed; inspect installation before retrying.`);return r.stdout;}
export async function upgrade(options={},deps={}){
 if(options.mode&&options.mode!=='copy')fail('ISOLATION_REQUIRED','Physical copy installation is required.');
 if(!options.yes)fail('PERMISSION_REQUIRED','update install requires --yes.');
 const target=targetFor(options.agent??'generic',undefined,options.targetDirectory);
 const root=deps.root??ROOT,source=path.join(root,'skills/product-reference-replacement');
 const run=deps.run??execute;
 const s=await status({targetDirectory:target,source});
 if(s.installed&&!s.managed)fail('UNMANAGED_TARGET','Preserving unrelated Skill installation.');
 if(s.edited?.length)fail('LOCAL_EDITS','Preserve managed edits before package replacement.');
 const prefix=path.resolve(root,'../../..');
 if(path.resolve(prefix,'node_modules',...PACKAGE.split('/'))!==path.resolve(root)&&path.resolve(root)!==path.join(target,'.runtime'))fail('DEV_CHECKOUT','Git-owned sources stay unchanged; use an npm-managed installation.');
 const lock=path.join(path.dirname(target),'.product-reference-maintenance-lock');await fs.mkdir(path.dirname(lock),{recursive:true});
 try{await fs.mkdir(lock);}catch(e){if(e.code==='EEXIST')fail('UPDATE_BUSY','An update lock exists; verify the previous operation before retrying.');throw e;}
 let backup=null;
 try{
  let latest;try{latest=JSON.parse(await run('npm',['view',PACKAGE,'dist-tags.latest','--json','--fetch-retries=0','--fetch-timeout=5000']));}catch{fail('REGISTRY_UNAVAILABLE','Installed package and Skill preserved.');}
  if(!/^\d+\.\d+\.\d+$/.test(latest))fail('INVALID_REGISTRY','Expected stable latest version.');
  const current=deps.currentVersion??(await packageInfo()).version;
  const a=current.split('.').map(Number),b=latest.split('.').map(Number);if(a.some((x,i)=>x!==b[i]&&a.slice(0,i).every((y,j)=>y===b[j])&&x>b[i]))fail('REGISTRY_OLDER','Refusing to downgrade the installed package.');
  backup=await fs.mkdtemp(path.join(path.dirname(target),'.product-reference-maintenance-backup-'));
  await fs.cp(root,path.join(backup,'package'),{recursive:true});
  if(JSON.stringify(await hashes(root))!==JSON.stringify(await hashes(path.join(backup,'package'))))fail('BACKUP_FAILED','Package backup verification failed.');
  if(s.installed){await fs.cp(await fs.realpath(target),path.join(backup,'skill'),{recursive:true});if(JSON.stringify(await hashes(await fs.realpath(target)))!==JSON.stringify(await hashes(path.join(backup,'skill'))))fail('BACKUP_FAILED','Skill backup verification failed.');}
  try{
   let entry=path.join(root,'bin/product-reference-replacement.mjs');
   if(current!==latest){const fresh=path.join(backup,'download');await run('npm',['install','--prefix',fresh,PACKAGE+'@'+latest,'--ignore-scripts','--no-audit','--no-fund','--prefer-offline']);entry=path.join(fresh,'node_modules',...PACKAGE.split('/'),'bin/product-reference-replacement.mjs');}
   const version=JSON.parse(await run(process.execPath,[entry,'version','--json']));if(version.version!==latest)fail('VERSION_MISMATCH','Installed entry reports a different version.');
   const sync=JSON.parse(await run(process.execPath,[entry,'skill','update','--target-directory',target,'--mode','copy','--json']));
   if(!sync.ok||!sync.managed||!sync.up_to_date)fail('SKILL_SYNC_FAILED','Selected Skill did not synchronize.');
   const verified=JSON.parse(await run(process.execPath,[entry,'skill','status','--target-directory',target,'--json']));if(!verified.managed||!verified.up_to_date)fail('INSTALL_VERIFY_FAILED','Selected Skill verification failed.');
   return {ok:true,current,installed:latest,entry:path.join(target,'.runtime/bin/product-reference-replacement.mjs'),source:path.join(target,'.runtime/skills/product-reference-replacement'),target,backup,changed:current!==latest||sync.changed,package_verified:true,skill_verified:true,host_registration:'pending',completion:'host-registration-pending',next_action:'Refresh/register this Skill using your own host mechanism and verify discovery before reporting complete.'};
  }catch(error){
   error.message+=` Recoverable package and Skill snapshots: ${backup}. Do not repeat npm installation until state is inspected.`;
   throw error;
  }
 }finally{await fs.rm(lock,{recursive:true,force:true});}
}
