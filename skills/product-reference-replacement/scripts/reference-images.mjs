import path from 'node:path';
import sharp from 'sharp';
import {check,read,writeNew,freshDir,identity,unchanged,knownFields,resolve,preflightOutputDirectory} from './common.mjs';
import {imageInfo} from './board.mjs';

const note=v=>typeof v==='string'&&v.trim().length>0;
const ROLES=['product','person','contact','scale_reference','scene','detail'];
const RATIOS=['1:1','16:9','9:16','4:3','3:4','21:9','3:2','2:3','5:4','4:5'];
function rect(c,m){knownFields(c,['left','top','width','height']);check(['left','top','width','height'].every(k=>Number.isInteger(c[k]))&&c.left>=0&&c.top>=0&&c.width>0&&c.height>0&&c.left+c.width<=m.width&&c.top+c.height<=m.height,'INVALID_CROP','Use a rectangle inside the EXIF-normalized original.');}
function regions(items,c,m){
 check(Array.isArray(items)&&items.length>0&&items.length<=100,'REFERENCE_EVIDENCE_REQUIRED','Declare the evidence regions that this reference must preserve.');
 for(const r of items){knownFields(r,['kind','left','top','width','height']);check(ROLES.includes(r.kind),'INVALID_REGION','Use a declared evidence role.');const b={left:r.left,top:r.top,width:r.width,height:r.height};rect(b,m);check(b.left>=c.left&&b.top>=c.top&&b.left+b.width<=c.left+c.width&&b.top+b.height<=c.top+c.height,'PROTECTED_REGION_CROPPED','The selected photo crop cuts a declared product, person, contact or scene region.');}
}
function template(r){return {inspected:false,source_sha256:r.source.sha256,reference_sha256:r.reference.sha256,photo_only:false,retained_evidence:false,evidence:''};}
export async function prepareReference({planFile,outputDirectory}){
 await preflightOutputDirectory(outputDirectory);
 const p=await read(planFile);knownFields(p,['source','source_kind','crop','protected_regions','evidence']);
 check(['photo','page'].includes(p.source_kind)&&p.evidence?.inspected===true&&note(p.evidence.note),'REFERENCE_EVIDENCE_REQUIRED','Actually inspect the source, distinguish photo/page, and explain the retained evidence.');
 const source=resolve(path.dirname(path.resolve(planFile)),p.source),m=await imageInfo(source),original=await identity(source);
 check(p.source_kind!=='page'||p.crop,'PHOTO_REGION_REQUIRED','Choose an evidenced photo rectangle before using a decorated page as a reference.');
 const crop=p.crop??{left:0,top:0,width:m.width,height:m.height};rect(crop,m);regions(p.protected_regions,crop,m);
 const pixels=await sharp(source).autoOrient().extract(crop).png().toBuffer();await unchanged(original);
 // Preview only: preserve the reference at native crop size; outline is never uploaded.
 const overlay=Buffer.from(`<svg width="${m.width}" height="${m.height}"><rect x="${crop.left}" y="${crop.top}" width="${crop.width}" height="${crop.height}" fill="none" stroke="#ef4444" stroke-width="3"/>${p.protected_regions.map(r=>`<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" fill="none" stroke="#0f9d58" stroke-width="2"/>`).join('')}</svg>`);
 const preview=await sharp(source).autoOrient().composite([{input:overlay}]).resize({width:Math.min(m.width,1600),withoutEnlargement:true}).png().toBuffer();
 const ratio_options=RATIOS.map(ratio=>{const [w,h]=ratio.split(':').map(Number),fit=Math.min((crop.width/crop.height)/(w/h),(w/h)/(crop.width/crop.height));return {ratio,photo_rectangle_fill_if_contained:fit};}).sort((a,b)=>b.photo_rectangle_fill_if_contained-a.photo_rectangle_fill_if_contained);
 await freshDir(outputDirectory);const reference=path.resolve(outputDirectory,'reference.png');await writeNew(reference,pixels);await writeNew(path.join(outputDirectory,'source-preview.png'),preview);
 const receipt={schema_version:'prepared-reference-1',source:{...original,...m},source_kind:p.source_kind,crop,protected_regions:p.protected_regions,evidence:p.evidence,transform:'exif-crop-no-resize',reference:{...await identity(reference),...await imageInfo(reference)},ratio_options,created_at:new Date().toISOString()};
 await writeNew(path.join(outputDirectory,'reference.json'),receipt);
 return {ok:true,paid_action:false,status:'awaiting-visual-review',record:path.resolve(outputDirectory,'reference.json'),reference:receipt.reference,preview:path.resolve(outputDirectory,'source-preview.png'),suggested_ratio:ratio_options[0].ratio,ratio_scope:'Advisory composition fit, not a provider capability or permission to crop further.',review_template:template(receipt),next_action:'Inspect original, outlined source preview and native reference; confirm photo-only content and complete retained evidence before board plan.'};
}
export async function checkReference({referenceFile,reviewFile}){
 const r=await read(referenceFile);check(r.schema_version==='prepared-reference-1'&&r.transform==='exif-crop-no-resize','INVALID_REFERENCE','Use the prepared reference receipt.');
 await unchanged(r.source);await unchanged(r.reference);const m=await imageInfo(r.source.path),v=await imageInfo(r.reference.path);rect(r.crop,m);regions(r.protected_regions,r.crop,m);
 check(v.width===r.crop.width&&v.height===r.crop.height&&v.width===r.reference.width&&v.height===r.reference.height,'REFERENCE_RESIZED','A prepared reference retains native crop dimensions.');
 if(!reviewFile)return {ok:true,ready:false,reference:r.reference,review_template:template(r),next_action:'Actually inspect original and prepared image, then fill this review template.'};
 const review=await read(reviewFile);knownFields(review,Object.keys(template(r)));
 check(review.inspected===true&&review.source_sha256===r.source.sha256&&review.reference_sha256===r.reference.sha256&&review.photo_only===true&&review.retained_evidence===true&&note(review.evidence),'REFERENCE_REVIEW_REQUIRED','Confirm this exact crop is a clean photo and preserves the required visible evidence. If that is impossible, keep the source and report the gap.');
 return {ok:true,ready:true,reference:{...r.reference,preparation:{record:await identity(referenceFile),review:await identity(reviewFile),source:r.source,crop:r.crop,protected_regions:r.protected_regions}},ratio_options:r.ratio_options};
}
export async function resolvePanelReference(base,value){
 if(typeof value==='string'){const f=resolve(base,value);return {...await identity(f),...await imageInfo(f)};}
 knownFields(value,['prepared','review']);check(note(value.prepared)&&note(value.review),'REFERENCE_REVIEW_REQUIRED','Prepared references require both receipt and visual review.');
 return (await checkReference({referenceFile:resolve(base,value.prepared),reviewFile:resolve(base,value.review)})).reference;
}
export async function unchangedPanelReference(r){
 await unchanged(r);
 if(r.preparation){for(const v of [r.preparation.source,r.preparation.record,r.preparation.review])await unchanged(v);}
}
