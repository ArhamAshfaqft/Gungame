import * as T from 'three';

export const HOLO_RAIL_Y=.0942523181;
export const HOLO_AXIS_Y=HOLO_RAIL_Y+.049;
export const HOLO_RAIL_Z=-.0869047344;

export function createHolographicSight() {
    const sight=new T.Group();sight.name='M4_Holographic_Sight';sight.position.set(0,HOLO_RAIL_Y,HOLO_RAIL_Z);
    const metal=new T.MeshStandardMaterial({color:0x22292b,metalness:.55,roughness:.48});
    const rubber=new T.MeshStandardMaterial({color:0x111719,roughness:.82});
    const box=(w,h,d,x,y,z,material=metal)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);sight.add(mesh);return mesh;};
    box(.066,.012,.086,0,.006,0);box(.058,.012,.055,0,.018,-.009,rubber);
    box(.029,.025,.045,.041,.014,.009,rubber);
    const outline=new T.Shape();outline.moveTo(-.033,.021);outline.lineTo(-.033,.062);outline.lineTo(-.023,.076);outline.lineTo(.023,.076);outline.lineTo(.033,.062);outline.lineTo(.033,.021);outline.closePath();
    const hole=new T.Path();hole.moveTo(-.023,.029);hole.lineTo(.023,.029);hole.lineTo(.023,.059);hole.lineTo(.016,.065);hole.lineTo(-.016,.065);hole.lineTo(-.023,.059);hole.closePath();outline.holes.push(hole);
    const hood=new T.Mesh(new T.ExtrudeGeometry(outline,{depth:.026,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:1,steps:1}),metal);
    hood.position.z=-.013;hood.name='Holo_Hood';sight.add(hood);
    const glass=new T.Mesh(new T.PlaneGeometry(.046,.036),new T.MeshPhysicalMaterial({color:0x8ac6ce,metalness:0,roughness:.12,transparent:true,opacity:.10,side:T.DoubleSide,depthWrite:false}));
    glass.position.set(0,.047,0);glass.name='Holo_Glass';sight.add(glass);
    const reticle=new T.Group();reticle.name='Holo_Reticle';reticle.position.set(0,.049,.001);sight.add(reticle);
    const red=new T.MeshBasicMaterial({color:0xff3025,toneMapped:false,transparent:true,opacity:.95,depthWrite:false,side:T.DoubleSide});
    reticle.add(new T.Mesh(new T.RingGeometry(.0058,.0064,48),red),new T.Mesh(new T.CircleGeometry(.00065,16),red));
    sight.userData.reticle=reticle;
    return sight;
}

export function attachHolographicSight(model) {
    const old=model.getObjectByName('optic_iron');if(old)old.visible=false;
    const sight=createHolographicSight();model.add(sight);model.userData.holoSight=sight;
    for(const name of ['anchor_sight_iron','anchor_sight_front']){const node=model.getObjectByName(name);if(node)node.name=name+'_original';}
    for(const [name,z] of [['anchor_sight_iron',HOLO_RAIL_Z],['anchor_sight_front',HOLO_RAIL_Z-.3],['anchor_sight_holo',HOLO_RAIL_Z]]){
        const anchor=new T.Object3D();anchor.name=name;anchor.position.set(0,HOLO_AXIS_Y,z);model.add(anchor);
    }
    return sight;
}

const origin=new T.Vector3(),forward=new T.Vector3(),rotation=new T.Quaternion();
const pivot=new T.Vector3(),before=new T.Vector3(),unrolled=new T.Quaternion();
// Roll around the sight line while aiming, rather than swinging the glass away
// from the eye. Hipfire keeps its shoulder pivot and saved pose offsets survive.
export function pivotHolographicLean(group,model,angle,ads) {
    const sight=model?.userData.holoSight;
    if(!sight||!angle||!ads)return;
    group.updateWorldMatrix(true,true);
    pivot.set(0,.049,0);sight.localToWorld(pivot);group.worldToLocal(pivot);
    unrolled.setFromEuler(new T.Euler(group.rotation.x,group.rotation.y,group.rotation.z-angle,group.rotation.order));
    before.copy(pivot).applyQuaternion(unrolled);
    pivot.applyQuaternion(group.quaternion);
    group.position.addScaledVector(before.sub(pivot),T.MathUtils.clamp(ads,0,1));
}
// Project the view direction through the glass: no secondary render pass needed.
export function updateHolographicSight(model,camera) {
    const sight=model?.userData.holoSight,reticle=sight?.userData.reticle;if(!reticle||!camera)return;
    sight.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
    origin.copy(camera.getWorldPosition(origin));sight.worldToLocal(origin);
    camera.getWorldDirection(forward);sight.getWorldQuaternion(rotation).invert();forward.applyQuaternion(rotation).normalize();
    if(forward.z>=-.0001){reticle.visible=false;return;}
    const distance=(.001-origin.z)/forward.z;
    const x=origin.x+forward.x*distance,y=origin.y+forward.y*distance;
    reticle.visible=distance>0&&Math.abs(x)<.021&&y>.031&&y<.063;
    if(reticle.visible)reticle.position.set(x,y,.001);
}
