import fs from 'node:fs/promises';
import path from 'node:path';
import {check,read,writeNew,identity,unchanged,exists,locked,knownFields,resolve} from './common.mjs';
import {placeLayout} from './layout-presets.mjs';
import {resolvePanelReference} from './reference-images.mjs';

export const REVIEW_CHECKS=['identity','role','clarity','composition','subject_prominence'];
const note=v=>typeof v==='string'&&v.trim().length>0;
export async function verifyPlanLock(directory,p){
 if(p.schema_version!=='panel-assets-2')return;
 const lock=await read(path.join(directory,'plan-lock.json')).catch(()=>null);check(lock?.schema_version==='asset-plan-lock-1','PLAN_LOCK_REQUIRED','Create the complete plan before generation.');
 await unchanged(lock.project);check(lock.project.path===path.resolve(directory,'project.json'),'PLAN_LOCK_MISMATCH','Use this project’s own saved plan.');
 placeLayout(p.panels,p);
}
export async function writePlanLock(directory){const project=await identity(path.join(directory,'project.json'));await writeNew(path.join(directory,'plan-lock.json'),{schema_version:'asset-plan-lock-1',project,locked_at:new Date().toISOString()});return project;}
export function generationContract(value){
 if(value===undefined)return {route:'sealseek',model:'nano-banana-pro'};
 knownFields(value,['route','tool','model']);check(['native','sealseek'].includes(value.route),'INVALID_GENERATION_ROUTE','Select native or sealseek explicitly.');
 if(value.route==='sealseek'){check(value.model===undefined||value.model==='nano-banana-pro','INVALID_GENERATION_ROUTE','The selected SealSeek route uses nano-banana-pro.');return {route:'sealseek',model:'nano-banana-pro'};}
 check(value.model===undefined||value.model===null||note(value.model),'INVALID_GENERATION_ROUTE','Use the selected model identifier or null when the host does not expose it.');check(value.tool===undefined||note(value.tool),'INVALID_GENERATION_ROUTE','Use the host native image tool identifier.');return {route:'native',tool:value.tool??'imagegen',model:value.model??null};
}
export async function effectivePanel(directory,panel){
 const dir=path.join(directory,'intents',panel.id);if(!await exists(dir))return panel;
 const files=(await fs.readdir(dir)).filter(x=>/^intent-\d{4}\.json$/.test(x)).sort();if(!files.length)return panel;
 const file=path.join(dir,files.at(-1)),v=await read(file);check(v.schema_version==='panel-intent-1'&&v.panel_id===panel.id,'INVALID_PANEL_INTENT','Preserve and inspect the panel intent record.');
 check(v.role===panel.role,'LAYOUT_ROLE_MISMATCH','Keep the role of the locked slot; changing slot roles requires a new plan.');
 return {...panel,label:v.label,intent:v.intent,references:v.references,intent_record:await identity(file)};
}
export async function revisePanelIntent({projectDirectory,panelId,analysisFile}){return locked(projectDirectory,async()=>{
 const p=await read(path.join(projectDirectory,'project.json'));await verifyPlanLock(projectDirectory,p);check(p.schema_version==='panel-assets-2','MODERN_PLAN_REQUIRED','Intent revisions use a locked template project.');
 const original=p.panels.find(i=>i.id===panelId);check(original,'UNKNOWN_PANEL','Select an existing panel.');const current=await effectivePanel(projectDirectory,original);
 const {panelStatus}=await import('./panel-assets.mjs');const state=(await panelStatus({projectDirectory})).panels.find(i=>i.id===panelId);check(!['reserved','running','awaiting-review','needs-recovery'].includes(state.status),'ACTIVE_PANEL','Finish/recover and inspect the current attempt before revising its intent.');
 const a=await read(analysisFile);knownFields(a,['label','intent','role','references','reason']);check(note(a.label)&&a.label.length<=24&&note(a.intent)&&note(a.reason),'INTENT_EVIDENCE_REQUIRED','Record the new label, complete intent and reason for changing the reference or evidence role.');check(a.role===undefined||a.role===original.role,'LAYOUT_ROLE_MISMATCH','Keep the locked slot role.');check(Array.isArray(a.references)&&a.references.length,'EVIDENCE_REQUIRED','Provide the new ordered reference evidence.');
 const references=[];for(const v of a.references)references.push(await resolvePanelReference(path.dirname(path.resolve(analysisFile)),v));
 const dir=path.join(projectDirectory,'intents',panelId);await fs.mkdir(dir,{recursive:true});const n=(await fs.readdir(dir)).filter(x=>/^intent-\d{4}\.json$/.test(x)).length+1,file=path.join(dir,'intent-'+String(n).padStart(4,'0')+'.json');
 await writeNew(file,{schema_version:'panel-intent-1',panel_id:panelId,role:original.role,label:a.label,intent:a.intent,references,reason:a.reason,previous:current.intent_record??null,created_at:new Date().toISOString()});
 return {ok:true,intent_record:await identity(file),affected_panels:[panelId],layout_unchanged:true,paid_action:false,next_action:'Prepare a new revision for this panel with the revised intent; preserve all other selections. Composition remains blocked until its new review passes.'};
 });}
export async function attachNativePanel({projectDirectory,panelId,resultFile}){
 const {panelStatus,attachPanel}=await import('./panel-assets.mjs');
 // Copy/normalize under the same project lock; attach performs its own short lock.
 const prepared=await locked(projectDirectory,async()=>{
  const p=await read(path.join(projectDirectory,'project.json'));await verifyPlanLock(projectDirectory,p);check(p.schema_version==='panel-assets-2'&&p.generation.route==='native','GENERATION_ROUTE_MISMATCH','Use a preplanned native generation revision.');
  const s=(await panelStatus({projectDirectory})).panels.find(i=>i.id===panelId);check(s?.execution_record,'PANEL_NOT_READY','Prepare this panel before calling the host image tool.');const execution=await read(s.execution_record),dir=path.dirname(s.execution_record),requestFile=path.join(dir,'request.json'),request=await read(requestFile),sourceReceipt=await identity(resultFile),v=await read(resultFile);
  knownFields(v,['request_sha256','artifact_path','invocation_id','model','evidence']);check(v.request_sha256===(await identity(requestFile)).sha256,'REQUEST_MISMATCH','Bind the actual returned image to the exact prepared request.');check(note(v.evidence)&&note(v.artifact_path),'NATIVE_RESULT_REQUIRED','Record the real native tool result and output image.');check(v.invocation_id===undefined||note(v.invocation_id),'NATIVE_RESULT_REQUIRED','Use the real invocation identifier when exposed.');check(v.model===undefined||v.model===null||note(v.model),'NATIVE_RESULT_REQUIRED','Record the actual model or null when unknown.');check(execution.schema_version==='native-image-execution-1','GENERATION_ROUTE_MISMATCH','Use the native execution receipt.');check(!s.selected_revision||s.status==='reserved','PANEL_NOT_READY','Attach only the current unreviewed attempt.');
  await unchanged(execution.request_identity);if(p.model&&v.model)check(v.model===p.model,'TASK_MISMATCH','Preserve the explicitly selected model.');
  const source=resolve(path.dirname(path.resolve(resultFile)),v.artifact_path),ref=await identity(source);await fs.mkdir(request.output,{recursive:true});const target=path.join(request.output,'native-original'+(path.extname(source)||'.png'));
  if(await exists(target))check((await identity(target)).sha256===ref.sha256,'OUTPUT_EXISTS','Preserve the existing native result; inspect state before retrying.');else await writeNew(target,await fs.readFile(source));await unchanged(ref);await unchanged(sourceReceipt);
  const input=path.join(dir,'native-input-'+sourceReceipt.sha256.slice(0,16)+'.json'),task={task_id:v.invocation_id??'local-native-'+v.request_sha256.slice(0,24),task_id_kind:v.invocation_id?'provider-invocation':'local-record',model:p.model,reported_model:v.model??null,source_kind:'native',native_result:sourceReceipt,evidence:v.evidence,request_sha256:v.request_sha256,requested_count:1,actual_count:1,status:'succeeded',artifacts:[{path:target}]};
  if(!await exists(input))await writeNew(input,task);return input;
 });return attachPanel({projectDirectory,panelId,taskFile:prepared});
}

export async function rerenderLegacyBoard({boardDirectory,planFile,outputDirectory}){
 const {renderBoard}=await import('./board.mjs');
 const manifest=await read(path.join(boardDirectory,'sources-manifest.json'));check(!manifest.project_record,'LEGACY_ONLY','Use board compose for a managed workflow project.');await unchanged(manifest.board);
 const saved=await read(path.join(boardDirectory,'board-plan.json')),given=await read(planFile);check(JSON.stringify(saved)===JSON.stringify(given),'LEGACY_PLAN_MISMATCH','Rerender only the existing saved legacy board plan.');
 for(const i of manifest.panels)await unchanged(i.source);
 const {preflightOutputDirectory,freshDir}=await import('./common.mjs');await preflightOutputDirectory(outputDirectory);await freshDir(outputDirectory);
 const file=path.join(outputDirectory,'legacy-plan.json');await writeNew(file,{...saved,panels:saved.panels.map(i=>({...i,source:manifest.panels.find(p=>p.id===i.id).source.path}))});
 return renderBoard({planFile:file,outputDirectory:path.join(outputDirectory,'board')});
}
