import {integer,safeId} from './common.mjs';
import {denseLayout,metrics,TEMPLATES} from './board-layout.mjs';

const ratios=['1:1','16:9','9:16','4:3','3:4','21:9','3:2','2:3','5:4','4:5'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const note=v=>typeof v==='string'&&v.trim().length>0;
const ratioFits=p=>ratios.includes(p.ratio)&&Math.abs(p.width/p.height/(+p.ratio.split(':')[0]/+p.ratio.split(':')[1])-1)<=.01;
const dimensioned=p=>object(p)&&integer(p.width,256,8192)&&integer(p.height,256,8192)&&ratioFits(p);
const issue=(code,path,current,required,panel_id=null)=>({code,path,...(panel_id?{panel_id}:{}),current:current??null,required});
function fields(value,allowed,at,issues){
 if(!object(value)){issues.push(issue('INVALID_INPUT',at,value,'JSON object'));return false;}
 for(const k of Object.keys(value))if(!allowed.includes(k))issues.push(issue('UNKNOWN_FIELD',at+'.'+k,value[k],'Supported field only'));
 return true;
}

// Same historical content-box minimum as board plan; it is not a service output
// specification and does not authorize changing ratio, resolution or budget.
export function placementRequirements(placed,padding,labelHeight){
 return placed.map(p=>{
  const required={width:p.box.width-2*padding,height:p.box.height-labelHeight-3*padding};
  const [rw,rh]=p.ratio.split(':').map(Number),units=Math.ceil(Math.max(required.width/rw,required.height/rh));
  const suggested={width:units*rw,height:units*rh,ratio:p.ratio};
  return {panel_id:p.id,box:p.box,current:{width:p.width,height:p.height,ratio:p.ratio,resolution:p.resolution},required,sufficient:p.width>=required.width&&p.height>=required.height,suggested_minimum_target:suggested,suggestion_within_target_limits:integer(suggested.width,256,8192)&&integer(suggested.height,256,8192),requires_capability_check:true};
 });
}

function inspectPlacement(placed,W,H,padding,labelHeight,indexById){
 const issues=[],validBoxes=[];let boxesValid=true;
 for(const p of placed){const b=p.box,at=`$.panels[${indexById.get(p.id)}]`;
  if(!object(b)||!['x','y','width','height'].every(k=>Number.isInteger(b[k]))||b.x<0||b.y<0||b.width<=2*padding+30||b.height<=labelHeight+3*padding+30||b.x+b.width>W||b.y+b.height>H){issues.push(issue('INVALID_PLAN',at+'.box',b,{board:{width:W,height:H},minimum_exclusive:{width:2*padding+30,height:labelHeight+3*padding+30}},p.id));boxesValid=false;}else validBoxes.push(p);
 }
 const requirements=placementRequirements(validBoxes,padding,labelHeight);
 for(const r of requirements)if(!r.sufficient)issues.push(issue('INSUFFICIENT_RESOLUTION',`$.panels[${indexById.get(r.panel_id)}]`,r.current,{minimum_width:r.required.width,minimum_height:r.required.height,ratio:r.current.ratio,suggested_minimum_target:r.suggested_minimum_target,requires_capability_check:true},r.panel_id));
 if(!boxesValid)return {issues,requirements};
 for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){const a=placed[i].box,b=placed[j].box;if(!(a.x>=b.x+b.width||b.x>=a.x+a.width||a.y>=b.y+b.height||b.y>=a.y+a.height))issues.push(issue('OVERLAPPING_PANELS',`$.panels[${indexById.get(placed[i].id)}].box`,{box:a,other_panel_id:placed[j].id,other_box:b},'Non-overlapping fixed boxes',placed[i].id));}
 for(const [role,min] of [['overall',.22],['scale',.14]])if(!placed.some(p=>p.role===role&&p.box.width*p.box.height/(W*H)>=min))issues.push(issue('ROLE_TOO_SMALL','$.panels',role,{role,minimum_cell_area_fraction:min}));
 const geometry=metrics(placed,W,H,padding,labelHeight);
 if(geometry.photo_area_fraction<.9)issues.push(issue('LAYOUT_TOO_SPARSE','$.panels',geometry.photo_area_fraction,{minimum_photo_area_fraction:.9}));
 return {issues,requirements,geometry};
}

export function inspectPanelPlan(p){
 const issues=[];
 if(!fields(p,['product_id','variant','template_id','width','height','padding','label_height','panels','authorization','layout_candidates'],'$',issues))return {issues,layout:null};
 const W=p.width??3840,H=p.height??2160,padding=p.padding??4,labelHeight=p.label_height??33;
 for(const [k,valid,required] of [['product_id',safeId(p.product_id),'Valid product ID'],['variant',note(p.variant),'Nonempty variant'],['template_id',TEMPLATES.includes(p.template_id),TEMPLATES]])if(!valid)issues.push(issue('INVALID_PLAN','$.'+k,p[k],required));
 const canvasValid=integer(W,640,7680)&&integer(H,360,4320)&&W*9===H*16&&integer(padding,0,100)&&integer(labelHeight,20,180);
 for(const [key,value,min,max] of [['width',W,640,7680],['height',H,360,4320],['padding',padding,0,100],['label_height',labelHeight,20,180]])if(!integer(value,min,max))issues.push(issue('INVALID_PLAN','$.'+key,value,{minimum:min,maximum:max,integer:true}));
 if(integer(W,640,7680)&&integer(H,360,4320)&&W*9!==H*16)issues.push(issue('INVALID_PLAN','$.width',{width:W,height:H},'Board width/height must be 16:9'));
 const list=Array.isArray(p.panels)?p.panels:[];
 if(!Array.isArray(p.panels)||list.length<2||list.length>8)issues.push(issue('INVALID_PLAN','$.panels',Array.isArray(p.panels)?list.length:p.panels,'2–8 panels'));
 const auth=p.authorization;
 if(!object(auth))issues.push(issue('INVALID_BUDGET','$.authorization',auth,{confirmed:false,evidence:'Explain pending user authorization',max_requests:Math.max(2,list.length)}));
 else {
  if(!integer(auth.max_requests,list.length,10000))issues.push(issue('INVALID_BUDGET','$.authorization.max_requests',auth.max_requests,{minimum:list.length,maximum:10000,integer:true}));
  if(typeof auth.confirmed!=='boolean')issues.push(issue('INVALID_BUDGET','$.authorization.confirmed',auth.confirmed,'Explicit true or false; false is a local draft'));
  if(!note(auth.evidence))issues.push(issue('INVALID_BUDGET','$.authorization.evidence',auth.evidence,'Real authorization evidence, or why it is pending'));
 }
 const ids=new Set();let layoutInputsValid=canvasValid&&list.length>=2&&list.length<=8;
 for(const [n,panel] of list.entries()){
  const at=`$.panels[${n}]`;
  if(!fields(panel,['id','label','role','intent','width','height','ratio','resolution','box','references','evidence'],at,issues)){layoutInputsValid=false;continue;}
  if(!safeId(panel.id)||ids.has(panel.id)){issues.push(issue('INVALID_PLAN',at+'.id',panel.id,'Unique valid panel ID'));layoutInputsValid=false;}ids.add(panel.id);
  for(const [k,valid,required] of [['label',note(panel.label)&&panel.label.length<=24,'Nonempty label, at most 24 characters'],['role',note(panel.role),'Nonempty role'],['intent',note(panel.intent),'Nonempty intent'],['width',integer(panel.width,256,8192),'Integer 256–8192'],['height',integer(panel.height,256,8192),'Integer 256–8192'],['ratio',ratios.includes(panel.ratio),ratios],['resolution',['1K','2K','4K'].includes(panel.resolution),['1K','2K','4K']]])if(!valid)issues.push(issue('INVALID_PLAN',at+'.'+k,panel[k],required,panel.id));
  if(integer(panel.width,256,8192)&&integer(panel.height,256,8192)&&ratios.includes(panel.ratio)&&!ratioFits(panel))issues.push(issue('INVALID_RATIO',at+'.ratio',{width:panel.width,height:panel.height,ratio:panel.ratio},'Target dimensions match ratio within 1%',panel.id));
  if(!dimensioned(panel)||!note(panel.role))layoutInputsValid=false;
  if(panel.evidence?.inspected!==true||!note(panel.evidence?.note))issues.push(issue('EVIDENCE_REQUIRED',at+'.evidence',panel.evidence,{inspected:true,note:'Actual inspected original evidence'},panel.id));
  if(!Array.isArray(panel.references)||!panel.references.length)issues.push(issue('EVIDENCE_REQUIRED',at+'.references',panel.references,'Nonempty ordered original reference paths or prepared/review objects',panel.id));
 }
 for(const role of ['overall','scale'])if(!list.some(i=>i?.role===role))issues.push(issue('EVIDENCE_MISSING','$.panels',role,{required_role:role}));
 const explicit=list.some(i=>i?.box!==undefined);
 if(explicit&&!list.every(i=>i?.box!==undefined)){issues.push(issue('INVALID_PLAN','$.panels[].box','Mixed explicit and computed placement','All boxes or none'));layoutInputsValid=false;}
 const candidates=p.layout_candidates??[];let candidatesValid=Array.isArray(candidates)&&candidates.length<=15;
 if(!candidatesValid)issues.push(issue('INVALID_LAYOUT_CANDIDATES','$.layout_candidates',candidates,'At most 15 ordered alternatives'));
 if(explicit&&candidates.length){issues.push(issue('PLACEMENT_CONFLICT','$.layout_candidates',candidates.length,'Explicit boxes lock placement; omit layout alternatives'));candidatesValid=false;}
 const options=[list.map(i=>({...i,crop:{left:0,top:0,width:i?.width,height:i?.height}}))];
 if(Array.isArray(candidates)&&candidates.length<=15)for(const [n,c] of candidates.entries()){
  const at=`$.layout_candidates[${n}]`,before=issues.length;
  if(!fields(c,['panels'],at,issues)){candidatesValid=false;continue;}
  const seen=new Set(),overrides=new Map();
  if(!Array.isArray(c.panels)||c.panels.length!==list.length)issues.push(issue('INVALID_LAYOUT_CANDIDATES',at+'.panels',c.panels?.length,'Name all primary panel IDs exactly once'));
  for(const [j,v] of (Array.isArray(c.panels)?c.panels:[]).entries()){
   if(!fields(v,['id','width','height','ratio'],at+`.panels[${j}]`,issues))continue;
   if(!ids.has(v.id)||seen.has(v.id)||!dimensioned(v))issues.push(issue('INVALID_LAYOUT_CANDIDATES',at+`.panels[${j}]`,v,'Unique primary ID, valid target dimensions and matching supported ratio',v.id));
   seen.add(v.id);overrides.set(v.id,v);
  }
  if(issues.length!==before){candidatesValid=false;continue;}
  options.push(list.map(i=>({...i,...overrides.get(i.id),crop:{left:0,top:0,width:overrides.get(i.id).width,height:overrides.get(i.id).height}})));
 }
 if(!layoutInputsValid||!candidatesValid)return {issues,layout:null};
 const indexById=new Map(list.map((p,i)=>[p.id,i])),attempts=[];let selected=null;
 for(const [candidate,items] of options.entries()){
  let placed,checked;
  try{placed=explicit?items:denseLayout(items,W,H,padding,labelHeight).panels;checked=inspectPlacement(placed,W,H,padding,labelHeight,indexById);}
  catch(error){checked={issues:[issue(error.code??'INVALID_PLAN','$.panels',null,error.message)],requirements:[]};}
  if(candidate>0)checked.issues=checked.issues.map(i=>i.code==='INSUFFICIENT_RESOLUTION'?{...i,path:`$.layout_candidates[${candidate-1}].panels[${candidates[candidate-1].panels.findIndex(p=>p.id===i.panel_id)}]`}:i);
  attempts.push({candidate,status:checked.issues.length?'rejected':'accepted',...(checked.issues.length?{code:checked.issues[0].code}:{}),issues:checked.issues,requirements:checked.requirements});
  if(!checked.issues.length){selected={panels:placed,geometry:checked.geometry,candidate};break;}
 }
 if(!selected)issues.push(...attempts.flatMap(a=>a.issues.map(i=>({...i,candidate:a.candidate}))));
 const layout_search={attempts,limit:options.length,...(selected?{selected_candidate:selected.candidate}:{}),stop_condition:selected?'first-feasible':'no-feasible-candidate'};
 const layout={mode:explicit?'manual':'computed',width:W,height:H,padding,label_height:labelHeight,layout_search,...(selected?{panels:selected.panels,geometry:selected.geometry,requirements:attempts.at(-1).requirements}:{}),semantics:'Content-box minimum only; suggestions are not applied and service ratio/resolution/authorization remain caller decisions.'};
 return {issues,layout};
}
