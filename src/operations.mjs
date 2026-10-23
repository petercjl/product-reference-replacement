import fs from 'node:fs/promises';
import path from 'node:path';
import {readJSON,writeNew} from './common.mjs';
import {describeError} from './command.mjs';

// Append-only events survive a killed parent and never overwrite an earlier receipt.
export async function beginOperation(target,kind,initial={}) {
 await fs.mkdir(path.dirname(target),{recursive:true});
 const directory=await fs.mkdtemp(path.join(path.dirname(target),'.product-reference-operation-'));
 const state={target,kind,started_at:new Date().toISOString(),...initial};let sequence=0;
 return {state,async record(fields={}){
  Object.assign(state,fields,{recorded_at:new Date().toISOString()});
  const file=path.join(directory,String(sequence++).padStart(4,'0')+'.json');
  await writeNew(file,JSON.stringify(state,null,2)+'\n');
  return file;
 }};
}
export async function latestOperation(target,{kind}={}) {
 const names=await fs.readdir(path.dirname(target),{withFileTypes:true}).catch(()=>[]);const candidates=[];
 for(const e of names){
  if(!e.isDirectory()||!e.name.startsWith('.product-reference-operation-'))continue;
  const directory=path.join(path.dirname(target),e.name);
  const files=(await fs.readdir(directory)).filter(n=>/^\d{4}\.json$/.test(n)).sort();
  const file=files.at(-1);if(!file)continue;
  const receipt=await readJSON(path.join(directory,file)).catch(()=>null);
  if(receipt?.target===target&&(!kind||receipt.kind===kind))candidates.push({...receipt,operation_receipt:path.join(directory,file)});
 }
 return candidates.sort((a,b)=>b.recorded_at.localeCompare(a.recorded_at)).at(0)??null;
}
export async function operationFailure(op,error,fields={}) {
 const receipt=await op.record({...fields,ok:false,error:describeError(error)});
 error.details={...error.details,stage:op.state.stage,package_changed:op.state.package_changed??false,
  package_acquired:op.state.package_acquired??false,
  package_verified:op.state.package_verified??false,skill_verified:op.state.skill_verified??false,
  backup:op.state.backup??null,pre_replacement_backup:op.state.pre_replacement_backup??null,
  operation_receipt:receipt,recovery:op.state.recovery??'Inspect version and skill status for this target before retrying.'};
 return error;
}
