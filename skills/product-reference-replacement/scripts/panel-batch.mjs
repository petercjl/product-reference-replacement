import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {check,read,writeNew,identity,unchanged,resolve,exists,locked,preflightOutputDirectory,freshDir,knownFields} from './common.mjs';
import {preparePanelGroup,panelStatus,attachPanel,reviewPanel} from './panel-assets.mjs';
import {bounded,batchPlan,runCLI,errorResult,reportBatch,processFailure} from './batch-tools.mjs';
import {fillReview} from './reference-batch.mjs';
import {unchangedPanelReference} from './reference-images.mjs';

export async function reviewPanelBatch({projectDirectory,planFile,outputDirectory}){
 return reportBatch({planFile,outputDirectory,concurrency:1,fields:['panel_id','observations'],operation:async(item,base,directory)=>{
  const status=await panelStatus({projectDirectory}),panel=status.panels.find(p=>p.id===item.panel_id);
  check(panel?.status==='awaiting-review'&&panel.review_template,'PANEL_NOT_READY','Review only the current unreviewed original; retain completed reviews and existing tasks.');
  await fs.mkdir(directory);const reviewFile=path.join(directory,'inputs','review.json'),templateFile=panel.review_template_file??path.join(directory,'legacy-review-template.json');
  if(!panel.review_template_file)await writeNew(templateFile,panel.review_template);
  await fillReview({templateFile,observationsFile:resolve(base,item.observations),reviewFile});
  const result=await reviewPanel({projectDirectory,panelId:item.panel_id,reviewFile});
  return {...result,ok:result.accepted,review_file:reviewFile,task_id:panel.task_id,visual_decisions:'caller-supplied'};
 }});
}

export async function preparePanelBatch({projectDirectory,planFile,outputDirectory}){
 await preflightOutputDirectory(outputDirectory);
 const {items,base}=await batchPlan(planFile,['panel_id','prompt_file','reason','depends_on']);
 check(items.length<=4,'INVALID_BATCH','Each group contains at most four independent single-image requests.');
 for(const item of items)check(item.depends_on===undefined||Array.isArray(item.depends_on),'INVALID_BATCH','depends_on is an explicit array of previously accepted panel IDs.');
 // Validate and reserve under the project's existing lock. Old serial commands
 // retain their contract; a group never races four budget reservations.
 await freshDir(outputDirectory);await writeNew(path.join(outputDirectory,'preparation-intent.json'),{project:path.resolve(projectDirectory),items,plan:path.resolve(planFile),paid_action:false});
 let executions;try{executions=await preparePanelGroup({projectDirectory,items:items.map(i=>({panelId:i.panel_id,promptFile:resolve(base,i.prompt_file),reason:i.reason,dependsOn:i.depends_on}))});}catch(error){const report=path.join(outputDirectory,'preparation-error.json');await writeNew(report,{ok:false,paid_action:false,error:errorResult(error),status:await panelStatus({projectDirectory}).catch(e=>({ok:false,error:errorResult(e)})),recovery:'Inspect existing execution_record paths and recover reserved requests; retain budget and task IDs.'});error.details={...error.details,preparation_report:report};throw error;}
 const receipt={schema_version:'panel-batch-1',ok:true,paid_action:false,project:path.resolve(projectDirectory),project_record:await identity(path.join(projectDirectory,'project.json')),group_size:items.length,concurrency:4,generation_route:executions[0].schema_version==='native-image-execution-1'?'native':'sealseek',items:await Promise.all(executions.map(async(e,n)=>({id:items[n].id,panel_id:items[n].panel_id,revision:e.revision,execution:await identity(e.execution_record),request:await identity(e.request_record)}))),batch_record:path.resolve(outputDirectory,'batch.json'),next_action:executions[0].schema_version==='native-image-execution-1'?'Consume each native execution through the host image tool exactly once, bind returned originals with attach-native, and inspect all five review fields before the next group.':'Reuse this saved group. Run dry-run, then submit only within actual authorization; follow the same IDs and inspect each original before the next group.'};
 await writeNew(receipt.batch_record,receipt);return receipt;
}

async function latestRun(directory,item,mode){
 const root=path.join(directory,'runs',item.id);if(!await exists(root))return null;
 const entries=[];for(const name of (await fs.readdir(root)).sort()){
  const dir=path.join(root,name);const start=await read(path.join(dir,'started.json')).catch(()=>null);
  if(start?.mode===mode)entries.push({directory:dir,start,result:await read(path.join(dir,'process.json')).catch(()=>null)});
 }
 return entries.at(-1)??null;
}
function taskOf(data){const t=data?.task??data;return t&&typeof t.task_id==='string'&&t.task_id?t:null;}

export async function runPanelBatch({batchFile,mode,mediaEntry}){
 check(['dry-run','submit','follow'].includes(mode),'INVALID_INPUT','Select dry-run, submit or follow explicitly.');
 const group=await read(batchFile),directory=path.dirname(path.resolve(batchFile));
 check(group.schema_version==='panel-batch-1'&&group.items.length>=1&&group.items.length<=4,'INVALID_BATCH','Use a saved group of 1..4 single-image requests.');
 check(group.generation_route!=='native','GENERATION_ROUTE_MISMATCH','Native groups use the host image tool and attach-native; batch-run only delegates SealSeek CLI tasks.');
 return locked(directory,async()=>{
  if(mode!=='follow')await unchanged(group.project_record);const p=await read(group.project_record.path);
  check(mode!=='submit'||p.authorization.confirmed===true&&p.authorization.evidence,'PAID_ACTION_NOT_AUTHORIZED','Preserve the real project authorization and request budget.');
  const status=await panelStatus({projectDirectory:group.project});
  for(const item of group.items){
   const current=status.panels.find(i=>i.id===item.panel_id);
   check(current&&current.revisions===item.revision,'BATCH_REVISION_CHANGED','A newer revision exists; follow its own group.');await unchanged(item.execution);await unchanged(item.request);check(path.resolve(item.execution.path)===path.resolve(current.execution_record),'EXECUTION_MISMATCH','Use this revision’s canonical execution receipt.');
   const request=await read(item.request.path);if(mode!=='follow')for(const ref of request.references)await unchangedPanelReference(ref);
   const e=await read(item.execution.path);
   check(e.schema_version==='media-execution-1'&&e.panel_id===item.panel_id&&e.revision===item.revision&&e.base_args[e.base_args.indexOf('--count')+1]==='1','EXECUTION_MISMATCH','Use the exact saved single-image execution receipt.');
   check(path.resolve(item.request.path)===path.resolve(e.request_record)&&e.command==='sealseek-media'&&request.model===p.model&&request.count===1&&JSON.stringify(e.base_args)===JSON.stringify(request.args)&&JSON.stringify(e.dry_run_args)===JSON.stringify([...request.args,'--dry-run','--json'])&&JSON.stringify(e.submit_args)===JSON.stringify([...request.args,'--via','sealseek','--submit','--json']),'EXECUTION_MISMATCH','Consume the unchanged producer argv and mode suffixes.');
   if(mode==='submit'){const dry=await latestRun(directory,item,'dry-run');check(dry?.result?.ok===true,'DRY_RUN_REQUIRED','Every group item must have a successful saved dry-run before submission.');check(dry.start.entry===mediaEntry,'DRY_RUN_CONTEXT_CHANGED','Dry-run this group through the currently selected media entry before submission.');}
  }
  const results=await bounded(group.items,4,async item=>{
   try{
    const current=status.panels.find(i=>i.id===item.panel_id),execution=await read(item.execution.path);
    if(['accepted','needs-revision'].includes(current.status))return {id:item.id,ok:true,status:current.status,reused:true};
    if(mode==='submit'&&current.task_id)return {id:item.id,ok:true,task_id:current.task_id,status:current.status,reused:true,already_attached:true,...(current.status==='needs-recovery'?{ok:false,error:{code:'TASK_RECOVERY_REQUIRED',message:'Recover the existing task ID.'}}:{})};
    const previous=await latestRun(directory,item,'submit');
    if(mode==='submit'&&previous){
     // A process result survives an attach interruption; consume it directly.
     if(previous.result){const task=taskOf(previous.result.data);return {id:item.id,ok:previous.result.ok&&Boolean(task),task_id:task?.task_id??null,process_record:path.join(previous.directory,'process.json'),task_json:task?path.join(previous.directory,'task.json'):null,result:previous.result,reused:true,status:task?'known-task':'needs-reconciliation'};}
     return {id:item.id,ok:false,status:'needs-reconciliation',error:{code:'SUBMISSION_UNCERTAIN',message:'Submission started without a durable result. Inspect media history and bind the original task; do not submit again.'}};
    }
    let args,knownTaskId=null;
    if(mode==='follow'){
     const task_id=current.task_id??taskOf(previous?.result?.data)?.task_id;
     knownTaskId=task_id;check(task_id,'TASK_ID_REQUIRED','Recover the original ID from media history and panel attach; follow never generates.');args=['task','wait',task_id,'--timeout','45','--json'];
    }else args=mode==='submit'?execution.submit_args:execution.dry_run_args;
    const runDirectory=path.join(directory,'runs',item.id,Date.now()+'-'+randomUUID());await fs.mkdir(runDirectory,{recursive:true});
    // Save intent before spawning: a crash or invalid output cannot become a retry.
    await writeNew(path.join(runDirectory,'started.json'),{mode,entry:mediaEntry,args,execution:item.execution,created_at:new Date().toISOString()});
    const result=await runCLI(mediaEntry,args);await writeNew(path.join(runDirectory,'process.json'),result);
    const task=taskOf(result.data),task_json=task?path.join(runDirectory,'task.json'):null;
    if(task)await writeNew(task_json,result.data);
    return {id:item.id,ok:result.ok&&(mode==='dry-run'||Boolean(task)),status:mode==='dry-run'?(result.ok?'validated':'failed'):task?task.status??'known-task':knownTaskId?'needs-recovery':'needs-reconciliation',task_id:task?.task_id??knownTaskId,original_task_id:knownTaskId,already_attached:Boolean(knownTaskId&&!task),task_json,process_record:path.join(runDirectory,'process.json'),submission_attempted:mode==='submit',result,...(!result.ok?{error:processFailure(result)}:{})};
   }catch(error){return {id:item.id,ok:false,error:errorResult(error)};}
  });
  // Attaching is a short ordered state transaction; only service subprocesses
  // run concurrently. Independent project locks are never raced against one another.
  if(mode!=='dry-run')for(const row of results)if(row.task_id&&!row.already_attached){
   const item=group.items.find(i=>i.id===row.id);
   try{
    if(row.task_json&&!await exists(row.task_json))await writeNew(row.task_json,row.result.data);
    row.attached=await attachPanel({projectDirectory:group.project,panelId:item.panel_id,taskFile:row.task_json});
    row.status=row.attached.task.artifacts.length?'awaiting-review':row.attached.task.status;
    if(['failed','uncertain','download_failed'].includes(row.attached.task.status)){row.ok=false;row.error={code:'TASK_RECOVERY_REQUIRED',task_id:row.attached.task.task_id,status:row.attached.task.status,provider_error:row.attached.task.error??null};}
   }catch(error){row.ok=false;row.error=errorResult(error);}
  }
  const compact=results.map(({result,...item})=>item);
  const report={schema_version:'panel-batch-run-1',ok:compact.every(i=>i.ok),mode,concurrency:4,paid_action:compact.some(i=>i.submission_attempted===true),batch_record:path.resolve(batchFile),items:compact,report:path.join(directory,'report-'+Date.now()+'-'+randomUUID()+'.json'),next_action:mode==='dry-run'?'Read every item result before authorized submit.':'Recover saved IDs for failures or uncertainty; inspect original artifacts and fill their exact review templates. Never resubmit an unknown item.'};
  report.ready_for_review=mode==='follow'&&compact.some(i=>i.status==='awaiting-review')&&compact.every(i=>['awaiting-review','accepted','needs-revision'].includes(i.status));report.review_completed=compact.every(i=>['accepted','needs-revision'].includes(i.status));
  if(mode!=='dry-run'&&!report.ready_for_review&&!report.review_completed)report.next_action='Follow running tasks or recover the saved IDs; ready_for_review is false. Never submit again to recover an existing item.';
  await writeNew(report.report,report);return report;
 });
}
