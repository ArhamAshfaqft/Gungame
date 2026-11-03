import * as T from 'three';
import {materialPart} from '../world/MaterialProps.js';

// Store the hollow interior in each shell part's local coordinates. The same
// pressure rule can be used by a new tub/basin without villa-specific checks.
export function brittleContainer(parts,interior){
 for(const part of parts){part.updateWorldMatrix(true,false);const box=interior.clone().applyMatrix4(part.matrixWorld.clone().invert());part.userData.brittleContainer={min:box.min.toArray(),max:box.max.toArray()};}
 return parts;
}

// Reusable hollow construction; coloured fronts don't stand in for solid boxes.
export function cabinet(map,{x,y,z,width:w,height:h,depth:d,material='walnut',front=1,wallMounted=false}){
 const group=new T.Group();group.position.set(x,y,z);map.scene.add(group);const type=['metal','steel'].includes(material)?'metal':'wood',thickness=type==='wood'?.022:.004,frame=[];
 const part=(a,b,c,ww,hh,dd,name)=>{const m=map.box(a,b,c,ww,hh,dd,material,true);m.removeFromParent();group.add(m);materialPart(m,type,{thickness:Math.min(ww,hh,dd)});m.name=name;return m;};
 const left=part(-w/2+thickness/2,h/2,0,thickness,h,d,'Cabinet side'),right=part(w/2-thickness/2,h/2,0,thickness,h,d,'Cabinet side');
 const back=part(0,h/2,-front*(d/2-thickness/2),w,h,thickness,'Cabinet back');
 const bottom=part(0,thickness/2,0,w,thickness,d,'Cabinet base'),top=part(0,h-thickness/2,0,w,thickness,d,'Cabinet top');frame.push(left,right,back,bottom,top);
 const count=Math.max(1,Math.round(w/.65));for(let i=1;i<count;i++)frame.push(part(-w/2+w*i/count,h/2,0,thickness,h,d,'Cabinet divider'));
 group.updateMatrixWorld(true);for(const m of frame)m.userData.collider.setFromObject(m);
 if(wallMounted)group.userData.wallMountProbe=[.2,.8].map(t=>new T.Vector3(0,h*t,-front*d/2));
 map.environment?.register(group,{parts:frame,wallMount:wallMounted});
 for(let i=0;i<count;i++){
  const ww=w/count,xx=-w/2+ww*(i+.5),shelf=part(xx,h*.5,0,ww-thickness,.02,d-thickness*2,'Cabinet interior shelf');
  const face=part(xx,h*.51,front*(d/2+.018),ww-.035,h-.08,.022,'Cabinet door');
  const handle=map.box(xx+ww*.3,h*.6,front*(d/2+.055),.018,.16,.025,'steel',false,true);handle.removeFromParent();face.add(handle);handle.position.sub(face.position);handle.userData.decorOwner=face;
  group.updateMatrixWorld(true);shelf.userData.collider.setFromObject(shelf);face.userData.collider.setFromObject(face);
  map.environment?.support(shelf,[left,right,back]);map.environment?.support(face,[back]);
 }
 group.updateMatrixWorld(true);return group;
}

export function countertop(map,{x,y,z,width:w,height:h,depth:d,material='marble'}){
 const stoneDepth=Math.min(.035,h),coreDepth=h-stoneDepth,top=y+h/2;
 const core=coreDepth>.003?map.box(x,y-h/2+coreDepth/2,z,w,coreDepth,d,'wood',true):null;
 if(core){core.name='Countertop timber backing';core.userData.surfaceSupported=true;}
 const stone=map.box(x,top-stoneDepth/2,z,w,stoneDepth,d,material,true,false,{unlayered:true});stone.name='Stone countertop';materialPart(stone,'stone',{thickness:stoneDepth});
 if(core)map.environment?.support(stone,[core]);return stone;
}

export function bookshelf(map,{x,y,z,width:w,rotation=0}){
 const group=new T.Group();group.position.set(x,y,z);group.rotation.y=rotation;map.scene.add(group);const frame=[];
 const part=(xx,yy,zz,ww,hh,dd,name)=>{const m=map.box(xx,yy,zz,ww,hh,dd,'walnut',true);m.removeFromParent();group.add(m);m.name=name;return m;};
 const back=part(0,1.35,-.18,w,2.7,.018,'Bookshelf back');frame.push(back);
 const left=part(-w/2+.025,1.35,0,.05,2.7,.44,'Bookshelf side'),right=part(w/2-.025,1.35,0,.05,2.7,.44,'Bookshelf side');frame.push(left,right);
 group.updateMatrixWorld(true);for(const m of frame)m.userData.collider.setFromObject(m);map.environment?.register(group,{parts:frame});
 for(let i=0;i<5;i++){
  const level=.12+i*.6,shelf=part(0,level,0,w,.025,.44,'Bookshelf shelf');group.updateMatrixWorld(true);shelf.userData.collider.setFromObject(shelf);
  map.environment?.support(shelf,[{mesh:left,anchor:new T.Vector3(0,level-1.35,0)},{mesh:right,anchor:new T.Vector3(0,level-1.35,0)}],{supportMode:'all'});
  for(let j=0;j<Math.floor(w/.19)-1;j++){
   const h=.25+j%4*.035,book=map.box(-w/2+.22+j*.19,level+.015+h/2,.03,.11+j%2*.025,h,.23,['red','navy','linen','ochre','white'][j%5],false,true);
   book.removeFromParent();group.add(book);book.name='Bound book';materialPart(book,'paper',{supportOwner:shelf,looseItem:true});
  }
 }
 group.updateMatrixWorld(true);return group;
}
