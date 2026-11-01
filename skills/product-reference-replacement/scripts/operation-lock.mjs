import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {check,read,writeNew,exists} from './common.mjs';

function alive(pid){try{process.kill(pid,0);return true;}catch(e){return e.code==='ESRCH'?false:null;}}
export async function operationStatus({operationDirectory}){
 const file=path.resolve(operationDirectory,'.operation-lock'),stat=await exists(file);
 if(!stat)return {ok:true,locked:false,lock_file:file,paid_action:false};
 check(stat.isFile()&&!stat.isSymbolicLink(),'UNVERIFIED_LOCK','Preserve the unexpected lock path.');
 let owner;try{owner=await read(file);}catch{return {ok:true,locked:true,verified:false,lock_file:file,paid_action:false,recovery:'Preserve the unreadable lock and inspect its owner; do not remove it automatically.'};}
 const verified=owner.kind==='product-reference-operation-lock-1'&&owner.host===os.hostname()&&typeof owner.id==='string'&&Number.isInteger(owner.pid)&&owner.pid>0;
 return {ok:true,locked:true,verified,lock_file:file,owner,owner_alive:verified?alive(owner.pid):null,paid_action:false,recovery:verified?'Only a confirmed exited owner and this exact lock ID permit operation unlock; then inspect saved submissions and follow original tasks.':'Legacy or foreign lock ownership requires explicit inspection; automatic removal is refused.'};
}

export async function unlockOperation({operationDirectory,lockId}){
 const directory=path.resolve(operationDirectory),guard=path.join(directory,'.operation-recovery-lock');
 let handle;try{handle=await fs.open(guard,'wx');}catch(e){if(e.code==='EEXIST')check(false,'LOCK_RECOVERY_BUSY','Another recovery owns this directory; inspect it before proceeding.');throw e;}
 try{
  const status=await operationStatus({operationDirectory:directory});
  check(status.locked&&status.verified,'UNVERIFIED_LOCK','Unlock only a verified lock from this application on this host.');
  check(lockId===status.owner.id,'LOCK_ID_MISMATCH','Read operation status and provide its exact lock ID.');
  check(status.owner_alive===false,'LOCK_OWNER_ACTIVE','A live or unknown owner keeps its lock; do not interrupt its task.');
  const bytes=await fs.readFile(status.lock_file),backup=path.join(directory,'.operation-lock-recovered-'+randomUUID()+'.json');
  await writeNew(backup,bytes);check((await fs.readFile(backup)).equals(bytes),'BACKUP_FAILED','Preserve the original lock until its recovery backup is verified.');
  const current=await read(status.lock_file);check(current.id===lockId,'LOCK_ID_MISMATCH','The lock changed during recovery.');
  await fs.unlink(status.lock_file);
  return {ok:true,cleared:true,backup,paid_action:false,next_action:'Inspect saved intent/process/task records, then follow original IDs; clearing a dead lock does not authorize or repeat a generation.'};
 }finally{await handle.close();await fs.unlink(guard);}
}
