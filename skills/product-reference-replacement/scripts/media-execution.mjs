import path from 'node:path';
import {check,writeNew} from './common.mjs';

export const executionRecordPath=directory=>path.resolve(directory,'execution.json');

// Persist the same executable contract returned to callers. No upload, process
// execution, model selection or task recovery happens in this producer.
export async function persistMediaExecution({directory,args,context={}}){
 check(Array.isArray(args)&&args.length>0&&args.every(x=>typeof x==='string'),'INVALID_EXECUTION_ARGS','Expected the complete ordered base argument array.');
 const receipt={...context,schema_version:'media-execution-1',ok:true,request_only:true,paid_action:false,round_directory:path.resolve(directory),request_record:path.resolve(directory,'request.json'),execution_record:executionRecordPath(directory),command:'sealseek-media',base_args:[...args],base_args_semantics:'Operation, input and output arguments only. Choose dry_run_args or submit_args unchanged for execution; neither JSON nor execution-mode flags are assumed in base_args.',dry_run_args:[...args,'--dry-run','--json'],submit_args:[...args,'--via','sealseek','--submit','--json']};
 await writeNew(receipt.execution_record,receipt);
 return receipt;
}
