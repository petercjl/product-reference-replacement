import path from 'node:path';
import {check,read,writeNew,unchanged,knownFields,identity} from './common.mjs';

const text=(v)=>typeof v==='string'&&v.trim().length>0&&v.length<=3000;
function list(v,name,min=0){check(Array.isArray(v)&&v.length>=min&&v.length<=100&&v.every(text),'INVALID_BLUEPRINT',`Expected ${name} as a list of evidence-based statements.`);}
export function validateAnalysis(a){
 knownFields(a,['schema_version','inspected','scene_sha256','asset_sha256','target','observations','protected_entities','placement','contact','feasibility']);
 check(a.schema_version==='1.0.0'&&a.inspected===true,'BLUEPRINT_INSPECTION_REQUIRED','Record actual inspection of both original references.');
 check(/^[a-f0-9]{64}$/.test(a.scene_sha256)&&/^[a-f0-9]{64}$/.test(a.asset_sha256),'INVALID_BLUEPRINT','Bind the original scene and asset SHA256.');
 knownFields(a.target,['description','scope','evidence','confidence','candidates']);
 check(['clear','ambiguous'].includes(a.target.confidence)&&[a.target.description,a.target.scope,a.target.evidence].every(text),'INVALID_BLUEPRINT','Identify the selected object, scope and selection evidence.');
 list(a.target.candidates,'target.candidates',1);list(a.observations,'observations',1);list(a.protected_entities,'protected_entities',1);
 knownFields(a.placement,['anchors','scale_basis','orientation','unknowns']);
 list(a.placement.anchors,'placement.anchors',1);list(a.placement.unknowns,'placement.unknowns');
 check([a.placement.scale_basis,a.placement.orientation].every(text),'INVALID_BLUEPRINT','Explain relative scale and whole-product orientation.');
 knownFields(a.contact,['mode','relations','occlusion','visibility','material_behavior','deformation_rule']);
 check(['held','supported','worn','none','other'].includes(a.contact.mode)&&['rigid','soft','unknown'].includes(a.contact.material_behavior)&&text(a.contact.deformation_rule),'INVALID_BLUEPRINT','Specify contact and justified material behavior.');
 list(a.contact.relations,'contact.relations',1);list(a.contact.occlusion,'contact.occlusion',1);list(a.contact.visibility,'contact.visibility',1);
 knownFields(a.feasibility,['status','issues','contact_policy','authorization_evidence','resolution_evidence']);
 if(a.feasibility.resolution_evidence!==undefined)check(text(a.feasibility.resolution_evidence),'INVALID_BLUEPRINT','Explain newly obtained evidence resolving the pause.');
 check(['ready','uncertain','anchor_conflict'].includes(a.feasibility.status)&&['preserve','adapt_fingers'].includes(a.feasibility.contact_policy),'INVALID_BLUEPRINT','Declare feasibility and contact policy.');
 list(a.feasibility.issues,'feasibility.issues');
 if(a.feasibility.contact_policy==='adapt_fingers')check(text(a.feasibility.authorization_evidence),'CONTACT_AUTHORIZATION_REQUIRED','Finger adaptation requires explicit user authorization evidence.');
 const ready=a.target.confidence==='clear'&&a.feasibility.status==='ready'&&a.feasibility.issues.length===0;
 check(ready||a.feasibility.issues.length>0,'INVALID_BLUEPRINT','Explain ambiguity, uncertainty or contact conflict.');
 return ready;
}
export async function checkBlueprint({jobManifest,imageId,blueprintFile,requireReady=true}){
 const b=await read(blueprintFile),i=jobManifest.images.find(x=>x.id===imageId);
 check(i&&b.schema_version==='1.0.0'&&b.job_id===jobManifest.job_id&&b.image_id===imageId,'BLUEPRINT_MISMATCH','Use a blueprint recorded for this exact job and scene.');
 const ready=validateAnalysis(b.analysis);
 check(b.analysis.scene_sha256===i.source.sha256&&b.analysis.asset_sha256===jobManifest.asset.board.sha256,'BLUEPRINT_MISMATCH','Blueprint references differ from the frozen original references.');
 check(!requireReady||ready,'BLUEPRINT_BLOCKED','Resolve the recorded target ambiguity or contact conflict before reserving a request.');
 return {record:b,identity:await identity(blueprintFile)};
}
export async function recordBlueprint({job,imageId,analysisFile,record}){
 const j=await read(path.join(job,'job.json')),i=j.images.find(x=>x.id===imageId);
 check(j.schema_version==='1.0.0'&&i,'UNKNOWN_IMAGE','Use a scene listed in this job.');
 await unchanged(i.source);await unchanged(j.asset.board);
 const a=await read(analysisFile),ready=validateAnalysis(a);
 check(a.scene_sha256===i.source.sha256&&a.asset_sha256===j.asset.board.sha256,'BLUEPRINT_MISMATCH','Analysis must describe the job original scene and shared asset.');
 const b={schema_version:'1.0.0',job_id:j.job_id,image_id:imageId,recorded_at:new Date().toISOString(),analysis:a};
 await writeNew(record,b);
 return {ok:true,ready,record:await identity(record),paid_action:false,next_action:ready?'Compile a concise prompt from this blueprint; keep observations separate.':'Resolve the recorded uncertainty with the user; no generation request can be reserved with this blueprint.'};
}
