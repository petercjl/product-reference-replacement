#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {upgrade} from '../src/maintenance.mjs';
import {latestOperation} from '../src/operations.mjs';
import {describeError} from '../src/command.mjs';
import {ROOT,SOURCE,PACKAGE,packageInfo,readJSON,fail,hashes} from '../src/common.mjs';
import {install,status,targetFor} from '../src/lifecycle.mjs';
import {automaticUpdateCheck,updatePolicy} from '../src/updates.mjs';
import {main,commands as business} from '../skills/product-reference-replacement/scripts/product-assets.mjs';
const value={type:'string'},boolean={type:'boolean'};
const life={
 'skill source':{options:{json:boolean,name:value,all:boolean},effect:'none'},
 'skill status':{options:{agent:value,home:value,'target-directory':{...value,required:true},json:boolean},effect:'none'},
 'skill install':{options:{agent:value,home:value,'target-directory':{...value,required:true},mode:value,'backup-edits':boolean,json:boolean},effect:'local-write'},
 'skill update':{options:{agent:value,home:value,'target-directory':{...value,required:true},mode:value,'backup-edits':boolean,json:boolean},effect:'local-write'},
 'update status':{options:{json:boolean,'target-directory':value},effect:'none'},
 'update check':{options:{json:boolean},effect:'none'},
 'update install':{options:{json:boolean,yes:boolean,'target-directory':{...value,required:true},agent:value,mode:value},effect:'package-and-skill-update'}
};
export const commandContracts={...Object.fromEntries(Object.entries(business).map(([k,v])=>[k,{options:Object.fromEntries([...v.required,...v.optional].map(x=>['--'+x,{type:'string',required:v.required.includes(x)}]).concat([['--json',boolean]])),sideEffects:v.side_effect==='read'?'none':v.side_effect==='local-write-no-generation'?'local-write':v.side_effect}])),...Object.fromEntries(Object.entries(life).map(([k,v])=>[k,{options:Object.fromEntries(Object.entries(v.options).map(([k,v])=>['--'+k,v])),sideEffects:v.effect}]))};
try {
 const argv=process.argv.slice(2);
 const pos=argv.filter(x=>!x.startsWith('--'));
 const key=argv.slice(0,2).join(' ');
 let result;
 if(argv.includes('--help')||!argv.length||argv[0]==='help')result={...await readJSON(path.join(ROOT,'capabilities.json')),ok:true,commandContracts,commands:commandContracts,...(commandContracts[key]?{options:commandContracts[key].options}:{}),source:SOURCE,update_policy:updatePolicy()};
 else if(life[key]){
  const o={};for(let i=2;i<argv.length;i++){const k=argv[i].slice(2),v=life[key].options[k];if(!argv[i].startsWith('--')||!v)fail('UNKNOWN_OPTION',argv[i]);if(Object.hasOwn(o,k))fail('INVALID_INPUT','Duplicate option');if(v.type==='boolean')o[k]=true;else{if(!argv[i+1]||argv[i+1].startsWith('--'))fail('INVALID_INPUT','Missing option value');o[k]=argv[++i];}}
  if(key==='skill source'){
   if(o.name&&o.name!=='product-reference-replacement')fail('SKILL_NOT_FOUND','Unknown logical Skill: '+o.name);
   const manifest=await readJSON(path.join(ROOT,'capabilities.json'));
   result={ok:true,name:'product-reference-replacement',package:PACKAGE,source:SOURCE,version:(await packageInfo()).version,installation:manifest.installationLifecycle,maintenanceContract:manifest.maintenanceContract,discoveryContract:manifest.discoveryContract,skills:manifest.skills,commandContracts};
   if(o.all)result={...result,complete:true,sources:[{...result}]};
  }
  else if(key.startsWith('skill ')){const a={agent:o.agent??'generic',home:o.home,targetDirectory:o['target-directory'],mode:o.mode,update:key==='skill update',backupEdits:o['backup-edits']};result=key==='skill status'?await status(a):await install(a);
   if(key==='skill status')result={...result,name:'product-reference-replacement',package:PACKAGE,version:result.version??(await packageInfo()).version,managed:result.managed===true,up_to_date:result.up_to_date===true,edited:result.edited??[],verification:{verified:result.up_to_date===true&&result.runtime_verified===true&&!(result.edited?.length),algorithm:'sha256',scope:'canonical Skill and target-owned runtime'},recovery:{action:result.up_to_date?'host-discovery':result.installed?'inspect-and-sync-selected-target':'install-selected-target',hostDiscoveryAuthority:'host'}};
  }
  else if(key==='update status')result={ok:true,policy:updatePolicy(),...(o['target-directory']?{operation:await latestOperation(targetFor('generic',undefined,o['target-directory']))}:{} )};
  else if(key==='update install')result=await upgrade({yes:o.yes,agent:o.agent,targetDirectory:o['target-directory'],mode:o.mode});
  else result={ok:true,...await automaticUpdateCheck({now:Date.now(),env:{...process.env,PRODUCT_REFERENCE_REPLACEMENT_STATE_DIR:process.env.PRODUCT_REFERENCE_REPLACEMENT_STATE_DIR}})};
 } else if(argv[0]==='version'){await main(argv);result={ok:true,...await packageInfo()};}
 else if(argv[0]==='capabilities'){await main(argv);result={ok:true,...await readJSON(path.join(ROOT,'capabilities.json')),skill:await readJSON(path.join(SOURCE,'capabilities.json'))};}
 else {result=await main(argv);if(['reference prepare','board plan','board compose','panel prepare','board render','asset import','asset freeze','job create','round prepare'].includes(key))result.update_check=await automaticUpdateCheck();}
 console.log(JSON.stringify(result,null,2));if(result.ok===false)process.exitCode=1;
}catch(e){console.error(JSON.stringify({ok:false,error:describeError(e)},null,2));process.exitCode=1;}
