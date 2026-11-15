import * as T from 'three';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';

// Fixed buffers and a handful of draws; no per-frame tube geometry or lights.
export class GrenadeAimGuide extends T.Group{
 constructor(){
  super();this.name='Grenade aim guide';this.userData.ssao=false;this.visible=false;
  this.geometry=new LineGeometry();this.geometry.setPositions(new Float32Array(1024*3));
  this.outline=new Line2(this.geometry,new LineMaterial({color:0x251c18,linewidth:8,transparent:true,opacity:.7,depthWrite:false,toneMapped:false}));this.outline.frustumCulled=false;this.add(this.outline);
  this.arc=new Line2(this.geometry,new LineMaterial({color:0xff674b,linewidth:5,transparent:true,opacity:1,depthWrite:false,toneMapped:false}));
  this.arc.frustumCulled=false;this.arc.raycast=()=>{};this.add(this.arc);
  const markerMaterial=new T.MeshBasicMaterial({color:0xff6548,transparent:true,opacity:.95,depthWrite:false,side:T.DoubleSide,toneMapped:false});
  this.marker=new T.Group();this.marker.add(new T.Mesh(new T.RingGeometry(.23,.31,32),markerMaterial),new T.Mesh(new T.CircleGeometry(.09,16),markerMaterial));this.add(this.marker);
  this.traverse(o=>{o.userData.ssao=false;o.renderOrder=4;o.raycast=()=>{};});this.outline.renderOrder=3;
 }
 update(prediction,mode,camera){
  this.visible=true;this.prediction=prediction;this.mode=mode;
  this.arc.material.color.setHex(mode==='low'?0xaee8ff:0xff674b);
  // Stair collision uses a slope beneath the rendered treads. Lift the marker
  // enough to clear their risers while keeping ordinary world occlusion.
  const place=(object,position,normal)=>{object.position.copy(position).addScaledVector(normal,.15);object.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);};
  this.marker.visible=true;
  if(prediction.firstImpact||prediction.resting)place(this.marker,prediction.position,prediction.normal);
  else{this.marker.position.copy(prediction.position);this.marker.quaternion.copy(camera.getWorldQuaternion(new T.Quaternion()));}
  const points=prediction.points,n=Math.min(points.length,1024),data=this.geometry.attributes.instanceStart.data;
  // Share the marker's visible endpoint. Ease its surface-clearance offset into
  // the arc so the line meets the centre dot without a gap or a sudden hook.
  const lift=this.marker.position.clone().sub(prediction.position),point=new T.Vector3();
  const write=(i,offset)=>point.copy(points[i]).addScaledVector(lift,(i/Math.max(1,n-1))**3).toArray(data.array,offset);
  for(let i=0;i<n-1;i++){write(i,i*6);write(i+1,i*6+3);}
  data.needsUpdate=true;this.geometry.instanceCount=Math.max(0,n-1);
 }
}
