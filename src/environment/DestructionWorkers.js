import {transfers} from './GeometryJobs.js';

export class DestructionWorkers{
 constructor(count=2,{createWorker=()=>new Worker(new URL('./destruction.worker.js?protocol=2',import.meta.url),{type:'module'})}={}){
  this.queue=[];this.workers=[];this.sequence=0;this.closed=false;
  for(let i=0;i<count;i++){
   const worker=createWorker(),slot={worker,ready:false,jobs:[]};
   worker.onmessage=({data})=>{
    if(data.ready){if(data.protocol!==2){slot.failed=true;worker.terminate();}else slot.ready=true;this.pump();return;}
    const jobs=new Map(slot.jobs.map(job=>[job.id,job]));slot.jobs=[];
    for(const result of data.results||[]){const job=jobs.get(result.id);if(!job)continue;jobs.delete(result.id);if(result.error)job.reject(Error(result.error));else job.resolve(result.result);}
    for(const job of jobs.values())job.reject(Error('Incomplete destruction worker response'));
    this.pump();
   };
   worker.onerror=event=>{slot.failed=true;for(const job of slot.jobs)job.reject(Error(event.message||'Destruction worker failed'));slot.jobs=[];this.pump();};this.workers.push(slot);
  }
 }
 run(kind,payload){if(this.closed)return Promise.reject(Error('Destruction worker pool closed'));return new Promise((resolve,reject)=>{this.queue.push({id:++this.sequence,kind,payload,resolve,reject});this.pump();});}
 pump(){
  for(const slot of this.workers)if(slot.ready&&!slot.failed&&!slot.jobs.length&&this.queue.length){
   // Batch cuts so every book doesn't require a separate main-thread message.
   // Prioritize new blast plans over queued cosmetic cuts.
   const plan=this.queue.findIndex(job=>job.kind==='plan');
   let jobs;if(plan>=0)jobs=this.queue.splice(plan,1);else{
    jobs=[];for(let i=0;i<this.queue.length&&jobs.length<16;)if(!['mark','floorMark'].includes(this.queue[i].payload.kind))jobs.push(...this.queue.splice(i,1));else i++;
    if(!jobs.length)jobs=this.queue.splice(0,16);
   }
   slot.jobs=jobs;
   const message={jobs:jobs.map(({id,kind,payload})=>({id,kind,payload}))};
   try{slot.worker.postMessage(message,transfers(message));}catch(error){slot.jobs=[];slot.failed=true;slot.worker.terminate();for(const job of jobs)job.reject(error);}
  }
  if(this.workers.every(w=>w.failed))for(const job of this.queue.splice(0))job.reject(Error('Destruction workers unavailable'));
 }
 dispose(){this.closed=true;for(const slot of this.workers){slot.worker.terminate();for(const job of slot.jobs)job.reject(Error('Destruction cancelled'));}for(const job of this.queue.splice(0))job.reject(Error('Destruction cancelled'));this.workers=[];}
}
