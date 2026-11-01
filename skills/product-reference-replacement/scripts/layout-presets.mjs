import {readFileSync} from 'node:fs';
import {check,integer} from './common.mjs';
import {metrics} from './board-layout.mjs';

const library=JSON.parse(readFileSync(new URL('../references/layouts/library.json',import.meta.url),'utf8'));
const ratios=['1:1','16:9','9:16','4:3','3:4','21:9','3:2','2:3','5:4','4:5'];
export function validateLayoutLibrary(){
 check(library.schema_version==='asset-layout-library-1'&&library.coordinate_units===12000,'INVALID_LAYOUT_LIBRARY','Use the bundled versioned layout library.');
 const seen=new Set();for(const t of library.templates){
  check(!seen.has(t.id)&&t.version===1&&t.panel_count===t.slots.length,'INVALID_LAYOUT_LIBRARY','Unique versioned layouts and exact slot counts are required.');seen.add(t.id);
  let area=0;const ids=new Set();for(const s of t.slots){const b=s.rect;check(!ids.has(s.id)&&['x','y','width','height'].every(k=>Number.isInteger(b[k]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=12000&&b.y+b.height<=12000,'INVALID_LAYOUT_LIBRARY','Invalid slot geometry.');ids.add(s.id);area+=b.width*b.height;}
  check(area===12000**2,'INVALID_LAYOUT_LIBRARY','Slots must cover the canvas.');
  for(let i=0;i<t.slots.length;i++)for(const s of t.slots.slice(i+1)){const a=t.slots[i].rect,b=s.rect;check(a.x>=b.x+b.width||b.x>=a.x+a.width||a.y>=b.y+b.height||b.y>=a.y+a.height,'INVALID_LAYOUT_LIBRARY','Slots must not overlap.');}
  const areas=t.slots.map(s=>s.rect.width*s.rect.height/12000**2);check(Math.min(...areas)>=library.gates.min_cell_area_fraction-1e-9&&Math.max(...areas)/Math.min(...areas)<=library.gates.max_cell_area_ratio,'INVALID_LAYOUT_LIBRARY','Cell area gates must hold.');
 }return library;
}
function template(id,version=1){validateLayoutLibrary();const t=library.templates.find(t=>t.id===id&&t.version===version);check(t,'UNKNOWN_LAYOUT','Select an exact layout_id and version from layout list.');return t;}
function canvas(width,height,padding,labelHeight){check(integer(width,640,7680)&&integer(height,360,4320)&&width*9===height*16&&integer(padding,0,100)&&integer(labelHeight,20,180),'INVALID_PLAN','Use a 16:9 canvas and valid label/padding.');}
function boxes(t,width,height){return t.slots.map(s=>{const b=s.rect,x=Math.round(b.x*width/12000),y=Math.round(b.y*height/12000);return {...s,box:{x,y,width:Math.round((b.x+b.width)*width/12000)-x,height:Math.round((b.y+b.height)*height/12000)-y}};});}
export function listLayouts(){validateLayoutLibrary();return {ok:true,...structuredClone(library),paid_action:false};}
export function showLayout({layoutId,width=3840,height=2160,padding=4,labelHeight=32}){
 [width,height,padding,labelHeight]=[width,height,padding,labelHeight].map(Number);canvas(width,height,padding,labelHeight);const t=template(layoutId);
 const slots=boxes(t,width,height).map(s=>{const w=s.box.width-2*padding,h=s.box.height-labelHeight-3*padding;check(w>0&&h>0,'INVALID_PLAN','Labels and padding must leave a photo area.');return {...s,area_fraction:s.rect.width*s.rect.height/12000**2,photo_frame:{width:w,height:h},ratio_options:ratios.map(ratio=>{const [rw,rh]=ratio.split(':').map(Number),scale=Math.min(w/rw,h/rh),units=Math.ceil(Math.max(w/rw,h/rh));return {ratio,photo_frame_fill:rw*rh*scale**2/(w*h),short_edge_at_1600:Math.min(rw,rh)*scale*1600/width,minimum_target:{width:units*rw,height:units*rh}};}).sort((a,b)=>b.photo_frame_fill-a.photo_frame_fill)};});
 return {ok:true,layout_id:t.id,layout_version:t.version,name:t.name,panel_count:t.panel_count,width,height,padding,label_height:labelHeight,gates:library.gates,slots,paid_action:false,next_action:'Assign each panel to one slot_id, choose supported generation ratios/resolutions using current model capabilities, then board check-plan. Ratios and minimum targets here are geometry suggestions, not service guarantees.'};
}
export function placeLayout(panels,{layout_id,layout_version=1,width,height}){
 const t=template(layout_id,layout_version),slots=boxes(t,width,height);check(panels.length===slots.length,'LAYOUT_PANEL_COUNT','Panel count must match the selected layout.');
 const seen=new Set();return panels.map(p=>{const s=slots.find(s=>s.id===p.slot_id);check(s&&!seen.has(s.id),'LAYOUT_SLOT_MISMATCH','Assign every template slot_id exactly once.');seen.add(s.id);check(s.role==='any'||p.role===s.role,'LAYOUT_ROLE_MISMATCH','Put overall and scale in their declared template slots.');
  if(p.box)check(['x','y','width','height'].every(k=>p.box[k]===s.box[k]),'PLACEMENT_CONFLICT','Explicit boxes must equal the selected versioned template.');return {...p,slot_id:s.id,box:s.box};});
}
export function layoutGateIssues(panels,width,height,padding,labelHeight){
 const g=metrics(panels,width,height,padding,labelHeight),areas=panels.map(p=>p.box.width*p.box.height/(width*height)),issues=[];
 const add=(code,current,required,panel_id)=>issues.push({code,path:panel_id?'$.panels['+panels.findIndex(p=>p.id===panel_id)+']':'$.layout_id',...(panel_id?{panel_id}:{}),current,required});
 if(Math.min(...areas)+.001<library.gates.min_cell_area_fraction)add('LAYOUT_CELL_TOO_SMALL',Math.min(...areas),{min_cell_area_fraction:library.gates.min_cell_area_fraction});
 if(Math.max(...areas)/Math.min(...areas)>library.gates.max_cell_area_ratio+.01)add('LAYOUT_AREA_IMBALANCE',Math.max(...areas)/Math.min(...areas),{max_cell_area_ratio:library.gates.max_cell_area_ratio});
 for(const c of g.cells){const short=Math.min(c.photo_width,c.photo_height)*1600/width;if(short+1<library.gates.min_photo_short_edge)add('LAYOUT_PHOTO_TOO_SMALL',short,{preview_width:1600,min_photo_short_edge:300,action:'Choose a compatible image ratio or another approved layout; preserve product and scale evidence.'},c.id);}
 return issues;
}
