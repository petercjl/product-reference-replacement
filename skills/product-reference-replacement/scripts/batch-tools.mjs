import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {check,read,writeNew,knownFields,safeId,resolve,preflightOutputDirectory,freshDir} from './common.mjs';

export const errorResult=e=>({code:e.code??'EXECUTION_FAILED',message:e.message,...(e.details?{details:e.details}:{})});
export const processFailure=r=>({code:r.system_error?'PROCESS_START_FAILED':r.timed_out?'PROCESS_TIMEOUT':r.overflow?'PROCESS_OUTPUT_LIMIT':r.protocol_error??r.data?.error?.code??r.data?.code??(r.exit_code===0?'CHILD_REJECTED':'CHILD_PROCESS_FAILED'),exit_code:r.exit_code,signal:r.signal,timed_out:r.timed_out,...(r.data?.error?{child_error:r.data.error}:{})});
export function limit(value=4){const n=Number(value);check(Number.isInteger(n)&&n>=1&&n<=4,'INVALID_CONCURRENCY','Use an integer concurrency from 1 through 4.');return n;}
export async function bounded(items,concurrency,fn){
 const results=new Array(items.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(limit(concurrency),items.length)},async()=>{while(cursor<items.length){const index=cursor++;try{results[index]=await fn(items[index],index);}catch(error){results[index]={...(items[index]?.id?{id:items[index].id}:{}),ok:false,error:errorResult(error)};}}}));
 return results;
}
export async function batchPlan(planFile,fields){
 const p=await read(planFile);knownFields(p,['items']);check(Array.isArray(p.items)&&p.items.length>0&&p.items.length<=100,'INVALID_BATCH','Use 1..100 explicitly selected items.');
 const ids=new Set();for(const item of p.items){knownFields(item,['id',...fields]);check(safeId(item.id)&&!ids.has(item.id),'INVALID_BATCH','Batch IDs must be unique safe IDs.');ids.add(item.id);}
 return {items:p.items,base:path.dirname(path.resolve(planFile))};
}
export async function reportBatch({planFile,outputDirectory,concurrency=4,fields,operation}){
 await preflightOutputDirectory(outputDirectory);const {items,base}=await batchPlan(planFile,fields);limit(concurrency);await freshDir(outputDirectory);
 const started=Date.now();const results=await bounded(items,concurrency,async item=>{const at=Date.now();try{return {id:item.id,...await operation(item,base,resolve(outputDirectory,item.id)),local_elapsed_ms:Date.now()-at};}catch(e){return {id:item.id,ok:false,error:errorResult(e),local_elapsed_ms:Date.now()-at};}});
 const receipt={schema_version:'local-batch-1',ok:results.every(r=>r.ok===true),paid_action:false,concurrency:limit(concurrency),local_elapsed_ms:Date.now()-started,items:results,report:path.resolve(outputDirectory,'batch.json')};
 if(results.some(i=>Object.hasOwn(i,'ready')||Object.hasOwn(i,'accepted')))receipt.ready=results.every(i=>i.ok===true&&(i.ready===true||i.accepted===true));
 await writeNew(receipt.report,receipt);return receipt;
}

// Exact argv, one JSON result, and independent process status. Never a shell or
// a search through mixed stdout for something that resembles a successful JSON.
export async function runCLI(entry,args,{timeout=55000,env=process.env}={}){
 check(typeof entry==='string'&&path.isAbsolute(entry)&&entry.endsWith('.mjs'),'INVALID_MEDIA_ENTRY','Resolve the current media Skill launcher to an absolute .mjs entry.');await fs.access(entry);
 check(Array.isArray(args)&&args.every(x=>typeof x==='string'),'INVALID_EXECUTION_ARGS','Pass the original JSON string array.');
 return new Promise(resolveResult=>{
  const started=Date.now();let settled=false;
  let stdout='',stderr='',overflow=false,timedOut=false;
  const child=spawn(process.execPath,[entry,...args],{shell:false,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>4_000_000){overflow=true;child.kill();}});
  child.stderr.on('data',b=>{stderr=(stderr+b).slice(-16000);});
  const done=(exit_code,signal,system_error)=>{
   if(settled)return;settled=true;clearTimeout(timer);let data=null,protocol_error=null;
   try{data=JSON.parse(stdout);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Expected one JSON object');}catch{protocol_error='INVALID_JSON_OUTPUT';}
   const ok=exit_code===0&&!timedOut&&!overflow&&!protocol_error&&data.ok===true;
   resolveResult({ok,exit_code,signal,system_error,timed_out:timedOut,overflow,protocol_error,stdout,stderr,data,timing:{started_at:new Date(started).toISOString(),finished_at:new Date().toISOString(),elapsed_ms:Date.now()-started,scope:'Local CLI process wall time; not provider model compute time.'}});
  };
  child.once('error',e=>done(null,null,e.code??e.message));child.once('close',(code,signal)=>done(code,signal,null));
 });
}

export async function discoverStage({mediaEntry,outputDirectory,concurrency=4}){
 await preflightOutputDirectory(outputDirectory);limit(concurrency);await freshDir(outputDirectory);
 const commands=[{id:'media-version',args:['version','--json']},{id:'media-capabilities',args:['capabilities','--live','--json']},{id:'selected-model',args:['models','show','nano-banana-pro','--live','--json']}];
 const items=await bounded(commands,concurrency,async c=>{const result=await runCLI(mediaEntry,c.args);const record=path.resolve(outputDirectory,c.id+'.json');await writeNew(record,{command_entry:mediaEntry,args:c.args,...result});return {id:c.id,ok:result.ok,record,...(!result.ok?{error:processFailure(result)}:{result:result.data})};});
 const receipt={ok:items.every(i=>i.ok),paid_action:false,stage:'A1-A2',items,report:path.resolve(outputDirectory,'discovery.json'),reuse:'Reuse these exact receipts while entry, version, account, model and inputs remain unchanged; failed items remain failures.'};await writeNew(receipt.report,receipt);return receipt;
}
