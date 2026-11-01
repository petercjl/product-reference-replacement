import path from 'node:path';
import {check,read,writeNew,resolve,knownFields} from './common.mjs';
import {prepareReference,checkReference} from './reference-images.mjs';
import {reportBatch} from './batch-tools.mjs';
import fs from 'node:fs/promises';

export const prepareReferences=options=>reportBatch({...options,fields:['plan'],operation:(item,base,outputDirectory)=>prepareReference({planFile:resolve(base,item.plan),outputDirectory})});
export const checkReferences=options=>reportBatch({...options,fields:['reference_record','review'],operation:(item,base)=>checkReference({referenceFile:resolve(base,item.reference_record),reviewFile:item.review?resolve(base,item.review):undefined})});
export const reviewReferences=options=>reportBatch({...options,fields:['preparation_record','observations'],operation:async(item,base,directory)=>{
 const preparation=await read(resolve(base,item.preparation_record));
 check(preparation.ok===true&&typeof preparation.record==='string'&&typeof preparation.review_template_file==='string','INVALID_PREPARATION','Consume the original preparation_record returned by reference batch-prepare.');
 const expected=await checkReference({referenceFile:preparation.record}),saved=await read(preparation.review_template_file);
 check(JSON.stringify(expected.review_template)===JSON.stringify(saved),'REVIEW_TEMPLATE_CHANGED','Preserve the CLI template and put visual judgments in a separate observations file.');
 await fs.mkdir(directory);const reviewFile=path.join(directory,'inputs','review.json');
 await fillReview({templateFile:preparation.review_template_file,observationsFile:resolve(base,item.observations),reviewFile});
 try{return {...await checkReference({referenceFile:preparation.record,reviewFile}),review_file:reviewFile};}
 catch(error){error.details={...error.details,review_file:reviewFile,preparation_record:resolve(base,item.preparation_record)};throw error;}
}});

// Judgment is supplied by the Agent after viewing. Identity fields come only
// from the producer's saved template, never from recursive hash discovery.
export async function fillReview({templateFile,observationsFile,reviewFile}){
 const template=await read(templateFile),observations=await read(observationsFile);
 const hashes=Object.keys(template).filter(k=>k.endsWith('_sha256'));
 check(hashes.length>0&&hashes.every(k=>/^[a-f0-9]{64}$/.test(template[k])),'INVALID_REVIEW_TEMPLATE','Load the exact saved reference or panel review template.');
 knownFields(observations,Object.keys(template).filter(k=>!hashes.includes(k)));
 check(path.dirname(path.resolve(reviewFile))!==path.dirname(path.resolve(templateFile)),'REVIEW_INPUT_PATH_COLLISION','Write review inputs in an external inputs/reviews directory; the template directory is CLI-owned state.');
 const review={...template,...observations};await writeNew(reviewFile,review);
 return {ok:true,paid_action:false,review_file:path.resolve(reviewFile),template:path.resolve(templateFile),hash_fields_preserved:hashes,review,visual_decisions:'caller-supplied; not approved by this fill operation'};
}
