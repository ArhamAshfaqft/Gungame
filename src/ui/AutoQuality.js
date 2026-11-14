export class AutoQuality{
 constructor(){this.level=1;this.seconds=0;this.frames=0;this.cooldown=12;}
 sample(dt){if(!Number.isFinite(dt)||dt<=0||dt>1)return false;this.seconds+=dt;this.frames++;if(this.seconds<4)return false;const fps=this.frames/this.seconds;this.cooldown-=this.seconds;this.seconds=0;this.frames=0;if(this.cooldown>0)return false;if(fps<57&&this.level>0){this.level--;this.cooldown=12;return true;}if(fps>85&&this.level<2){this.level++;this.cooldown=25;return true;}return false;}
}
