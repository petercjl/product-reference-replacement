import {check} from './common.mjs';

export const TEMPLATES=['generic','soft-textiles','wearables','bags','containers','electronics','furniture'];
export function metrics(panels,width,height,padding,labelHeight){
 let photos=0,content=0,labels=0;const cells=[];
 for(const p of panels){const b=p.box,c=p.crop,iw=b.width-2*padding,ih=b.height-labelHeight-3*padding;
  check(iw>0&&ih>0,'INVALID_PLAN','Panel is too small for its label and padding.');
  const s=Math.min(iw/c.width,ih/c.height),pw=c.width*s,ph=c.height*s,area=pw*ph;
  photos+=area;content+=iw*ih;labels+=iw*labelHeight;
  cells.push({id:p.id,photo_width:pw,photo_height:ph,photo_fraction_of_cell:area/(b.width*b.height),contain_padding_fraction:1-area/(iw*ih),effective_source_width:Math.min(c.width,pw),effective_source_height:Math.min(c.height,ph)});
 }
 const canvas=width*height;return {photo_area_fraction:photos/canvas,contain_padding_fraction:(content-photos)/canvas,label_area_fraction:labels/canvas,other_non_photo_fraction:(canvas-content-labels)/canvas,cells,definition:'Photo rectangles include their original backgrounds; this is not white-pixel detection or foreground segmentation.'};
}

// Deterministic bounded slicing-tree search. Ratios come from caller-selected crops;
// it never changes a crop, drops an evidence role or stretches a product.
export function denseLayout(panels,width,height,padding,labelHeight){
 check(panels.length>=2&&panels.length<=8,'INVALID_PLAN','Dense reference boards use 2–8 selected evidence panels.');
 let seed=137;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const leaf=i=>({i,ratio:panels[i].crop.width/panels[i].crop.height});
 function tree(ids){if(ids.length===1)return leaf(ids[0]);const cut=1+Math.floor(random()*(ids.length-1)),a=tree(ids.slice(0,cut)),b=tree(ids.slice(cut)),axis=random()<.5?'x':'y';return {a,b,axis,ratio:axis==='x'?a.ratio+b.ratio:1/(1/a.ratio+1/b.ratio)};}
 function place(t,box,out){if(t.i!==undefined){out[t.i]={...panels[t.i],box};return;}if(t.axis==='x'){const w=Math.round(box.width*t.a.ratio/(t.a.ratio+t.b.ratio));place(t.a,{...box,width:w},out);place(t.b,{...box,x:box.x+w,width:box.width-w},out);}else{const h=Math.round(box.height*(1/t.a.ratio)/(1/t.a.ratio+1/t.b.ratio));place(t.a,{...box,height:h},out);place(t.b,{...box,y:box.y+h,height:box.height-h},out);}}
 let best=null;
 for(let k=0;k<7000;k++){
  const ids=panels.map((_,i)=>i);for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
  const candidate=[];place(tree(ids),{x:0,y:0,width,height},candidate);
  if(candidate.some(p=>p.box.width<Math.max(180,width*.10,2*padding+31)||p.box.height<Math.max(120,height*.14,labelHeight+3*padding+31)))continue;
  const m=metrics(candidate,width,height,padding,labelHeight);
  const fraction=role=>candidate.filter(p=>p.role===role).reduce((n,p)=>n+p.box.width*p.box.height/(width*height),0);
  const hero=fraction('overall'),scale=fraction('scale');
  if(hero<.22||scale<.14)continue;
  const score=m.photo_area_fraction-Math.max(0,.32-hero)*.16-Math.max(0,.20-scale)*.12;
  if(!best||score>best.score)best={score,panels:candidate,metrics:m};
 }
 check(best,'LAYOUT_UNAVAILABLE','No layout fits the selected crops and mandatory panel sizes. Adjust evidence selection or panel count.');
 return best;
}
