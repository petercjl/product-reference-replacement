import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {prepareReference,checkReference} from '../skills/product-reference-replacement/scripts/reference-images.mjs';
import {planPanels,preparePanel,panelStatus} from '../skills/product-reference-replacement/scripts/panel-assets.mjs';
import {main} from '../skills/product-reference-replacement/scripts/product-assets.mjs';
import {hash,writeNew} from '../skills/product-reference-replacement/scripts/common.mjs';
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photo-reference-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=path.join(dir,'页面照片.png'),photo=await sharp({create:{width:800,height:600,channels:3,background:'#7590ab'}}).png().toBuffer();
 await sharp({create:{width:1000,height:800,channels:3,background:'white'}}).composite([{input:photo,left:100,top:100}]).png().toFile(source);
 const plan={source,source_kind:'page',crop:{left:100,top:100,width:800,height:600},protected_regions:[{kind:'product',left:250,top:200,width:300,height:200},{kind:'person',left:600,top:200,width:120,height:450},{kind:'contact',left:520,top:280,width:140,height:70}],evidence:{inspected:true,note:'Synthetic photo-region fixture, not a real visual declaration.'}};
 const planFile=path.join(dir,'plan.json');await writeNew(planFile,plan);return {dir,source,plan,planFile,outputDirectory:path.join(dir,'prepared')};
}
async function approved(x){
 const r=await prepareReference(x),reviewFile=path.join(x.dir,'review.json');
 await writeNew(reviewFile,{...r.review_template,inspected:true,photo_only:true,retained_evidence:true,evidence:'Synthetic fixture declaration only.'});
 return {...r,reviewFile,...await checkReference({referenceFile:r.record,reviewFile})};
}
async function planned(x,r){
 const plan={product_id:'fixture',variant:'synthetic',template_id:'generic',width:1920,height:1080,padding:2,label_height:20,authorization:{confirmed:true,evidence:'Synthetic local preparation only; no service call.',max_requests:4},panels:['overall','scale','detail','alternate'].map((role,k)=>({id:'p'+k,label:role,role,intent:'synthetic panel',width:1024,height:576,ratio:'16:9',resolution:'2K',references:[{prepared:r.record,review:r.reviewFile}],evidence:{inspected:true,note:'Synthetic evidence only.'},box:{x:k%2*960,y:Math.floor(k/2)*540,width:960,height:540}}))};
 const planFile=path.join(x.dir,'panels.json'),projectDirectory=path.join(x.dir,'project');await writeNew(planFile,plan);await planPanels({planFile,outputDirectory:projectDirectory});return projectDirectory;
}
test('page preparation preserves crop pixels, original bytes and native dimensions, then needs actual review',async t=>{
 const x=await fixture(t),before=hash(await fs.readFile(x.source));
 const r=await prepareReference(x);assert.equal(r.paid_action,false);assert.equal(r.status,'awaiting-visual-review');assert.deepEqual([r.reference.width,r.reference.height],[800,600]);
 assert.deepEqual(await sharp(r.reference.path).raw().toBuffer(),await sharp(x.source).autoOrient().extract(x.plan.crop).raw().toBuffer());assert.equal(hash(await fs.readFile(x.source)),before);assert.equal(r.suggested_ratio,'4:3');
 const unchecked=await checkReference({referenceFile:r.record});assert.equal(unchecked.ready,false);const reviewFile=path.join(x.dir,'unseen.json');await writeNew(reviewFile,r.review_template);
 await assert.rejects(checkReference({referenceFile:r.record,reviewFile}),{code:'REFERENCE_REVIEW_REQUIRED'});
 await assert.rejects(prepareReference(x),{code:'OUTPUT_EXISTS'});
});
test('invalid crop, cropped contact/person, missing photo region and uninspected source fail before output',async t=>{
 const x=await fixture(t);
 for(const [n,change,code]of [['bounds',p=>p.crop.width=2000,'INVALID_CROP'],['person',p=>p.crop.height=400,'PROTECTED_REGION_CROPPED'],['contact',p=>p.protected_regions.push({kind:'contact',left:40,top:120,width:90,height:90}),'PROTECTED_REGION_CROPPED'],['page',p=>delete p.crop,'PHOTO_REGION_REQUIRED'],['unseen',p=>p.evidence.inspected=false,'REFERENCE_EVIDENCE_REQUIRED']]){
  const p=structuredClone(x.plan);change(p);const planFile=path.join(x.dir,n+'.json'),outputDirectory=path.join(x.dir,n);await writeNew(planFile,p);await assert.rejects(prepareReference({planFile,outputDirectory}),{code});await assert.rejects(fs.stat(outputDirectory),{code:'ENOENT'});
 }
});
test('plain white photographs stay complete; no color-based trim or resampling',async t=>{
 const x=await fixture(t);await fs.writeFile(x.source,await sharp({create:{width:1000,height:800,channels:3,background:'white'}}).png().toBuffer());x.plan.source_kind='photo';delete x.plan.crop;const f=path.join(x.dir,'photo.json');await writeNew(f,x.plan);
 const r=await prepareReference({...x,planFile:f});assert.deepEqual([r.reference.width,r.reference.height],[1000,800]);assert.deepEqual(await sharp(r.reference.path).raw().toBuffer(),await sharp(x.source).raw().toBuffer());
});
test('EXIF orientation precedes coordinates and native crop extraction',async t=>{
 const x=await fixture(t),source=path.join(x.dir,'rotated.jpg');await sharp({create:{width:400,height:600,channels:3,background:'#aabbcc'}}).jpeg().withMetadata({orientation:6}).toFile(source);
 const plan={source,source_kind:'page',crop:{left:50,top:40,width:400,height:300},protected_regions:[{kind:'product',left:100,top:100,width:200,height:100}],evidence:{inspected:true,note:'Synthetic EXIF fixture.'}};
 const planFile=path.join(x.dir,'exif.json');await writeNew(planFile,plan);const r=await prepareReference({...x,planFile});assert.deepEqual([r.reference.width,r.reference.height],[400,300]);assert.deepEqual(await sharp(r.reference.path).raw().toBuffer(),await sharp(source).autoOrient().extract(plan.crop).raw().toBuffer());
});
test('panel request sends cropped reference only while retaining original lineage and ordered flags',async t=>{
 const x=await fixture(t),r=await approved(x),projectDirectory=await planned(x,r),promptFile=path.join(x.dir,'prompt.txt');await writeNew(promptFile,'Use image 1 for the scene; preserve reference relationships.');
 const out=await main(['panel','prepare','--project',projectDirectory,'--panel-id','p0','--prompt-file',promptFile]);assert.equal(out.paid_action,false);
 const refs=out.submit_args.filter((s,k)=>out.submit_args[k-1]==='--reference');assert.deepEqual(refs,[r.reference.path]);assert.ok(!out.submit_args.includes(x.source));assert.equal(out.submit_args[out.submit_args.indexOf('--count')+1],'1');
 const saved=JSON.parse(await fs.readFile(path.join(out.round_directory,'request.json'),'utf8'));assert.equal(saved.references[0].preparation.source.path,x.source);assert.deepEqual(saved.references[0].preparation.crop,x.plan.crop);
 await assert.rejects(preparePanel({projectDirectory,panelId:'p1',promptFile}),{code:'ACTIVE_PANEL'});
});
test('changed original, crop, preparation receipt or review blocks reservation without spending budget',async t=>{
 for(const kind of ['source','reference','record','review']){
  const x=await fixture(t),r=await approved(x),projectDirectory=await planned(x,r),promptFile=path.join(x.dir,'prompt.txt');await writeNew(promptFile,'Synthetic prompt.');
  const file={source:x.source,reference:r.reference.path,record:r.record,review:r.reviewFile}[kind];await fs.appendFile(file,' ');
  await assert.rejects(preparePanel({projectDirectory,panelId:'p0',promptFile}),{code:'REFERENCE_CHANGED'});assert.equal((await panelStatus({projectDirectory})).requests_reserved,0);
 }
});
test('page remnants or wrong bound review cannot enter a fixed panel plan',async t=>{
 const x=await fixture(t),r=await prepareReference(x),reviewFile=path.join(x.dir,'not-clean.json');await writeNew(reviewFile,{...r.review_template,inspected:true,photo_only:false,retained_evidence:true,evidence:'Residual page corner is still visible.'});
 await assert.rejects(planned(x,{...r,reviewFile}),{code:'REFERENCE_REVIEW_REQUIRED'});await assert.rejects(fs.stat(path.join(x.dir,'project')),{code:'ENOENT'});
});
