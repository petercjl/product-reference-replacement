import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import sharp from 'sharp';
import {prepareReferences,checkReferences,fillReview,reviewReferences} from '../skills/product-reference-replacement/scripts/reference-batch.mjs';
import {discoverStage,runCLI,bounded,processFailure} from '../skills/product-reference-replacement/scripts/batch-tools.mjs';
import {preparePanelBatch,runPanelBatch,reviewPanelBatch} from '../skills/product-reference-replacement/scripts/panel-batch.mjs';
import {planPanels,panelStatus,reviewPanel,preparePanel,attachPanel} from '../skills/product-reference-replacement/scripts/panel-assets.mjs';
import {writeNew,read,identity} from '../skills/product-reference-replacement/scripts/common.mjs';
const scriptRoot=path.resolve('bin/product-reference-replacement.mjs');
async function fixture(t,count=5,budget=8){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'asset-batch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const image=path.join(root,'source.png');await sharp({create:{width:1920,height:1080,channels:3,background:'#dbbf54'}}).png().toFile(image);
 const plan={product_id:'fixture',variant:'synthetic',template_id:'generic',width:1920,height:1080,padding:2,label_height:20,authorization:{confirmed:true,evidence:'Synthetic test authorization only; no live service calls.',max_requests:budget},panels:Array.from({length:count},(_,k)=>({id:'p'+k,label:'格'+k,role:k===0?'overall':k===1?'scale':'detail',intent:'synthetic',width:1920,height:1080,ratio:'16:9',resolution:'2K',references:[image],evidence:{inspected:true,note:'Synthetic test evidence.'}}))};
 // Explicit test boxes keep batching tests independent of layout selection.
 if(count===5)for(const [k,panel] of plan.panels.entries()){Object.assign(panel,k<2?{width:1200,height:1800,ratio:'2:3',box:{x:k*720,y:0,width:720,height:1080}}:{width:1024,height:768,ratio:'4:3',box:{x:1440,y:(k-2)*360,width:480,height:360}});}
 await sharp({create:{width:1200,height:1800,channels:3,background:'#dbbf54'}}).png().toFile(path.join(root,'portrait.png'));await sharp({create:{width:1024,height:768,channels:3,background:'#dbbf54'}}).png().toFile(path.join(root,'detail.png'));
 const planFile=path.join(root,'plan.json');await writeNew(planFile,plan);const projectDirectory=path.join(root,'project');await planPanels({planFile,outputDirectory:projectDirectory});
 const previous=process.env.ASSET_BATCH_FIXTURE;process.env.ASSET_BATCH_FIXTURE=root;t.after(()=>{if(previous===undefined)delete process.env.ASSET_BATCH_FIXTURE;else process.env.ASSET_BATCH_FIXTURE=previous;});
 const mediaEntry=path.join(root,'fake-media.mjs');await writeNew(mediaEntry,`
import fs from 'node:fs/promises';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
const root=process.env.ASSET_BATCH_FIXTURE,args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1],prompt=option('--prompt')??'';
await fs.mkdir(path.join(root,'events'),{recursive:true});const event=path.join(root,'events',randomUUID()+'.json');const start=Date.now();
await new Promise(r=>setTimeout(r,220));
const type=args[0]==='task'?'follow':args.includes('--submit')?'submit':args.includes('--dry-run')?'dry':'discovery';
await fs.writeFile(event,JSON.stringify({type,start,end:Date.now(),args}));
if(type==='discovery')console.log(JSON.stringify({ok:true,version:'fixture',args}));
else if(type==='dry'){console.log(JSON.stringify({ok:!prompt.includes('FAIL_DRY'),dry_run:true}));}
else if(type==='submit'){
 const id='t-'+createHash('sha256').update(option('--output')).digest('hex').slice(0,16),task={task_id:id,status:'running',model:'nano-banana-pro',requested_count:1,ratio:option('--ratio'),output:option('--output')};
 await fs.writeFile(path.join(root,id+'.json'),JSON.stringify(task));
 if(prompt.includes('UNKNOWN'))console.log('not JSON after a possible submission');else console.log(JSON.stringify({ok:true,task}));
}else{
 const task=JSON.parse(await fs.readFile(path.join(root,args[2]+'.json')));await fs.mkdir(task.output,{recursive:true});const file=path.join(task.output,'original.png');await fs.copyFile(path.join(root,task.ratio==='2:3'?'portrait.png':task.ratio==='4:3'?'detail.png':'source.png'),file);
 console.log(JSON.stringify({ok:true,task:{...task,status:'succeeded',actual_count:1,artifacts:[{path:file}]}}));
}
`);
 return {root,image,planFile,projectDirectory,mediaEntry};
}
async function group(x,ids,promptSuffix=''){
 const planFile=path.join(x.root,'group-'+ids.join('-')+'-'+Date.now()+'.json');
 const items=[];for(const id of ids){const promptFile=path.join(x.root,id+'-'+Date.now()+'.txt');await writeNew(promptFile,'按参考保留关系。\nline two "quote" $() `literal` '+id+' '+promptSuffix);items.push({id,panel_id:id,prompt_file:promptFile});}
 await writeNew(planFile,{items});return preparePanelBatch({...x,planFile,outputDirectory:path.join(x.root,'group-'+ids.join('-')+'-'+Date.now())});
}
const run=(x,g,mode)=>runPanelBatch({batchFile:g.batch_record,mode,mediaEntry:x.mediaEntry});
async function approve(x,g){for(const item of g.items){const current=(await panelStatus(x)).panels.find(i=>i.id===item.panel_id),observationsFile=path.join(x.root,item.id+'-observations.json'),reviewFile=path.join(x.root,item.id+'-input-review.json');await writeNew(observationsFile,{inspected:true,identity:'PASS',role:'PASS',clarity:'PASS',issues:[],evidence:'Synthetic fixture, not an actual product approval.'});await fillReview({templateFile:current.review_template_file,observationsFile,reviewFile});await reviewPanel({...x,panelId:item.panel_id,reviewFile});}}
async function events(x,type){return (await Promise.all((await fs.readdir(path.join(x.root,'events'))).map(n=>read(path.join(x.root,'events',n))))).filter(i=>i.type===type);}

test('four independent requests overlap, preserve argv, and a five-panel plan finishes as 4+1',async t=>{
 const x=await fixture(t,5,5),g=await group(x,['p0','p1','p2','p3']);assert.equal((await panelStatus(x)).requests_reserved,4);
 await assert.rejects(group(x,['p4']),{code:'ACTIVE_PANEL'});
 assert.equal((await run(x,g,'dry-run')).ok,true);const submitted=await run(x,g,'submit');assert.equal(submitted.ok,true);assert.equal(new Set(submitted.items.map(i=>i.task_id)).size,4);
 assert.equal((await run(x,g,'submit')).paid_action,false);assert.equal((await events(x,'submit')).length,4);
 const calls=await events(x,'submit');const peak=Math.max(...calls.map(a=>calls.filter(b=>b.start<=a.start&&b.end>a.start).length));assert.ok(peak>1&&peak<=4);
 for(const c of calls){assert.equal(c.args[c.args.indexOf('--count')+1],'1');assert.ok(c.args[c.args.indexOf('--prompt')+1].includes('\nline two "quote" $() `literal`'));}
 assert.equal((await run(x,g,'follow')).ok,true);await approve(x,g);
 await assert.rejects(group(x,['p0','p4']),{code:'BUDGET_EXHAUSTED'});assert.equal((await panelStatus(x)).requests_reserved,4);
 const tail=await group(x,['p4']);assert.equal(tail.group_size,1);await run(x,tail,'dry-run');await run(x,tail,'submit');await run(x,tail,'follow');await approve(x,tail);
 assert.ok((await panelStatus(x)).panels.every(i=>i.status==='accepted'));assert.equal((await events(x,'submit')).length,5);
});

test('unknown output and crash markers never cause repeat paid submissions, while other items retain IDs',async t=>{
 const x=await fixture(t,4,4),g=await group(x,['p0','p1','p2','p3'],'UNKNOWN');await run(x,g,'dry-run');
 const a=await run(x,g,'submit');assert.equal(a.ok,false);assert.ok(a.items.every(i=>i.status==='needs-reconciliation'));const before=(await events(x,'submit')).length;
 assert.equal((await run(x,g,'submit')).ok,false);assert.equal((await events(x,'submit')).length,before);assert.equal((await panelStatus(x)).requests_reserved,4);
 // History inspection by the caller supplies an existing ID; it does not generate.
 const item=g.items[0],execution=await read(item.execution.path),taskFile=path.join(x.root,'recovered.json');
 const task=(await Promise.all((await fs.readdir(x.root)).filter(n=>n.startsWith('t-')).map(n=>read(path.join(x.root,n))))).find(t=>t.output===execution.base_args[execution.base_args.indexOf('--output')+1]);
 await writeNew(taskFile,task);await attachPanel({...x,panelId:item.panel_id,taskFile});const resumed=await run(x,g,'follow');assert.ok(resumed.items[0].attached.task.task_id===task.task_id);assert.equal((await events(x,'submit')).length,before);
});

test('semantic process failure at exit zero blocks submit and reports each item',async t=>{
 const x=await fixture(t,4,4),g=await group(x,['p0','p1','p2','p3'],'FAIL_DRY');const result=await run(x,g,'dry-run');assert.equal(result.ok,false);assert.equal(result.items.length,4);
 await assert.rejects(run(x,g,'submit'),{code:'DRY_RUN_REQUIRED'});assert.equal((await events(x,'submit')).length,0);
 const bad=path.join(x.root,'mixed.mjs');await writeNew(bad,"console.log('{}');console.log('noise');");const r=await runCLI(bad,[]);assert.equal(r.ok,false);assert.equal(r.exit_code,0);assert.equal(r.protocol_error,'INVALID_JSON_OUTPUT');
});

test('group preflight enforces authorization, dependencies, distinct IDs and full budget before reservation',async t=>{
 const x=await fixture(t,4,4),file=path.join(x.root,'too-many.json');await writeNew(file,{items:Array.from({length:5},(_,i)=>({id:'p'+i,panel_id:'p'+i,prompt_file:'missing'}))});
 await assert.rejects(preparePanelBatch({...x,planFile:file,outputDirectory:path.join(x.root,'too-many')}),{code:'INVALID_BATCH'});assert.equal((await panelStatus(x)).requests_reserved,0);
 const prompt=path.join(x.root,'prompt.txt');await writeNew(prompt,'Synthetic prompt');const dependent=path.join(x.root,'dep.json');await writeNew(dependent,{items:[{id:'p0',panel_id:'p0',prompt_file:prompt,depends_on:['p1']}]});
 await assert.rejects(preparePanelBatch({...x,planFile:dependent,outputDirectory:path.join(x.root,'dep')}),{code:'DEPENDENCY_NOT_READY'});assert.equal((await panelStatus(x)).requests_reserved,0);
});

test('batch reference preparation persists templates, keeps all failures and exits nonzero through the actual CLI',async t=>{
 const x=await fixture(t),a=path.join(x.root,'crop.json');await writeNew(a,{source:x.image,source_kind:'page',crop:{left:0,top:0,width:900,height:500},protected_regions:[{kind:'product',left:10,top:10,width:100,height:100}],evidence:{inspected:true,note:'Synthetic crop.'}});
 const list=path.join(x.root,'refs.json');await writeNew(list,{items:[{id:'valid',plan:a},{id:'bad',plan:'missing.json'}]});
 const out=await prepareReferences({planFile:list,outputDirectory:path.join(x.root,'refs'),concurrency:4});assert.equal(out.ok,false);assert.equal(out.items.length,2);
 const good=out.items[0];assert.equal(good.ok,true,JSON.stringify(good));const saved=await read(good.preparation_record);assert.equal(saved.review_template.reference_sha256,(await read(good.record)).reference.sha256);assert.equal(saved.inspection_files.length,3);
 const obs=path.join(x.root,'observations.json'),reviewFile=path.join(x.root,'external-review.json');await writeNew(obs,{inspected:true,photo_only:true,retained_evidence:true,evidence:'Synthetic fixture visual declarations.'});await fillReview({templateFile:good.review_template_file,observationsFile:obs,reviewFile});
 assert.notEqual((await read(reviewFile)).source_sha256,(await read(reviewFile)).reference_sha256);
 const checks=path.join(x.root,'checks.json');await writeNew(checks,{items:[{id:'valid',reference_record:good.record,review:reviewFile},{id:'bad',reference_record:'missing.json'}]});const checked=await checkReferences({planFile:checks,outputDirectory:path.join(x.root,'checked')});assert.equal(checked.ok,false);assert.equal(checked.items[0].ready,true);
 const c=spawnSync(process.execPath,[scriptRoot,'reference','batch-check','--plan',checks,'--output-directory',path.join(x.root,'cli-check'),'--json'],{encoding:'utf8',env:{...process.env,PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK:'0'}});assert.equal(c.status,1);assert.equal(JSON.parse(c.stdout).items.length,2);
 const poison=path.join(x.root,'poison.json');await writeNew(poison,{source_sha256:'0'.repeat(64)});await assert.rejects(fillReview({templateFile:good.review_template_file,observationsFile:poison,reviewFile:path.join(x.root,'poison-review.json')}),{code:'UNKNOWN_FIELD'});
});

test('reference and panel reserved paths produce exact ownership diagnostics without another task',async t=>{
 const x=await fixture(t,4,4),g=await group(x,['p0']);await run(x,g,'dry-run');await run(x,g,'submit');await run(x,g,'follow');
 const execution=await read(g.items[0].execution.path),reserved=path.join(execution.round_directory,'review.json');const input={inspected:true,artifact_sha256:(await identity(path.join(execution.round_directory,'generated/original.png'))).sha256,identity:'PASS',role:'PASS',clarity:'PASS',issues:[],evidence:'Synthetic input.'};await writeNew(reserved,input);
 await assert.rejects(reviewPanel({...x,panelId:'p0',reviewFile:reserved}),e=>e.code==='REVIEW_INPUT_PATH_COLLISION'&&e.details.reserved_path===reserved);
 await assert.rejects(panelStatus(x),e=>e.code==='INVALID_PANEL_REVIEW_STATE'&&e.details.path===reserved);
 const outside=path.join(x.root,'review-input.json');await fs.rename(reserved,outside);await reviewPanel({...x,panelId:'p0',reviewFile:outside});assert.equal((await panelStatus(x)).panels[0].status,'accepted');assert.equal((await events(x,'submit')).length,1);
});

test('stage discovery batches declared read-only operations and preserves every structured receipt',async t=>{
 const x=await fixture(t);const r=await discoverStage({mediaEntry:x.mediaEntry,outputDirectory:path.join(x.root,'discovery')});assert.equal(r.ok,true);assert.equal(r.items.length,3);assert.equal((await events(x,'submit')).length,0);for(const item of r.items)assert.equal((await read(item.record)).exit_code,0);
 const values=await bounded([1,2,3,4,5],2,async x=>x*2);assert.deepEqual(values,[2,4,6,8,10]);
});

test('a crash intent blocks only its own submission; saved process output resumes attach without regeneration',async t=>{
 const x=await fixture(t,4,4),g=await group(x,['p0','p1','p2','p3']);await run(x,g,'dry-run');
 const started=path.join(path.dirname(g.batch_record),'runs/p0/interrupted');await fs.mkdir(started,{recursive:true});await writeNew(path.join(started,'started.json'),{mode:'submit',entry:x.mediaEntry});
 const first=await run(x,g,'submit');assert.equal(first.ok,false);assert.equal(first.items[0].error.code,'SUBMISSION_UNCERTAIN');assert.ok(first.items.slice(1).every(i=>i.task_id&&i.ok));assert.equal((await events(x,'submit')).length,3);
 await run(x,g,'submit');assert.equal((await events(x,'submit')).length,3);
 const execution=await read(g.items[0].execution.path),task={task_id:'recovered-original',model:'nano-banana-pro',requested_count:1,status:'running',output:execution.base_args[execution.base_args.indexOf('--output')+1]};
 // Simulates a result persisted just before an attach interruption.
 await writeNew(path.join(started,'process.json'),{ok:true,exit_code:0,data:{ok:true,task}});
 const resumed=await run(x,g,'submit');assert.equal(resumed.ok,true);assert.equal(resumed.paid_action,false);assert.equal(resumed.items[0].attached.task.task_id,task.task_id);assert.equal((await events(x,'submit')).length,3);
});

test('batch review consumes exact producer templates and keeps missing legacy template files recoverable',async t=>{
 const x=await fixture(t,4,4),g=await group(x,['p0','p1']);await run(x,g,'dry-run');await run(x,g,'submit');await run(x,g,'follow');
 const status=await panelStatus(x),items=[];
 for(const item of g.items){const observations=path.join(x.root,item.id+'-batch-observation.json');await writeNew(observations,{inspected:true,identity:'PASS',role:'PASS',clarity:'PASS',issues:[],evidence:'Synthetic test fixture only.'});items.push({id:item.id,panel_id:item.panel_id,observations});}
 await fs.rm(status.panels.find(p=>p.id==='p0').review_template_file);
 const planFile=path.join(x.root,'reviews.json');await writeNew(planFile,{items});const r=await reviewPanelBatch({...x,planFile,outputDirectory:path.join(x.root,'batch-reviews')});assert.equal(r.ok,true);assert.ok(r.items.every(i=>i.accepted));assert.equal((await events(x,'submit')).length,2);
});

test('batch reference review consumes persistent preparation without caller-supplied hashes',async t=>{
 const x=await fixture(t,4,4),plan=path.join(x.root,'crop-source.json');await writeNew(plan,{source:x.image,source_kind:'photo',protected_regions:[{kind:'product',left:5,top:5,width:100,height:100}],evidence:{inspected:true,note:'Synthetic source.'}});
 const list=path.join(x.root,'reference-list.json');await writeNew(list,{items:[{id:'photo',plan}]});const prep=await prepareReferences({planFile:list,outputDirectory:path.join(x.root,'preparations')});assert.equal(prep.ok,true);
 const observations=path.join(x.root,'photo-observations.json');await writeNew(observations,{inspected:true,photo_only:true,retained_evidence:true,evidence:'Synthetic crop inspection only.'});
 const planFile=path.join(x.root,'review-list.json');await writeNew(planFile,{items:[{id:'photo',preparation_record:prep.items[0].preparation_record,observations}]});
 const reviewed=await reviewReferences({planFile,outputDirectory:path.join(x.root,'reference-reviews')});assert.equal(reviewed.ok,true);assert.equal(reviewed.items[0].ready,true);assert.equal((await read(reviewed.items[0].review_file)).reference_sha256,prep.items[0].review_template.reference_sha256);
});

test('revoked project authorization blocks submit while existing task follow remains available',async t=>{
 const x=await fixture(t,4,4),g=await group(x,['p0']);await run(x,g,'dry-run');await run(x,g,'submit');
 const projectFile=path.join(x.projectDirectory,'project.json'),p=await read(projectFile);p.authorization.confirmed=false;await fs.writeFile(projectFile,JSON.stringify(p));
 await assert.rejects(run(x,g,'submit'),{code:'REFERENCE_CHANGED'});const followed=await run(x,g,'follow');assert.equal(followed.ok,true);assert.equal((await events(x,'submit')).length,1);
});

test('a changed original blocks group submission without consuming another reservation',async t=>{
 const x=await fixture(t,4,4),g=await group(x,['p0']);await run(x,g,'dry-run');await fs.appendFile(x.image,'changed');
 await assert.rejects(run(x,g,'submit'),{code:'REFERENCE_CHANGED'});assert.equal((await events(x,'submit')).length,0);assert.equal((await panelStatus(x)).requests_reserved,1);
});

test('process receipts preserve UTF-8 chunk boundaries, exit codes and timeouts',async t=>{
 const x=await fixture(t,4,4),bad=path.join(x.root,'exit-seven.mjs'),slow=path.join(x.root,'slow.mjs');
 await writeNew(bad,"console.log(JSON.stringify({ok:true}));process.exitCode=7;");const failed=await runCLI(bad,[]);assert.equal(failed.ok,false);assert.equal(failed.exit_code,7);assert.equal(processFailure(failed).exit_code,7);
 await writeNew(slow,'setTimeout(()=>console.log(JSON.stringify({ok:true})),1000);');const timeout=await runCLI(slow,[],{timeout:20});assert.equal(timeout.ok,false);assert.equal(timeout.timed_out,true);assert.equal(processFailure(timeout).code,'PROCESS_TIMEOUT');
 const unicode=path.join(x.root,'unicode.mjs');await writeNew(unicode,"const b=Buffer.from(JSON.stringify({ok:true,text:'产品'}));const k=b.indexOf(Buffer.from('产'))+1;process.stdout.write(b.subarray(0,k));setTimeout(()=>process.stdout.write(b.subarray(k)),10);");assert.equal((await runCLI(unicode,[])).data.text,'产品');
});


test('dead operation owners are recovered through a verified lock receipt without repeating an unknown submission',async t=>{
 const {operationStatus,unlockOperation}=await import('../skills/product-reference-replacement/scripts/operation-lock.mjs');
 const {locked}=await import('../skills/product-reference-replacement/scripts/common.mjs');
 const x=await fixture(t,4,4),g=await group(x,['p0']);await run(x,g,'dry-run');
 const directory=path.dirname(g.batch_record),common=new URL('../skills/product-reference-replacement/scripts/common.mjs',import.meta.url).href;
 const crash=spawnSync(process.execPath,['--input-type=module','-e',`import {locked,writeNew} from ${JSON.stringify(common)};import fs from 'node:fs/promises';import path from 'node:path';await locked(${JSON.stringify(directory)},async()=>{const p=path.join(${JSON.stringify(directory)},'runs/p0/crashed');await fs.mkdir(p,{recursive:true});await writeNew(path.join(p,'started.json'),{mode:'submit',entry:${JSON.stringify(x.mediaEntry)}});process.exit(17);});`],{encoding:'utf8'});
 assert.equal(crash.status,17,crash.stderr);const state=await operationStatus({operationDirectory:directory});assert.equal(state.verified,true);assert.equal(state.owner_alive,false);
 await assert.rejects(run(x,g,'submit'),{code:'LOCKED'});
 await assert.rejects(unlockOperation({operationDirectory:directory,lockId:'wrong'}),{code:'LOCK_ID_MISMATCH'});
 const recovered=await unlockOperation({operationDirectory:directory,lockId:state.owner.id});assert.equal(recovered.paid_action,false);assert.deepEqual(await read(recovered.backup),state.owner);assert.equal((await operationStatus({operationDirectory:directory})).locked,false);
 const cli=spawnSync(process.execPath,[scriptRoot,'operation','status','--directory',directory,'--json'],{encoding:'utf8',env:{...process.env,PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK:'0'}});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).locked,false);
 const retry=await run(x,g,'submit');assert.equal(retry.ok,false);assert.equal(retry.items[0].status,'needs-reconciliation');assert.equal((await events(x,'submit')).length,0);
 await locked(directory,async()=>{const live=await operationStatus({operationDirectory:directory});assert.equal(live.owner_alive,true);await assert.rejects(unlockOperation({operationDirectory:directory,lockId:live.owner.id}),{code:'LOCK_OWNER_ACTIVE'});});
 await writeNew(path.join(directory,'.operation-lock'),{pid:1});await assert.rejects(unlockOperation({operationDirectory:directory,lockId:'legacy'}),{code:'UNVERIFIED_LOCK'});assert.deepEqual(await read(path.join(directory,'.operation-lock')),{pid:1});
});
