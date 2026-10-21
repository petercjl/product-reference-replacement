#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {ROOT,SOURCE,PACKAGE,packageInfo,readJSON,fail,hashes} from '../src/common.mjs';
import {install,status} from '../src/lifecycle.mjs';
import {automaticUpdateCheck,updatePolicy} from '../src/updates.mjs';
import {main,commands as business} from '../skills/product-reference-replacement/scripts/product-assets.mjs';
const value={type:'string'},boolean={type:'boolean'};
const life={
 'skill source':{options:{json:boolean},effect:'none'},
 'skill status':{options:{agent:value,home:value,'target-directory':value,json:boolean},effect:'none'},
 'skill install':{options:{agent:value,home:value,'target-directory':value,mode:value,'backup-edits':boolean,json:boolean},effect:'local-write'},
 'skill update':{options:{agent:value,home:value,'target-directory':value,mode:value,'backup-edits':boolean,json:boolean},effect:'local-write'},
 'update status':{options:{json:boolean},effect:'none'},
 'update check':{options:{json:boolean},effect:'none'},
 'update install':{options:{json:boolean,yes:boolean},effect:'package-and-skill-update'}
};
export const commandContracts={...Object.fromEntries(Object.entries(business).map(([k,v])=>[k,{options:Object.fromEntries([...v.required,...v.optional].map(x=>['--'+x,{type:'string',required:v.required.includes(x)}]).concat([['--json',boolean]])),sideEffects:v.side_effect==='read'?'none':v.side_effect==='local-write-no-generation'?'local-write':v.side_effect}])),...Object.fromEntries(Object.entries(life).map(([k,v])=>[k,{options:Object.fromEntries(Object.entries(v.options).map(([k,v])=>['--'+k,v])),sideEffects:v.effect}]))};
function run(cmd,args){return spawnSync(cmd,args,{encoding:'utf8',timeout:120000,windowsHide:true,shell:process.platform==='win32'});}
async function upgrade(yes){
 if(!yes)fail('PERMISSION_REQUIRED','update install requires --yes.');
 const p=run('npm',['root','-g']);const globalRoot=path.join(p.stdout.trim(),...PACKAGE.split('/'));
 if(p.status!==0||await fs.realpath(ROOT)!==await fs.realpath(globalRoot).catch(()=>null))fail('DEV_CHECKOUT','Preserve development checkouts; update the global package explicitly.');
 const registry=run('npm',['view',PACKAGE,'dist-tags.latest','--json','--fetch-retries=0','--fetch-timeout=5000']);
 if(registry.status!==0)fail('REGISTRY_UNAVAILABLE','Installed files preserved.');const latest=JSON.parse(registry.stdout);if(!/^\d+\.\d+\.\d+$/.test(latest))fail('INVALID_REGISTRY','Expected stable latest version.');
 const current=(await packageInfo()).version,targets=[];
 for(const agent of ['codex','sealseek']){const s=await status({agent});if(s.managed){if(s.edited?.some(x=>x!=='agents/openai.yaml'))fail('LOCAL_EDITS','Preserve edited managed Skill before update.');const base=path.join(os.homedir(),'.local','state','product-reference-replacement','backups');await fs.mkdir(base,{recursive:true});const backup=await fs.mkdtemp(path.join(base,agent+'-'));await fs.cp(await fs.realpath(s.target),backup,{recursive:true});if(JSON.stringify(await hashes(backup))!==JSON.stringify(await hashes(s.target)))fail('BACKUP_FAILED','Backup verification failed.');targets.push({agent,target:s.target,mode:s.mode,backup,ui:await fs.readFile(path.join(s.target,'agents/openai.yaml'))});}}
 if(current!==latest){const q=run('npm',['install','-g',PACKAGE+'@'+latest]);if(q.status!==0)fail('UPDATE_FAILED','Package update failed; retain backups and inspect installation before retrying.');}
 for(const s of targets){const q=run(process.execPath,[path.join(globalRoot,'bin/product-reference-replacement.mjs'),'skill','update','--agent',s.agent,'--json']);if(q.status!==0)fail('SKILL_SYNC_FAILED','Package present; managed Skill requires recovery from saved backup.');if(s.mode==='link')await fs.writeFile(path.join(s.target,'agents/openai.yaml'),s.ui);}
 return {ok:true,current,installed:latest,targets:targets.map(({ui,...x})=>x),custom_target_action:'Run skill update with each explicit custom target-directory.',changed:current!==latest};
}
try {
 const argv=process.argv.slice(2);
 const pos=argv.filter(x=>!x.startsWith('--'));
 const key=argv.slice(0,2).join(' ');
 let result;
 if(argv.includes('--help')||!argv.length||argv[0]==='help')result={ok:true,commands:commandContracts,source:SOURCE,update_policy:updatePolicy()};
 else if(life[key]){
  const o={};for(let i=2;i<argv.length;i++){const k=argv[i].slice(2),v=life[key].options[k];if(!argv[i].startsWith('--')||!v)fail('UNKNOWN_OPTION',argv[i]);if(Object.hasOwn(o,k))fail('INVALID_INPUT','Duplicate option');if(v.type==='boolean')o[k]=true;else{if(!argv[i+1]||argv[i+1].startsWith('--'))fail('INVALID_INPUT','Missing option value');o[k]=argv[++i];}}
  if(key==='skill source')result={ok:true,name:'product-reference-replacement',source:SOURCE,version:(await packageInfo()).version,installation:{named_agents:['codex','sealseek'],fallback_agent:'generic',generic_target:'Required --target-directory EXACT_SKILL_DIR resolved by calling host; explicit target wins.',custom_updates:'Repeat skill update with the same explicit target-directory after package updates.'}};
  else if(key.startsWith('skill ')){const a={agent:o.agent??'codex',home:o.home,targetDirectory:o['target-directory'],mode:o.mode,update:key==='skill update',backupEdits:o['backup-edits']};result=key==='skill status'?await status(a):await install(a);}
  else if(key==='update status')result={ok:true,policy:updatePolicy()};
  else if(key==='update install')result=await upgrade(o.yes);
  else result={ok:true,...await automaticUpdateCheck({now:Date.now(),env:{...process.env,PRODUCT_REFERENCE_REPLACEMENT_STATE_DIR:process.env.PRODUCT_REFERENCE_REPLACEMENT_STATE_DIR}})};
 } else if(argv[0]==='version'){await main(argv);result={ok:true,...await packageInfo()};}
 else if(argv[0]==='capabilities'){await main(argv);result={ok:true,...await readJSON(path.join(ROOT,'capabilities.json')),skill:await readJSON(path.join(SOURCE,'capabilities.json'))};}
 else {result=await main(argv);if(['board plan','board compose','panel prepare','board render','asset import','asset freeze','job create','round prepare'].includes(key))result.update_check=await automaticUpdateCheck();}
 console.log(JSON.stringify(result,null,2));if(result.ok===false)process.exitCode=1;
}catch(e){console.error(JSON.stringify({ok:false,error:{code:e.code??'INTERNAL_ERROR',message:e.message}},null,2));process.exitCode=1;}
