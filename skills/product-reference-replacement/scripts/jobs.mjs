import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {check,read,writeNew,freshDir,identity,unchanged,integer,safeId,resolve,hash,exists,locked,knownFields} from './common.mjs';
import {imageInfo,label} from './board.mjs';
import {checkBlueprint} from './blueprint.mjs';
const PAD=n=>String(n).padStart(2,'0');
const terminal=new Set(['succeeded','partial','failed','uncertain','download_failed']);
async function manifest(job){const j=await read(path.join(job,'job.json'));check(j.schema_version==='1.0.0','INVALID_JOB','Unsupported job format.');return j;}
function item(j,id){const i=j.images.find(x=>x.id===id);check(i,'UNKNOWN_IMAGE','Choose an image ID listed in this job.');return i;}
async function rounds(job,id){const dir=path.join(job,id);if(!await exists(dir))return [];const names=(await fs.readdir(dir)).filter(n=>/^round-\d{2}$/.test(n)).sort();const out=[];for(const n of names){const p=path.join(dir,n),r=await read(path.join(p,'request.json'));const tasks=(await fs.readdir(p)).filter(n=>/^task-\d{2}.json$/.test(n)).sort();out.push({directory:p,request:r,task:tasks.length?await read(path.join(p,tasks.at(-1))):null,task_count:tasks.length,review:await exists(path.join(p,'review.json'))?await read(path.join(p,'review.json')):null});}return out;}
function statusOf(rs,max=4){if(!rs.length)return 'pending';const r=rs.at(-1);if(r.review){if(r.review.accepted)return 'accepted';if(['UNCERTAIN','ANCHOR_CONFLICT'].includes(r.review.verdict))return 'needs-input';return rs.length>=max?'exhausted':'ready';}if(!r.task)return 'reserved';if(['failed','uncertain','download_failed'].includes(r.task.status))return r.task.status==='failed'?'failed':'needs-recovery';return ['succeeded','partial'].includes(r.task.status)?'awaiting-review':'running';}
export async function createJob({planFile,outputDirectory}){
 const p=await read(planFile),base=path.dirname(path.resolve(planFile)),mode=p.mode??'single';
 knownFields(p,['mode','asset_record','images','max_rounds','resolution','ratio','authorization']);
 check(['single','batch'].includes(mode),'INVALID_INPUT','mode is single or batch.');
 check(Array.isArray(p.images)&&p.images.length>0&&p.images.length<=100,'INVALID_INPUT','Supply 1–100 explicit scene images.');
 check(mode==='batch'||p.images.length===1,'SCOPE_REQUIRED','Default single mode accepts exactly one selected image. Explicit batch scope is required for groups.');
 check(p.authorization?.confirmed===true&&typeof p.authorization.evidence==='string'&&p.authorization.evidence.trim(),'PAID_ACTION_NOT_AUTHORIZED','Record the real user authorization and selected scope before creating a replacement job.');
 const assetFile=resolve(base,p.asset_record),a=await read(assetFile);
 check(a.status==='approved'&&a.board?.sha256&&safeId(a.asset_id),'INVALID_ASSET','Import or freeze an inspected asset first.');await unchanged(a.board);
 const ids=new Set(),images=[];
 for(const i of p.images){knownFields(i,['id','source','ratio']);check(safeId(i.id)&&!ids.has(i.id),'INVALID_INPUT','Each scene needs a unique safe ID.');ids.add(i.id);const f=resolve(base,i.source);images.push({id:i.id,source:{...await identity(f),...await imageInfo(f)},ratio:i.ratio??p.ratio??null});}
 const maxRounds=p.max_rounds??4,maxRequests=p.authorization.max_requests??p.images.length*maxRounds;
 check(integer(maxRounds,1,4)&&integer(maxRequests,1,p.images.length*maxRounds),'INVALID_BUDGET','At most four rounds per image; max_requests must fit the selected scope.');
 const j={schema_version:'1.0.0',blueprint_required:true,job_id:randomUUID(),created_at:new Date().toISOString(),mode,model:'nano-banana-pro',resolution:p.resolution??'2K',max_rounds:maxRounds,max_requests:maxRequests,authorization:p.authorization,asset:{...a,record:path.resolve(assetFile)},images};
 check(['1K','2K','4K'].includes(j.resolution),'INVALID_INPUT','Resolution must be verified against the live model contract.');
 await freshDir(outputDirectory);await writeNew(path.join(outputDirectory,'job.json'),j);return {ok:true,job:path.resolve(outputDirectory),mode,image_count:images.length,asset:a.board.path,asset_sha256:a.board.sha256,max_requests:maxRequests,max_rounds_per_image:maxRounds,execution:'sequential',next_action:'Prepare one selected scene, submit once through the media Skill, attach the same task, inspect, then review.'};
}
export async function jobStatus({job}){const j=await manifest(job),images=[];for(const i of j.images){const rs=await rounds(job,i.id);images.push({id:i.id,status:statusOf(rs,j.max_rounds),rounds:rs.length,tasks:rs.map(r=>r.task?.task_id??null),asset_sha256:j.asset.board.sha256});}return {ok:true,job_id:j.job_id,mode:j.mode,asset:j.asset.board,images,requests_reserved:images.reduce((n,i)=>n+i.rounds,0),max_requests:j.max_requests};}
export async function prepareRound({job,imageId,promptFile,blueprintFile}){return locked(job,async()=>{
 const j=await manifest(job),i=item(j,imageId);await unchanged(j.asset.board);await unchanged(i.source);
 const status=await jobStatus({job});check(status.requests_reserved<j.max_requests,'BUDGET_EXHAUSTED','The authorized request limit has been reached.');
 const rs=await rounds(job,imageId),state=statusOf(rs,j.max_rounds);check(['pending','ready'].includes(state)||(state==='needs-input'&&blueprintFile),'ROUND_NOT_READY',`This image is ${state}; inspect, review or recover the same task first.`);check(rs.length<j.max_rounds,'ROUND_LIMIT','The per-image round limit has been reached.');
 // Batch processing is serial; only a finished/blocked item may precede another image.
 for(const other of status.images)if(other.id!==imageId)check(!['reserved','running','awaiting-review','ready','needs-recovery'].includes(other.status),'ACTIVE_IMAGE','Finish/recover the active image before preparing another image.');
 const prompt=(await fs.readFile(promptFile,'utf8')).trim();check(prompt.length>0&&prompt.length<=20000,'INVALID_PROMPT','Supply the complete current prompt.');
 if(rs.length)check(hash(prompt)!==rs.at(-1).request.prompt_sha256,'PROMPT_UNCHANGED','Revise the prompt based on the previous inspected failure.');
 check(!j.blueprint_required||blueprintFile,'BLUEPRINT_REQUIRED','Record an inspected replacement blueprint before preparing a new job round.');
 const blueprint=blueprintFile?await checkBlueprint({jobManifest:j,imageId,blueprintFile}):null;
 if(state==='needs-input')check(blueprint?.record.analysis.feasibility.resolution_evidence&&blueprint.identity.sha256!==rs.at(-1).request.blueprint?.sha256,'ROUND_NOT_READY','Resume only with a new ready blueprint explaining newly obtained user clarification or evidence. Existing rounds and budget remain counted.');
 const ratio=i.ratio??closestRatio(i.source.width/i.source.height),n=rs.length+1,dir=path.join(job,imageId,'round-'+PAD(n));
 check(['1:1','16:9','9:16','4:3','3:4','21:9','3:2','2:3','5:4','4:5'].includes(ratio),'INVALID_RATIO','Select a ratio allowed by the live model catalog.');
 const args=['image','generate','--model',j.model,'--prompt',prompt,'--reference',i.source.path,'--reference',j.asset.board.path,'--ratio',ratio,'--resolution',j.resolution,'--count','1','--output',path.resolve(dir,'generated')];
 const r={round:n,image_id:imageId,prompt,prompt_sha256:hash(prompt),references:[i.source,j.asset.board],model:j.model,count:1,ratio,resolution:j.resolution,prepared_at:new Date().toISOString(),command:'sealseek-media',args,output:path.resolve(dir,'generated')};
 if(blueprint){r.blueprint=blueprint.identity;r.blueprint_snapshot_sha256=hash(JSON.stringify(blueprint.record,null,2)+'\n');}
 await fs.mkdir(path.dirname(dir),{recursive:true});await freshDir(dir);if(blueprint)await writeNew(path.join(dir,'edit-blueprint.json'),blueprint.record);await writeNew(path.join(dir,'request.json'),r);await writeNew(path.join(dir,'prompt.txt'),prompt+'\n');return {ok:true,request_only:true,paid_action:false,round:n,round_directory:path.resolve(dir),command:r.command,dry_run_args:[...args,'--dry-run','--json'],submit_args:[...args,'--via','sealseek','--submit','--json'],next_action:'Dry-run through the loaded media Skill, then submit once within authorization. Unknown outcome: inspect existing media history/task; do not prepare another round.'};
});}
function closestRatio(value){return ['1:1','4:5','5:4','3:4','4:3','2:3','3:2','9:16','16:9','21:9'].sort((a,b)=>Math.abs(Math.log(value/(+a.split(':')[0]/+a.split(':')[1])))-Math.abs(Math.log(value/(+b.split(':')[0]/+b.split(':')[1]))))[0];}
export async function attachTask({job,imageId,taskFile}){return locked(job,async()=>{
 const j=await manifest(job);item(j,imageId);const rs=await rounds(job,imageId),r=rs.at(-1);check(r&&!r.review,'ROUND_NOT_READY','Prepare a round and attach its task before reviewing.');
 const raw=await read(taskFile),t=raw.task??raw;check(typeof t.task_id==='string'&&t.task_id&&t.model===j.model&&t.requested_count===1,'TASK_MISMATCH','Expected a single-image Nano Banana Pro task summary.');
 if(r.task)check(t.task_id===r.task.task_id,'TASK_MISMATCH','Recovery must use the same saved task ID.');
 for(const image of j.images)for(const old of await rounds(job,image.id))if(old.directory!==r.directory)check(old.task?.task_id!==t.task_id,'TASK_REUSED','One task cannot count as multiple scene rounds.');
 check(['queued','running',...terminal].includes(t.status),'INVALID_TASK','Unsupported task status.');
 const saved={task_id:t.task_id,remote_task_id:t.remote_task_id??null,status:t.status,model:t.model,requested_count:1,actual_count:t.actual_count??null,cost:t.cost??null,error:t.error??null,artifacts:[],first_attached_at:r.task?.first_attached_at??new Date().toISOString(),attached_at:new Date().toISOString()};
 if(['succeeded','partial'].includes(t.status)){
  check(t.actual_count===1&&Array.isArray(t.artifacts)&&t.artifacts.length===1,'OUTPUT_CONTRACT_FAILED','The round must return exactly one downloaded image.');
  const art=t.artifacts[0],f=resolve(path.dirname(path.resolve(taskFile)),art.path),id=await identity(f);if(art.sha256)check(id.sha256===art.sha256,'HASH_MISMATCH','Downloaded artifact hash mismatch.');
  check(path.dirname(f)===r.request.output,'ARTIFACT_PATH_MISMATCH','Use this round\'s configured output directory; task output belongs to another request.');saved.artifacts=[{...id,...await imageInfo(f)}];
 }
 await writeNew(path.join(r.directory,'task-'+PAD(r.task_count+1)+'.json'),saved);return {ok:true,task:saved,next_action:saved.artifacts.length?'Actually inspect this image, then record a visual review.':terminal.has(t.status)?'Diagnose/recover this same task; no new paid attempt automatically.':'Continue following the same task ID.'};
});}
export async function reviewRound({job,imageId,reviewFile}){return locked(job,async()=>{
 const j=await manifest(job);item(j,imageId);const rs=await rounds(job,imageId),r=rs.at(-1),v=await read(reviewFile);
 check(r&&!r.review&&r.task?.artifacts.length===1&&['succeeded','partial'].includes(r.task.status),'ROUND_NOT_READY','Attach a completed downloaded task before visual review.');await unchanged(r.task.artifacts[0]);
 check(v.inspected===true&&v.artifact_sha256===r.task.artifacts[0].sha256,'REVIEW_REQUIRED','Attest real visual inspection of this exact artifact hash.');
 const allowed=['PASS','FAIL','UNCERTAIN','ANCHOR_CONFLICT'];check(allowed.includes(v.product_verdict)&&allowed.includes(v.scene_verdict),'INVALID_REVIEW','Review product consistency and scene preservation separately.');
 const verdict=v.product_verdict==='PASS'&&v.scene_verdict==='PASS'?'PASS':v.product_verdict==='ANCHOR_CONFLICT'||v.scene_verdict==='ANCHOR_CONFLICT'?'ANCHOR_CONFLICT':v.product_verdict==='UNCERTAIN'||v.scene_verdict==='UNCERTAIN'?'UNCERTAIN':'FAIL';
 check(Array.isArray(v.issues)&&v.issues.every(x=>typeof x==='string'&&x.trim())&&(verdict==='PASS'?v.issues.length===0:v.issues.length>0),'INVALID_REVIEW','Give localized evidence for non-pass results; known issues cannot be accepted.');
 check(typeof v.evidence==='string'&&v.evidence.trim(),'INVALID_REVIEW','Explain the comparison against the two original references.');
 if(r.request.blueprint){
  knownFields(v.checks,['product','scene','contact','occlusion','text']);
  for(const key of ['product','scene','contact','occlusion','text']){
   const c=v.checks[key];check(c&&allowed.includes(c.verdict)&&typeof c.evidence==='string'&&c.evidence.trim(),'REVIEW_CHECKS_REQUIRED',`Record ${key} comparison, including justified non-applicability.`);
   const gate=key==='product'?v.product_verdict:v.scene_verdict;
   check(gate!=='PASS'||c.verdict==='PASS','INVALID_REVIEW','A passing gate cannot contain failed or uncertain checks.');
  }
 }
 const review={...v,verdict,accepted:verdict==='PASS',round:rs.length,reviewed_at:new Date().toISOString()};await writeNew(path.join(r.directory,'review.json'),review);
 const state=statusOf([...rs.slice(0,-1),{...r,review}],j.max_rounds);return {ok:true,status:state,review,next_action:state==='accepted'?'Deliver this image; continue only other explicitly authorized batch items.':state==='ready'?'Revise the complete prompt, keep the original two references, prepare one next round.':state==='exhausted'?'Stop this image at the round limit and report remaining issues.':'Resolve evidence/asset ambiguity with the user; do not regenerate the board or submit automatically.'};
});}
async function comparison(entries){const W=1024,H=900,layers=[];for(const [k,a] of entries.entries()){const x=k%2*512,y=Math.floor(k/2)*450,img=await sharp(a.path).autoOrient().resize(480,395,{fit:'contain',background:'#f7f7f7'}).png().toBuffer(),text=await label(`第 ${a.round} 轮`,460,30);layers.push({input:text,left:x+16,top:y+8},{input:img,left:x+16,top:y+45});}return sharp({create:{width:W,height:H,channels:3,background:'#f7f7f7'}}).composite(layers).jpeg({quality:90}).toBuffer();}
export async function collectJob({job,outputDirectory}){
 const j=await manifest(job),status=await jobStatus({job}),prepared=[];await unchanged(j.asset.board);
 for(const i of j.images){const rs=await rounds(job,i.id);for(const r of rs){for(const a of r.task?.artifacts??[])await unchanged(a);if(r.request.blueprint)check(hash(await fs.readFile(path.join(r.directory,'edit-blueprint.json')))===r.request.blueprint_snapshot_sha256,'HASH_MISMATCH','The saved blueprint snapshot changed; preserve history before collection.');}prepared.push({i,rs,state:status.images.find(x=>x.id===i.id).status});}
 await freshDir(outputDirectory);const asset=path.join(outputDirectory,'产品资产图'+path.extname(j.asset.board.path).toLowerCase());await writeNew(asset,await fs.readFile(j.asset.board.path));const files=[],costs=[];
 for(const {i,rs,state} of prepared){const target=path.join(outputDirectory,i.id);await fs.mkdir(target);const entries=[];
  for(const r of rs){const blueprint=r.request.blueprint?await read(path.join(r.directory,'edit-blueprint.json')):null;await writeNew(path.join(target,'round-'+PAD(r.request.round)+'-record.json'),{request:r.request,blueprint,task:r.task,review:r.review});if(r.task)costs.push({image_id:i.id,round:r.request.round,cost:r.task.cost});const a=r.task?.artifacts[0];if(!a)continue;const ext=a.format==='jpeg'?'.jpg':'.'+a.format,f=path.join(target,'round-'+PAD(r.request.round)+ext);await writeNew(f,await fs.readFile(a.path));entries.push({path:f,round:r.request.round});files.push({...await identity(f),image_id:i.id,round:r.request.round});}
  const accepted=rs.find(r=>r.review?.accepted);if(accepted){const a=accepted.task.artifacts[0],ext=a.format==='jpeg'?'.jpg':'.'+a.format;await writeNew(path.join(target,'已验收结果'+ext),await fs.readFile(a.path));}
  if(entries.length>1)await writeNew(path.join(target,'轮次对比.jpg'),await comparison(entries));
 }
 const units=new Set(costs.filter(x=>x.cost).map(x=>x.cost.unit)),amount=costs.filter(x=>typeof x.cost?.amount==='number').reduce((n,x)=>n+x.cost.amount,0),summary={...status,files,costs,known_cost:units.size===1?{amount,unit:[...units][0]}:null,unknown_cost_rounds:costs.filter(x=>x.cost==null).length,shared_asset:path.resolve(asset)};
 summary.job_created_at=j.created_at;summary.collected_at=new Date().toISOString();summary.elapsed_wall_seconds=(Date.parse(summary.collected_at)-Date.parse(j.created_at))/1000;summary.timing_scope='Local job creation through collection, including user interaction; not provider computation time.';
 await writeNew(path.join(outputDirectory,'处理清单.json'),summary);await writeNew(path.join(outputDirectory,'README.md'),'# 产品替换交付\n\n共享产品资产图保存一份。各图片目录保留实际轮次原件、提示词、任务和验收；只有通过双重验收的图片有“已验收结果”。\n\n'+status.images.map(i=>`- ${i.id}: ${i.status}，${i.rounds} 轮`).join('\n')+'\n\n费用未知项保留在处理清单中，不作为零费用。\n');return {ok:true,output_directory:path.resolve(outputDirectory),...summary};
}
