#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT,check,read} from './common.mjs';
export const commands={
 'board plan':{required:['plan','output-directory'],optional:[],side_effect:'local-write'},
 'board status':{required:['project'],optional:[],side_effect:'read'},
 'board compose':{required:['project','output-directory'],optional:[],side_effect:'local-write'},
 'panel prepare':{required:['project','panel-id','prompt-file'],optional:['reason'],side_effect:'local-write-no-generation'},
 'panel attach':{required:['project','panel-id','task-json'],optional:[],side_effect:'local-write'},
 'panel review':{required:['project','panel-id','review'],optional:[],side_effect:'local-write'},
 'board render':{required:['plan','output-directory'],optional:[],side_effect:'local-write'},
 'board check':{required:['board-directory'],optional:['review'],side_effect:'read'},
 'asset freeze':{required:['image','record','review'],optional:[],side_effect:'local-write'},
 'asset import':{required:['image','record','review'],optional:[],side_effect:'local-write'},
 'job create':{required:['plan','output-directory'],optional:[],side_effect:'local-write'},
 'job status':{required:['job'],optional:[],side_effect:'read'},
 'job collect':{required:['job','output-directory'],optional:[],side_effect:'local-write'},
 'blueprint record':{required:['job','image-id','analysis','record'],optional:[],side_effect:'local-write'},
 'round prepare':{required:['job','image-id','prompt-file'],optional:['blueprint'],side_effect:'local-write-no-generation'},
 'round attach':{required:['job','image-id','task-json'],optional:[],side_effect:'local-write'},
 'round review':{required:['job','image-id','review'],optional:[],side_effect:'local-write'},
 'doctor':{required:[],optional:[],side_effect:'read'},'version':{required:[],optional:[],side_effect:'read'},'capabilities':{required:[],optional:[],side_effect:'read'},'help':{required:[],optional:[],side_effect:'read'}
};
async function doctor(){const checks=[];checks.push({id:'node',ok:Number(process.versions.node.split('.')[0])>=22,value:process.version});try{const sharp=(await import('sharp')).default;const {FONT,label}=await import('./board.mjs');await fs.stat(FONT);const t=await label('产品材质',160,32);checks.push({id:'sharp-and-bundled-cjk-font',ok:t.length>100,version:sharp.versions.sharp});}catch(e){checks.push({id:'sharp-and-bundled-cjk-font',ok:false,error:e.code??e.message,install:'Install the dependencies from the Skill root package.json with npm install.'});}
 try{const {TEMPLATES,denseLayout}=await import('./board-layout.mjs');for(const id of TEMPLATES){const text=await fs.readFile(path.join(ROOT,'references/templates',id+'.md'),'utf8');check(text.startsWith('# ')&&text.length>100,'INVALID_TEMPLATE','Bundled template contract is incomplete.');}check(typeof denseLayout==='function','INVALID_TEMPLATE','Missing layout implementation');checks.push({id:'bundled-asset-templates',ok:true,count:TEMPLATES.length});}catch(e){checks.push({id:'bundled-asset-templates',ok:false,error:e.code??e.message});}
 for(const [id,exe,args] of [['sealseek-media','sealseek-media',['skill','source','--json']],['longslice','longslice',['--version']]]){const r=spawnSync(exe,args,{encoding:'utf8',timeout:30000,windowsHide:true,shell:process.platform==='win32'});let canonicalSkill=null;try{if(id==='sealseek-media'){const j=JSON.parse(r.stdout);check(j.ok&&j.source,'INVALID_DEPENDENCY','Missing canonical Skill');await fs.stat(path.join(j.source,'SKILL.md'));canonicalSkill=j.source;}}catch{}checks.push({id,ok:r.status===0&&(id!=='sealseek-media'||canonicalSkill!==null),canonical_skill:canonicalSkill});}
 return {ok:checks.filter(x=>['node','sharp-and-bundled-cjk-font','bundled-asset-templates'].includes(x.id)).every(x=>x.ok),local_ready:checks.filter(x=>['node','sharp-and-bundled-cjk-font','bundled-asset-templates'].includes(x.id)).every(x=>x.ok),generation_dependency_ready:checks.find(x=>x.id==='sealseek-media').ok,long_image_dependency_ready:checks.find(x=>x.id==='longslice').ok,authentication:'not-checked',checks};}
export async function main(argv){const pos=[],o={};for(let k=0;k<argv.length;k++){const a=argv[k];if(a==='--json')continue;if(a==='--help')return {ok:true,commands};if(a.startsWith('--')){const name=a.slice(2);check(!Object.hasOwn(o,name)&&argv[k+1]&&!argv[k+1].startsWith('--'),'INVALID_INPUT','Duplicate option or missing option value.');o[name]=argv[++k];}else pos.push(a);}
 const key=pos.join(' ')||'help',contract=commands[key];check(contract,'UNKNOWN_COMMAND','Use help to discover supported commands.');for(const k of Object.keys(o))check([...contract.required,...contract.optional].includes(k),'UNKNOWN_OPTION',`Unsupported --${k} for ${key}.`);for(const k of contract.required)check(o[k],'INVALID_INPUT',`Missing --${k}.`);
 if(key==='help')return {ok:true,commands,paid_action:false,boundary:'These scripts never submit generation. The Agent inspects images and invokes the canonical media Skill separately.'};
 if(key==='version')return {ok:true,...await read(path.join(ROOT,'package.json'))};if(key==='capabilities')return {ok:true,...await read(path.join(ROOT,'capabilities.json')),command_contracts:commands};if(key==='doctor')return doctor();
 const args={projectDirectory:o.project,panelId:o['panel-id'],reason:o.reason,planFile:o.plan,outputDirectory:o['output-directory'],boardDirectory:o['board-directory'],image:o.image,record:o.record,reviewFile:o.review,job:o.job,imageId:o['image-id'],promptFile:o['prompt-file'],taskFile:o['task-json'],analysisFile:o.analysis,blueprintFile:o.blueprint};
 const panels={'board plan':'planPanels','board status':'panelStatus','board compose':'composePanels','panel prepare':'preparePanel','panel attach':'attachPanel','panel review':'reviewPanel'};if(panels[key])return (await import('./panel-assets.mjs'))[panels[key]](args);
 if(key==='board render')return (await import('./board.mjs')).renderBoard(args);
 if(key==='board check')return (await import('./board.mjs')).checkBoard(args);
 if(key==='asset freeze'||key==='asset import')return (await import('./board.mjs')).registerAsset({...args,imported:key==='asset import'});
 if(key==='blueprint record')return (await import('./blueprint.mjs')).recordBlueprint(args);
 const api=await import('./jobs.mjs'),fn={'job create':'createJob','job status':'jobStatus','job collect':'collectJob','round prepare':'prepareRound','round attach':'attachTask','round review':'reviewRound'}[key];return api[fn](args);
}
const entryPath=process.argv[1]?await fs.realpath(path.resolve(process.argv[1])).catch(()=>null):null;
const modulePath=await fs.realpath(fileURLToPath(import.meta.url));
if(entryPath&&(process.platform==='win32'?entryPath.toLowerCase()===modulePath.toLowerCase():entryPath===modulePath)){try{const r=await main(process.argv.slice(2));console.log(JSON.stringify(r,null,2));if(r.ok===false)process.exitCode=1;}catch(e){console.log(JSON.stringify({ok:false,error:{code:e.code??'EXECUTION_FAILED',message:e.message}},null,2));process.exitCode=1;}}
