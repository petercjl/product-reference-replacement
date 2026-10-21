import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {PACKAGE,packageInfo} from './common.mjs';

const INTERVAL=24*60*60*1000;
export function updatePolicy(env=process.env){return {enabled:env.PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK!=='0',mode:'notify',channel:'latest',interval_hours:24,timeout_ms:1500,automatic_installation:false};}
export async function automaticUpdateCheck({env=process.env,now=Date.now(),probe}={}) {
 const policy=updatePolicy(env);
 if(!policy.enabled)return {status:'disabled',...policy};
 const base=env.PRODUCT_REFERENCE_REPLACEMENT_STATE_DIR||path.join(os.homedir(),'.local','state','product-reference-replacement');
 const file=path.join(base,'update-check.json'),lock=path.join(base,'update-check.lock');
 const current=(await packageInfo()).version;
 let cached=null,handle=null;
 try{
  try{cached=JSON.parse(await fs.readFile(file,'utf8'));if(cached.package!==PACKAGE||!Number.isFinite(cached.checked_at)||typeof cached.current!=='string')return {status:'unmanaged-cache',current};}catch(e){if(e.code!=='ENOENT')return {status:'unmanaged-cache',current};}
  if(cached&&cached.current===current&&now>=cached.checked_at&&now-cached.checked_at<INTERVAL)return {...cached,status:'cached'};
  await fs.mkdir(base,{recursive:true});
  try{handle=await fs.open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({package:PACKAGE,created_at:now}));}
  catch(e){
   if(e.code==='EEXIST'){
    try{const old=JSON.parse(await fs.readFile(lock,'utf8'));if(old.package===PACKAGE&&Number.isFinite(old.created_at)&&now-old.created_at>60_000){await fs.unlink(lock);handle=await fs.open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({package:PACKAGE,created_at:now}));}else return {status:'concurrent-check',current};}catch{return {status:'concurrent-check',current};}
   }else return {status:'state-unavailable',current};
  }
  let result;
  try{result=await (probe??(()=>spawnSync('npm',['view',PACKAGE,'dist-tags.latest','--json','--fetch-retries=0','--fetch-timeout=1200'],{encoding:'utf8',timeout:1500,windowsHide:true,shell:process.platform==='win32'})))();}catch{result={status:1};}
  let latest=null;try{if(result.status===0){const v=JSON.parse(result.stdout);if(typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v))latest=v;}}catch{}
  const record={package:PACKAGE,current,latest,checked_at:now,status:latest?'checked':'unavailable',update_available:latest?isNewer(latest,current):null,installation:'explicit-only'};
  const stage=path.join(base,`update-check-${randomUUID()}.json`);
  await fs.writeFile(stage,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
  try{await fs.rename(stage,file);}finally{await fs.rm(stage,{force:true});}
  return record;
 }catch{return {status:'unavailable',current};}
 finally{if(handle){await handle.close();await fs.unlink(lock).catch(()=>{});}}
}
function isNewer(a,b){const av=a.split('.').map(Number),bv=b.split(/[.-]/).slice(0,3).map(Number);for(let i=0;i<3;i++){if(av[i]!==bv[i])return av[i]>bv[i];}return b.includes('-');}
