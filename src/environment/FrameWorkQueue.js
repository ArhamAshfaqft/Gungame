export class FrameWorkQueue{
 constructor(budgetMs=3){this.budgetMs=budgetMs;this.tasks=[];this.scheduled=false;this.closed=false;this.stats={frames:0,maxMs:0};}
 push(task){if(this.closed)return;this.tasks.push(task);if(!this.scheduled&&!this.running){this.scheduled=true;requestAnimationFrame(()=>this.pump());}}
 pump(){this.scheduled=false;if(this.closed||!this.tasks.length)return;this.running=true;const start=performance.now();try{do{const task=this.tasks.shift();if(task)task();}while(this.tasks.length&&performance.now()-start<this.budgetMs);}finally{this.running=false;}this.stats.frames++;this.stats.maxMs=Math.max(this.stats.maxMs,performance.now()-start);if(this.tasks.length&&!this.scheduled){this.scheduled=true;requestAnimationFrame(()=>this.pump());}this.onDrain?.();}
 dispose(){this.closed=true;this.tasks=[];}
}
