import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ROOT,check,read,writeNew,freshDir,identity,integer,safeId,escapeText,resolve,hash,unchanged,knownFields,preflightOutputDirectory,reviewFields} from './common.mjs';
import {denseLayout,metrics,TEMPLATES} from './board-layout.mjs';
export const FONT=path.join(ROOT,'assets/fonts/NotoSansCJKsc-Regular.otf');
process.env.FONTCONFIG_FILE??=path.join(ROOT,'assets/fonts/fonts.conf');
export async function imageInfo(p){const m=await sharp(p,{failOn:'error'}).metadata();check(!m.pages||m.pages===1,'INVALID_IMAGE','Static images are required.');return {width:m.autoOrient?.width??([5,6,7,8].includes(m.orientation)?m.height:m.width),height:m.autoOrient?.height??([5,6,7,8].includes(m.orientation)?m.width:m.height),format:m.format};}
export async function label(text,width,height){check(typeof text==='string'&&text.trim().length>0&&text.length<=100,'INVALID_LABEL','Expected a short panel label.');return sharp({text:{text:escapeText(text),font:'Noto Sans CJK SC',fontfile:FONT,width,height,rgba:true,align:'left',wrap:'word-char'}}).png().toBuffer();}
export async function renderBoard({planFile,outputDirectory}){
 await preflightOutputDirectory(outputDirectory);
 const plan=await read(planFile),base=path.dirname(path.resolve(planFile)),W=plan.width??3840,H=plan.height??2160;
 knownFields(plan,['product_id','variant','width','height','padding','label_height','panels','layout','template_id']);
 check(plan.layout===undefined||['manual','dense'].includes(plan.layout),'INVALID_PLAN','layout is manual or dense.');
 const dense=plan.layout==='dense';
 check(integer(W,640,7680)&&integer(H,360,4320)&&W*9===H*16,'INVALID_PLAN','Board dimensions must be exact 16:9, between 640x360 and 7680x4320.');
 check(safeId(plan.product_id)&&typeof plan.variant==='string'&&plan.variant.trim(),'INVALID_PLAN','product_id and explicit variant are required.');
 check(Array.isArray(plan.panels)&&plan.panels.length>=2&&plan.panels.length<=16,'INVALID_PLAN','Specify 2–16 evidence panels; panel count is chosen by the Agent.');
 const ids=new Set(),prepared=[],margin=plan.padding??(dense?Math.max(2,Math.round(W/960)):Math.max(8,Math.round(W/240))),titleHeight=plan.label_height??(dense?Math.max(20,Math.round(H/65)):Math.max(20,Math.round(H/22)));
 check(integer(margin,0,100)&&integer(titleHeight,20,180),'INVALID_PLAN','Invalid padding or label height.');
 if(dense){
  check(TEMPLATES.includes(plan.template_id),'INVALID_TEMPLATE','Choose a declared product template.');
  for(const p of plan.panels){check(!p.box,'PLACEMENT_CONFLICT','Dense layout computes boxes; use manual layout to keep explicit placement.');const m=await imageInfo(resolve(base,p.source));p.crop??={left:0,top:0,width:m.width,height:m.height};check(integer(p.crop.width,1,m.width)&&integer(p.crop.height,1,m.height),'INVALID_CROP','Positive source crop dimensions required.');}
  check(plan.panels.some(p=>p.role==='overall')&&plan.panels.some(p=>p.role==='scale'),'EVIDENCE_MISSING','Dense asset boards require overall and whole-product scale reference panels.');
  plan.panels=denseLayout(plan.panels,W,H,margin,titleHeight).panels;
 }
 for(const p of plan.panels){
  knownFields(p,['id','label','role','source','crop','box','evidence','protected_regions']);
  check(safeId(p.id)&&!ids.has(p.id),'INVALID_PLAN','Panel IDs must be unique safe identifiers.');ids.add(p.id);
  check(typeof p.role==='string'&&p.role.trim()&&typeof p.label==='string'&&p.label.trim(),'INVALID_PLAN','Each panel needs its evidence role and truthful label.');
  check(!dense||p.label.length<=24,'INVALID_LABEL','Use a short dense-board label of at most 24 characters.');
  const b=p.box;check(b&&['x','y','width','height'].every(k=>Number.isInteger(b[k]))&&b.x>=0&&b.y>=0&&b.width>margin*2+30&&b.height>titleHeight+margin*3+30&&b.x+b.width<=W&&b.y+b.height<=H,'INVALID_PLAN','Panel box is invalid or outside the board.');
  for(const other of prepared){const a=other.box;check(b.x>=a.x+a.width||a.x>=b.x+b.width||b.y>=a.y+a.height||a.y>=b.y+b.height,'OVERLAPPING_PANELS','Panel boxes may not overlap.');}
  const source=resolve(base,p.source),m=await imageInfo(source),ref=await identity(source),c=p.crop??{left:0,top:0,width:m.width,height:m.height};
  knownFields(b,['x','y','width','height']);knownFields(c,['left','top','width','height']);
  check(['left','top','width','height'].every(k=>Number.isInteger(c[k]))&&c.left>=0&&c.top>=0&&c.width>0&&c.height>0&&c.left+c.width<=m.width&&c.top+c.height<=m.height,'INVALID_CROP','Crop must fit the EXIF-normalized source.');
  if(dense){check(p.evidence?.inspected===true&&p.evidence.supports_role===true&&typeof p.evidence.note==='string'&&p.evidence.note.trim(),'EVIDENCE_REQUIRED','Record actual visual evidence for each selected role.');}
  const regions=p.protected_regions??[];check(Array.isArray(regions),'INVALID_REGION','protected_regions is an array in source coordinates.');
  for(const r of regions){knownFields(r,['kind','left','top','width','height']);check(['product','scale_reference','detail'].includes(r.kind)&&['left','top','width','height'].every(k=>Number.isInteger(r[k]))&&r.width>0&&r.height>0&&r.left>=c.left&&r.top>=c.top&&r.left+r.width<=c.left+c.width&&r.top+r.height<=c.top+c.height,'PROTECTED_REGION_CROPPED','Crop must retain the complete declared product/reference region.');}
  if(dense&&['overall','scale'].includes(p.role)){check(regions.some(r=>r.kind==='product')&&(p.role!=='scale'||regions.some(r=>r.kind==='scale_reference')),'PROTECTED_REGION_REQUIRED','Declare the full product and, for scale, its recognizable reference region.');}
  const crop=await sharp(source).autoOrient().extract(c).png().toBuffer(),iw=b.width-2*margin,ih=b.height-titleHeight-3*margin;
  const content=await sharp(crop).resize(iw,ih,{fit:'contain',background:'#ffffff',withoutEnlargement:false}).png().toBuffer();
  const text=await label(`${p.id.toUpperCase()}  ${p.label}`,iw,titleHeight),tm=await sharp(text).metadata();
  prepared.push({...p,source,box:b,crop:c,source_identity:ref,source_dimensions:m,png:crop,content,text,text_height:tm.height,upscaled:c.width<iw&&c.height<ih});
 }
 const layers=prepared.flatMap(p=>[{input:p.text,left:p.box.x+margin,top:p.box.y+margin},{input:p.content,left:p.box.x+margin,top:p.box.y+titleHeight+2*margin}]);
 const board=await sharp({create:{width:W,height:H,channels:3,background:'#ffffff'}}).composite(layers).png().toBuffer();
 for(const p of prepared)await unchanged(p.source_identity);
 await freshDir(outputDirectory);await fs.mkdir(path.join(outputDirectory,'crops'));
 const panels=[];
 for(const p of prepared){const file=path.join(outputDirectory,'crops',p.id+'.png');await writeNew(file,p.png);panels.push({id:p.id,label:p.label,role:p.role,source:p.source_identity,source_dimensions:p.source_dimensions,crop:p.crop,box:p.box,evidence:p.evidence??null,protected_regions:p.protected_regions??[],crop_file:path.resolve(file),crop_sha256:hash(p.png),upscaled:p.upscaled});}
 const file=path.join(outputDirectory,'product-asset-board.png');await writeNew(file,board);
 await fs.mkdir(path.join(outputDirectory,'previews'));const previews=[];for(const width of [1600,1920]){const preview=path.join(outputDirectory,'previews',width+'.png');await writeNew(preview,await sharp(board).resize({width}).png().toBuffer());previews.push({width,...await identity(preview)});}
 const geometry=metrics(panels,W,H,margin,titleHeight),missing=['overall','scale'].filter(role=>!panels.some(p=>p.role===role));
 const result={schema_version:'1.0.0',product_id:plan.product_id,variant:plan.variant,layout:dense?'dense':'manual',template_id:plan.template_id??null,padding:margin,label_height:titleHeight,board:{...await identity(file),width:W,height:H},panels,previews,geometry,technical_pass:geometry.photo_area_fraction>=.9&&missing.length===0,missing_roles:missing,status:'draft',requires_user_approval:true,warnings:panels.filter(p=>p.upscaled).map(p=>`${p.id}: displayed larger than source crop; no extra detail was created.`)};
 await writeNew(path.join(outputDirectory,'board-plan.json'),{...plan,layout:'manual',padding:margin,label_height:titleHeight});await writeNew(path.join(outputDirectory,'sources-manifest.json'),result);return {ok:true,...result};
}
export async function registerAsset({image,record,reviewFile,imported=false}){
 const review=await read(reviewFile),m=await imageInfo(image),ref=await identity(image);
 check(Math.abs(m.width/m.height/(16/9)-1)<=.01,'INVALID_ASSET_RATIO','Product asset board must be 16:9 (at most 1% rounding tolerance).');
 check(review.inspected===true&&safeId(review.asset_id)&&typeof review.variant==='string'&&review.variant.trim()&&Array.isArray(review.coverage)&&review.coverage.length>0&&review.coverage.every(v=>typeof v==='string'&&v.trim()),'REVIEW_REQUIRED','Inspection, asset_id, variant and coverage are required.');
 check(imported?review.provided_for_use===true:review.user_approved===true,'APPROVAL_REQUIRED',imported?'Confirm the user supplied this asset for use.':'Record actual user satisfaction before freezing a draft.');
 check(typeof review.approval_evidence==='string'&&review.approval_evidence.trim(),'APPROVAL_REQUIRED','Reference the real user message authorizing asset use/approval.');
 if(!imported){check(typeof review.board_directory==='string','BOARD_CHECK_REQUIRED','Created assets require the rendered board_directory and visual review before freeze.');const qa=await checkBoard({boardDirectory:review.board_directory,reviewFile});check(qa.ready_for_user&&qa.board.sha256===ref.sha256,'BOARD_CHECK_FAILED','Freeze requires a matching board that passed coverage, geometry and actual visual review.');}
 const a={schema_version:'1.0.0',asset_id:review.asset_id,version:review.version??1,origin:imported?'provided':'created',status:'approved',board:{...ref,...m},variant:review.variant,coverage:review.coverage,gaps:review.gaps??[],approval_evidence:review.approval_evidence,created_at:new Date().toISOString()};
 check(integer(a.version,1,100000),'INVALID_INPUT','Asset version must be a positive integer.');await writeNew(record,a);return {ok:true,asset_record:path.resolve(record),asset:a,next_action:imported?'Confirm single/batch scope, then create job.':'Ask whether to start replacement; request scene images if absent, or confirm the existing image scope.'};
}

export async function checkBoard({boardDirectory,reviewFile}){
 const m=await read(path.join(boardDirectory,'sources-manifest.json'));await unchanged(m.board);
 for(const p of m.previews??[])await unchanged(p);
 for(const p of m.panels){await unchanged(p.source);check(hash(await fs.readFile(p.crop_file))===p.crop_sha256,'REFERENCE_CHANGED','Source crop changed after rendering.');}
 const plan=await read(path.join(boardDirectory,'board-plan.json')),W=m.board.width,H=m.board.height;
 const g=metrics(m.panels,W,H,m.padding??plan.padding??Math.max(8,Math.round(W/240)),m.label_height??plan.label_height??Math.max(20,Math.round(H/22)));
 const missing=['overall','scale'].filter(role=>!m.panels.some(p=>p.role===role));
 const technical=g.photo_area_fraction>=.9&&missing.length===0;
 const template={inspected:false,artifact_sha256:m.board.sha256,labels_match:false,identity_match:false,reference_clear:false,role_verdicts:Object.fromEntries([...new Set(m.panels.map(p=>p.role))].map(role=>[role,'UNCERTAIN'])),previews:[1600,1920].map(width=>({width,inspected:false,readable:false})),evidence:''};
 let visual=false;
 if(reviewFile){const v=await read(reviewFile);reviewFields(v,Object.keys(template),template);check(v.artifact_sha256===m.board.sha256,'REVIEW_MISMATCH','artifact_sha256 differs from the verified board. Run board check without --review for its current review_template.');visual=[1600,1920].every(w=>m.previews?.some(p=>p.width===w))&&v.inspected===true&&v.labels_match===true&&v.identity_match===true&&v.reference_clear===true&&['overall','scale'].every(r=>v.role_verdicts?.[r]==='PASS')&&m.panels.every(p=>v.role_verdicts?.[p.role]==='PASS')&&[1600,1920].every(w=>v.previews?.some(p=>p.width===w&&p.inspected===true&&p.readable===true))&&typeof v.evidence==='string'&&v.evidence.trim().length>0;}
 return {ok:true,board:m.board,geometry:g,missing_roles:missing,technical_pass:technical,visual_pass:visual,ready_for_user:technical&&visual,status:!technical?'needs-input':visual?'ready-for-user':'needs-review',review_template:template,next_action:!technical?'Adjust selected evidence/layout; preserve all complete product/reference regions.':visual?'Show the actual board image and wait for real user satisfaction.':'Inspect the board, roles and 1600/1920-wide previews, then fill review_template with real visual judgments; preserve its artifact_sha256.'};
}
