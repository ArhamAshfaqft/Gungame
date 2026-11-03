import {computeOperation,transfers} from './GeometryJobs.js';
import {computeBlastPlan} from './BlastPlanning.js';
self.onmessage=({data})=>{
 const results=data.jobs.map(job=>{try{return{id:job.id,result:job.kind==='geometry'?computeOperation(job.payload):computeBlastPlan(job.payload)};}catch(error){return{id:job.id,error:error.stack||String(error)};}});
 self.postMessage({results},transfers(results));
};
self.postMessage({ready:true,protocol:2});
