import * as T from 'three';
import {DestructionWorkers} from './DestructionWorkers.js';
import {FrameWorkQueue} from './FrameWorkQueue.js';
import {snapshotBlast,computeBlastPlan} from './BlastPlanning.js';
import {markOperation,geometryRevision,packOperation,applyOperation,runOperation} from './GeometryJobs.js';
import {removeSurfaceMark} from '../world/SurfaceDecal.js';

const pipelines=new WeakMap();
export const pipelineFor=scene=>pipelines.get(scene);
export function createDestructionPipeline(map){
 if(typeof Worker==='undefined'||typeof requestAnimationFrame==='undefined')return null;
 const pipeline=new DestructionPipeline(map);pipelines.set(map.scene,pipeline);return pipeline;
}

// All scene mutations stay on the main thread. Workers calculate immutable mesh
// replacements; commits and rigid-body activation share a small frame budget.
export class DestructionPipeline{
 constructor(map){this.map=map;this.pool=new DestructionWorkers(2);this.frames=new FrameWorkQueue(3);this.jobs=new Map();this.plans=0;this.waiters=[];this.closed=false;this.stats={plans:0,operations:0,fallbacks:0,entryMaxMs:0,tasks:{},errors:[]};this.frames.onDrain=()=>this.checkIdle();}
 task(fn,label='advance'){this.frames.push(()=>{if(this.closed)return;const start=performance.now();try{fn();}catch(error){this.stats.errors.push(String(error.stack||error));}finally{const time=performance.now()-start,s=this.stats.tasks[label]??={calls:0,ms:0,max:0};s.calls++;s.ms+=time;s.max=Math.max(s.max,time);this.checkIdle();}});}
 explode(position,radius){
  const start=performance.now(),{payload,lookup}=snapshotBlast(this.map,position,radius);this.plans++;this.stats.plans++;
  this.pool.run('plan',payload).catch(()=>{this.stats.fallbacks++;return computeBlastPlan(snapshotBlast(this.map,position,radius).payload);}).then(plan=>{
   if(this.closed)return;
   for(const target of plan.panels)this.task(()=>{
    const p=lookup.get(target.id)?.userData.breakable;if(!p||p.destroyed)return;const exposed=new Set(target.exposed);
    if(exposed.size)p.applyBlast(position,330,radius,(_point,id)=>exposed.has(id));
    if(target.scarPoint&&!p.destroyed){const point=new T.Vector3().fromArray(target.scarPoint),scars=this.map.blastScars;
     this.queueImpact(p.mesh,function*(){const entry=scars.create(p,point,position);if(yield markOperation(entry))scars.retain(entry);else removeSurfaceMark(entry);});
     this.map.blastDust.spawn(point,new T.Vector3(0,.2,0),new T.Matrix4().makeScale(.15,.1,.15),new T.Vector3(),.6);
    }
   },'panel');
   for(const target of plan.props)this.task(()=>{
    const mesh=lookup.get(target.id);if(!mesh?.visible)return;
    this.queueImpact(mesh,()=>{mesh.updateWorldMatrix(true,false);return this.map.surfaceDamage.hitSteps({object:mesh,point:mesh.localToWorld(new T.Vector3().fromArray(target.localPoint)),face:{normal:new T.Vector3().fromArray(target.normal)},distance:0},'primary',new T.Vector3().fromArray(target.direction),{distance:0,damage:target.strength,blast:true,blastOrigin:position},true);});
   },'prop');
  }).catch(error=>{if(!this.closed)this.stats.errors.push(String(error.stack||error));}).finally(()=>{this.plans--;this.checkIdle();});
  this.stats.entryMaxMs=Math.max(this.stats.entryMaxMs,performance.now()-start);
 }
 queueImpact(mesh,factory){if(this.closed)return;const list=this.jobs.get(mesh)||[];if(!list.length)this.jobs.set(mesh,list);const job={mesh,factory,done:false};list.push(job);if(list.length===1)this.advance(job);}
 advance(job,value){
  if(!job||job.done||this.closed)return;
  try{
   job.generator??=job.factory();const step=job.generator.next(value);if(step.done){this.finish(job);return;}
   job.op=step.value;this.dispatch(job);
  }catch(error){this.stats.errors.push(String(error.stack||error));this.finish(job);}
 }
 dispatch(job){
  const op=job.op,revision=geometryRevision(op.mesh);if(op.kind==='sever')op.colliders=this.map.colliders;this.stats.operations++;
  this.pool.run('geometry',packOperation(op)).then(result=>this.task(()=>{
   if(job.done)return;
   if(op.mesh.visible&&geometryRevision(op.mesh)!==revision){this.dispatch(job);return;}
   try{const value=applyOperation(op,result);job.op=null;this.advance(job,value);}catch(error){this.stats.errors.push(String(error.stack||error));this.finish(job);}
  },op.kind),()=>this.task(()=>{if(job.done)return;this.stats.fallbacks++;try{const value=runOperation(op);job.op=null;this.advance(job,value);}catch(error){this.stats.errors.push(String(error.stack||error));this.finish(job);}},'fallback'));
 }
 refreshMark(entry,removed){
  if(entry.pending||entry.removed)return;entry.pending=true;
  this.queueImpact(entry.mesh,function*(){try{if(entry.removed)return;if(!(yield markOperation(entry)))removed();}finally{entry.pending=false;}});
 }
 finish(job){if(job.done)return;job.done=true;const list=this.jobs.get(job.mesh);if(!list)return;const index=list.indexOf(job);if(index>=0)list.splice(index,1);if(!list.length)this.jobs.delete(job.mesh);else{const next=list[0];this.task(()=>this.advance(next));}this.checkIdle();}
 // A new bullet on a pending mesh must see every earlier blast hit immediately.
 // Finish that mesh locally and ignore its stale worker replies; never overwrite
 // a newer hole, resurrect a removed object, or delay projectile penetration.
 flush(mesh){const run=op=>{op.colliders=this.map.colliders;return runOperation(op);};let list=this.jobs.get(mesh);while(list?.length){const job=list[0];try{job.generator??=job.factory();let step=job.op?job.generator.next(run(job.op)):job.generator.next();job.op=null;while(!step.done)step=job.generator.next(run(step.value));}finally{this.finish(job);}list=this.jobs.get(mesh);}}
 whenIdle(){if(!this.plans&&!this.jobs.size&&!this.frames.tasks.length)return Promise.resolve();return new Promise(resolve=>this.waiters.push(resolve));}
 checkIdle(){if(!this.plans&&!this.jobs.size&&!this.frames.tasks.length)for(const resolve of this.waiters.splice(0))resolve();}
 dispose(){this.closed=true;this.pool.dispose();this.frames.dispose();this.jobs.clear();pipelines.delete(this.map.scene);for(const resolve of this.waiters.splice(0))resolve();}
}
