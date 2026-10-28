import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..'),entry=path.join(root,'bin/product-reference-replacement.mjs');
async function setup(t){
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'panel-plan-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));
 const ref=path.join(d,'产品 原图.png');await sharp({create:{width:100,height:100,channels:3,background:'#446688'}}).png().toFile(ref);
 const plan={product_id:'fixture',variant:'synthetic',template_id:'generic',width:3840,height:2160,panels:[['overall',1536,2048,'3:4'],['scale',1600,2000,'4:5'],['use-state',1600,1600,'1:1'],['texture',1600,1600,'1:1'],['alternate',1600,2000,'4:5']].map(([role,width,height,ratio],n)=>({id:'p'+n,label:role,role,intent:'Synthetic deterministic fixture',width,height,ratio,resolution:'2K',references:[ref],evidence:{inspected:true,note:'Synthetic fixture, not a product claim'}}))};
 return {d,ref,plan};
}
async function write(x,name,value){const file=path.join(x.d,name);await fs.writeFile(file,JSON.stringify(value),{flag:'wx'});return file;}
function cli(...args){const r=spawnSync(process.execPath,[entry,...args,'--json'],{encoding:'utf8',env:{...process.env,PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK:'0'},timeout:30000});return {status:r.status,data:JSON.parse(r.stdout||r.stderr)};}
test('real CLI aggregates missing budget with every automatic-placement size failure without changing inputs or creating a project',async t=>{
 const x=await setup(t),file=await write(x,'draft.json',x.plan),before=await fs.readFile(file),names=await fs.readdir(x.d);
 const r=cli('board','check-plan','--plan',file);assert.equal(r.status,1);assert.equal(r.data.project_created,false);assert.equal(r.data.paid_action,false);
 assert.ok(r.data.issues.some(i=>i.path==='$.authorization'&&i.code==='INVALID_BUDGET'));
 const failures=r.data.issues.filter(i=>i.code==='INSUFFICIENT_RESOLUTION');assert.deepEqual(failures.map(i=>i.panel_id),['p0','p1']);
 assert.deepEqual(failures.map(i=>[i.required.minimum_width,i.required.minimum_height]),[[1542,2115],[1646,2115]]);
 for(const i of failures){const suggested=i.required.suggested_minimum_target;assert.ok(suggested.width>=i.required.minimum_width);assert.ok(suggested.height>=i.required.minimum_height);assert.equal(suggested.ratio,x.plan.panels.find(p=>p.id===i.panel_id).ratio);}
 assert.deepEqual(await fs.readdir(x.d),names);assert.deepEqual(await fs.readFile(file),before);
 const output=path.join(x.d,'project'),planned=cli('board','plan','--plan',file,'--output-directory',output);
 assert.equal(planned.status,1);assert.equal(planned.data.error.code,'INVALID_BUDGET');assert.equal(planned.data.error.details.issues.length,r.data.issues.length);await assert.rejects(fs.stat(output),{code:'ENOENT'});
});
test('draft authorization permits planning only; recovered ratio-compatible targets are explicit caller edits',async t=>{
 const x=await setup(t);x.plan.authorization={confirmed:false,evidence:'Synthetic pending authorization',max_requests:8};
 const original=await write(x,'small.json',x.plan),r=cli('board','check-plan','--plan',original);assert.equal(r.status,1);
 for(const req of r.data.layout.layout_search.attempts[0].requirements){const p=x.plan.panels.find(i=>i.id===req.panel_id);if(!req.sufficient)Object.assign(p,{width:req.suggested_minimum_target.width,height:req.suggested_minimum_target.height});}
 const revised=await write(x,'revised.json',x.plan),checked=cli('board','check-plan','--plan',revised);assert.equal(checked.status,0);assert.equal(checked.data.valid,true);
 const project=path.join(x.d,'project'),created=cli('board','plan','--plan',revised,'--output-directory',project);assert.equal(created.status,0);
 const saved=JSON.parse(await fs.readFile(path.join(project,'project.json'),'utf8'));assert.deepEqual(saved.authorization,x.plan.authorization);assert.ok(saved.panels.every(p=>p.resolution==='2K'));
 const prompt=path.join(x.d,'prompt.txt');await fs.writeFile(prompt,'Synthetic prompt',{flag:'wx'});
 const blocked=cli('panel','prepare','--project',project,'--panel-id','p0','--prompt-file',prompt);assert.equal(blocked.data.error.code,'PAID_ACTION_NOT_AUTHORIZED');
 assert.equal(cli('board','status','--project',project).data.requests_reserved,0);await assert.rejects(fs.stat(path.join(project,'panels')),{code:'ENOENT'});
});
test('all independent structural/reference problems are reported with field paths',async t=>{
 const x=await setup(t);x.plan.variant='';x.plan.panels[0].label='';x.plan.panels[1].evidence={inspected:false};x.plan.panels[2].references=[path.join(x.d,'missing.png')];x.plan.panels[3].references=[];x.plan.authorization={confirmed:false,max_requests:1};
 const file=await write(x,'invalid.json',x.plan),r=cli('board','check-plan','--plan',file);assert.equal(r.status,1);
 for(const field of ['$.variant','$.authorization.max_requests','$.authorization.evidence','$.panels[0].label','$.panels[1].evidence','$.panels[2].references[0]','$.panels[3].references'])assert.ok(r.data.issues.some(i=>i.path===field),field);
 assert.ok(r.data.issues.every(i=>'current'in i&&'required'in i));
});
test('manual placement stays fixed; insufficient dimensions and budgets remain strict with no project writes',async t=>{
 const x=await setup(t);x.plan.width=1920;x.plan.height=1080;x.plan.padding=2;x.plan.label_height=20;x.plan.authorization={confirmed:false,evidence:'Synthetic pending scope',max_requests:4};
 x.plan.panels=x.plan.panels.slice(0,4).map((p,n)=>({...p,width:1024,height:576,ratio:'16:9',box:{x:n%2*960,y:Math.floor(n/2)*540,width:960,height:540}}));
 const file=await write(x,'manual.json',x.plan),r=cli('board','check-plan','--plan',file);assert.equal(r.status,0);assert.equal(r.data.layout.mode,'manual');assert.deepEqual(r.data.layout.panels.map(p=>p.box),x.plan.panels.map(p=>p.box));
 x.plan.panels[0].width=512;x.plan.panels[0].height=288;x.plan.authorization.max_requests=1;
 const invalid=await write(x,'manual-small.json',x.plan),out=path.join(x.d,'refused'),bad=cli('board','plan','--plan',invalid,'--output-directory',out);
 assert.equal(bad.status,1);assert.ok(bad.data.error.details.issues.some(i=>i.code==='INSUFFICIENT_RESOLUTION'&&i.panel_id==='p0'));assert.ok(bad.data.error.details.issues.some(i=>i.code==='INVALID_BUDGET'));await assert.rejects(fs.stat(out),{code:'ENOENT'});
});
test('complete bundled draft example is executable after supplying inspected real input evidence',async t=>{
 const x=await setup(t),example=JSON.parse(await fs.readFile(path.join(root,'skills/product-reference-replacement/references/examples/panel-plan.json'),'utf8'));
 assert.equal(example.authorization.confirmed,false);
 for(const p of example.panels){assert.equal(p.evidence.inspected,false);p.references=[x.ref];p.evidence={inspected:true,note:'Synthetic fixture inspection declaration'};}
 const file=await write(x,'example.json',example),r=cli('board','check-plan','--plan',file);assert.equal(r.status,0);assert.equal(r.data.valid,true);assert.equal(r.data.layout.requirements.length,4);
});
test('rejected alternatives identify their own fields and preserve unsupported target requirements',async t=>{
 const x=await setup(t);x.plan.authorization={confirmed:false,evidence:'Synthetic pending',max_requests:5};
 x.plan.layout_candidates=[{panels:x.plan.panels.map(p=>({id:p.id,width:p.width,height:p.height,ratio:p.ratio}))}];
 const file=await write(x,'candidate.json',x.plan),r=cli('board','check-plan','--plan',file);assert.equal(r.status,1);
 assert.ok(r.data.issues.some(i=>i.path==='$.layout_candidates[0].panels[0]'&&i.code==='INSUFFICIENT_RESOLUTION'));
 assert.equal(r.data.layout.layout_search.attempts.length,2);
 assert.deepEqual(x.plan.panels.map(p=>p.resolution),Array(5).fill('2K'));
});
