import {Vector3,Vector2,Raycaster} from 'three';

// The displayed camera is the shot reference. Movement angles may already
// contain recoil intended for the next rendered frame.
export function renderedAim(camera,origin=null,targets=[],range=160){
 camera.updateWorldMatrix(true,false);
 const forward=camera.getWorldDirection(new Vector3());
 if(origin){
  const ray=new Raycaster();ray.far=range;ray.setFromCamera(new Vector2(),camera);
  const point=ray.intersectObjects(targets,false)[0]?.point||ray.ray.at(range,new Vector3());
  forward.copy(point).sub(origin).normalize();
 }

 return {yaw:Math.atan2(-forward.x,-forward.z),pitch:Math.atan2(forward.y,Math.hypot(forward.x,forward.z))};
}
