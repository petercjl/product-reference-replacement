#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ROOT,check,read} from './common.mjs';
export const commands={
 'board render':{required:['plan','output-directory'],optional:[],side_effect:'local-write'},
 'asset freeze':{required:['image','record','review'],optional:[],side_effect:'local-write'},
 'asset import':{required:['image','record','review'],optional:[],side_effect:'local-write'},
 'job create':{required:['plan','output-directory'],optional:[],side_effect:'local-write'},
 'job status':{required:['job'],optional:[],side_effect:'read'},
 'job collect':{required:['job','output-directory'],optional:[],side_effect:'local-write'},
 'round prepare':{required:['job','image-id','prompt-file'],optional:[],side_effect:'local-write-no-generation'},
 'round attach':{required:['job','image-id','task-json'],optional:[],side_effect:'local-write'},
 'round review':{required:['job','image-id','review'],optional:[],side_effect:'local-write'},
 'doctor':{required:[],optional:[],side_effect:'read'},'version':{required:[],optional:[],side_effect:'read'},'capabilities':{required:[],optional:[],side_effect:'read'},'help':{required:[],optional:[],side_effect:'read'}
};
async function doctor(){const checks=[];checks.push({id:'node',ok:Number(process.versions.node.split('.')[0])>=22,value:process.version});try{const sharp=(await import('sharp')).default;const {FONT,label}=await import('./board.mjs');await fs.stat(FONT);const t=await label('产品材质',160,32);checks.push({id:'sharp-and-bundled-cjk-font',ok:t.length>100,version:sharp.versions.sharp});}catch(e){checks.push({id:'sharp-and-bundled-cjk-font',ok:false,error:e.code??e.message,install:'Install the dependencies from the Skill root package.json with npm install.'});}
 for(const [id,exe,args] of [['sealseek-media','sealseek-media',['skill','source','--json']],['longslice','longslice',['--version']]]){const r=spawnSync(exe,args,{encoding:'utf8',timeout:30000,windowsHide:true,shell:process.platform==='win32'});let canonicalSkill=null;try{if(id==='sealseek-media'){const j=JSON.parse(r.stdout);check(j.ok&&j.source,'INVALID_DEPENDENCY','Missing canonical Skill');await fs.stat(path.join(j.source,'SKILL.md'));canonicalSkill=j.source;}}catch{}checks.push({id,ok:r.status===0&&(id!=='sealseek-media'||canonicalSkill!==null),canonical_skill:canonicalSkill});}
 return {ok:checks.filter(x=>['node','sharp-and-bundled-cjk-font'].includes(x.id)).every(x=>x.ok),local_ready:checks.filter(x=>['node','sharp-and-bundled-cjk-font'].includes(x.id)).every(x=>x.ok),generation_dependency_ready:checks.find(x=>x.id==='sealseek-media').ok,long_image_dependency_ready:checks.find(x=>x.id==='longslice').ok,authentication:'not-checked',checks};}
export async function main(argv){const pos=[],o={};for(let k=0;k<argv.length;k++){const a=argv[k];if(a==='--json')continue;if(a==='--help')return {ok:true,commands};if(a.startsWith('--')){const name=a.slice(2);check(!Object.hasOwn(o,name)&&argv[k+1]&&!argv[k+1].startsWith('--'),'INVALID_INPUT','Duplicate option or missing option value.');o[name]=argv[++k];}else pos.push(a);}
 const key=pos.join(' ')||'help',contract=commands[key];check(contract,'UNKNOWN_COMMAND','Use help to discover supported commands.');for(const k of Object.keys(o))check([...contract.required,...contract.optional].includes(k),'UNKNOWN_OPTION',`Unsupported --${k} for ${key}.`);for(const k of contract.required)check(o[k],'INVALID_INPUT',`Missing --${k}.`);
 if(key==='help')return {ok:true,commands,paid_action:false,boundary:'These scripts never submit generation. The Agent inspects images and invokes the canonical media Skill separately.'};
 if(key==='version')return {ok:true,...await read(path.join(ROOT,'package.json'))};if(key==='capabilities')return {ok:true,...await read(path.join(ROOT,'capabilities.json')),command_contracts:commands};if(key==='doctor')return doctor();
 const args={planFile:o.plan,outputDirectory:o['output-directory'],image:o.image,record:o.record,reviewFile:o.review,job:o.job,imageId:o['image-id'],promptFile:o['prompt-file'],taskFile:o['task-json']};
 if(key==='board render')return (await import('./board.mjs')).renderBoard(args);
 if(key==='asset freeze'||key==='asset import')return (await import('./board.mjs')).registerAsset({...args,imported:key==='asset import'});
 const api=await import('./jobs.mjs'),fn={'job create':'createJob','job status':'jobStatus','job collect':'collectJob','round prepare':'prepareRound','round attach':'attachTask','round review':'reviewRound'}[key];return api[fn](args);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await fs.realpath(path.resolve(process.argv[1]))).href){try{const r=await main(process.argv.slice(2));console.log(JSON.stringify(r,null,2));if(r.ok===false)process.exitCode=1;}catch(e){console.log(JSON.stringify({ok:false,error:{code:e.code??'EXECUTION_FAILED',message:e.message}},null,2));process.exitCode=1;}}
