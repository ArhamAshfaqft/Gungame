import {Vector3} from 'three';

// Physics stays at 60 Hz. Only the displayed eye position interpolates between
// completed simulation ticks; mouse look remains responsive on every frame.
export class PredictionCamera {
 constructor(camera){this.camera=camera;this.previous=new Vector3();this.current=new Vector3();this.ready=false;this.bodyReady=false;this.previousBody=new Vector3();this.currentBody=new Vector3();}
 restore(){if(this.ready)this.camera.position.copy(this.current);}
 tick(position){
  if(position){if(!this.bodyReady){this.currentBody.copy(position);this.bodyReady=true;}this.previousBody.copy(this.currentBody);this.currentBody.copy(position);}
  if(!this.ready){this.current.copy(this.camera.position);this.ready=true;}
  this.previous.copy(this.current);this.current.copy(this.camera.position);
 }
 correct(position){
  if(position&&this.bodyReady){this.previousBody.add(position).sub(this.currentBody);this.currentBody.copy(position);}
  if(!this.ready){this.tick(position);return;}
  this.previous.addScaledVector(this.camera.position,1).sub(this.current);
  this.current.copy(this.camera.position);
 }
 reset(position){this.ready=false;this.bodyReady=false;this.tick(position);}
 render(alpha,movement){
  if(this.bodyReady){movement.renderPosition??=new Vector3();movement.renderPosition.lerpVectors(this.previousBody,this.currentBody,Math.max(0,Math.min(1,alpha)));}
  if(this.ready)this.camera.position.lerpVectors(this.previous,this.current,Math.max(0,Math.min(1,alpha)));
  this.camera.rotation.order='YXZ';this.camera.rotation.y=movement.yaw;this.camera.rotation.x=movement.pitch;
 }
}
