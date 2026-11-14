import {Vector3} from 'three';

// A short snapshot buffer handles both flight and bounces without predicting
// through walls. Positions are presentation only; fuses/collision stay server-side.
export class ProjectilePresentation{
 constructor(mesh){this.mesh=mesh;this.samples=[];this.target=new Vector3();}
 push(position,at=performance.now()){
  if(!this.samples.length)this.mesh.position.fromArray(position);
  this.samples.push({position:[...position],at});if(this.samples.length>8)this.samples.shift();
 }
 update(now=performance.now()){
  const time=now-75;while(this.samples.length>2&&this.samples[1].at<=time)this.samples.shift();
  const a=this.samples[0],b=this.samples[1]||a;if(!a)return;
  const t=a===b?1:Math.max(0,Math.min(1,(time-a.at)/Math.max(1,b.at-a.at)));
  this.mesh.position.fromArray(a.position).lerp(this.target.fromArray(b.position),t);
 }
}
