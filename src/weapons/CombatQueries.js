import * as THREE from 'three';

// A hollow stair flight occupies a sloping slab, rather than its entire AABB.
function sweepStair(start,end,radius,box){
 const r=box.ramp,up=new THREE.Vector3(0,1,r.height/r.length).normalize();
 const a=start.clone().sub(r.position).applyAxisAngle(new THREE.Vector3(0,1,0),-r.rotation);
 const b=end.clone().sub(r.position).applyAxisAngle(new THREE.Vector3(0,1,0),-r.rotation);
 const distance=p=>(p.y-r.height*(.5-p.z/r.length))*up.y;
 const origins=[a.x,distance(a),a.z],ends=[b.x,distance(b),b.z];
 const min=[-r.width/2,-r.thickness*up.y,-r.length/2],max=[r.width/2,0,r.length/2];
 let enter=0,exit=1,axis=-1,sign=0;
 for(let i=0;i<3;i++){const d=ends[i]-origins[i],lo=min[i]-radius,hi=max[i]+radius;
  if(Math.abs(d)<1e-9){if(origins[i]<lo||origins[i]>hi)return null;continue;}
  const near=Math.min((lo-origins[i])/d,(hi-origins[i])/d),far=Math.max((lo-origins[i])/d,(hi-origins[i])/d);
  if(near>=enter){enter=near;axis=i;sign=d>0?-1:1;}exit=Math.min(exit,far);if(enter>exit)return null;
 }
 if(axis<0||enter<0||enter>1)return null;
 const normal=axis===1?up.multiplyScalar(sign):new THREE.Vector3().setComponent(axis,sign);
 normal.applyAxisAngle(new THREE.Vector3(0,1,0),r.rotation);
 return{time:enter,normal,box};
}

// Swept sphere against static AABBs, so a fast grenade cannot tunnel through thin walls.
export function sweepSphere(start, end, radius, colliders, ignore = null) {
    const delta = end.clone().sub(start);
    let result = null;
    for (const box of colliders) {
        if (ignore?.(box)) continue;
        if(box.doorGroup){const group=box.doorGroup;group.updateWorldMatrix(true,false);const hit=sweepSphere(group.worldToLocal(start.clone()),group.worldToLocal(end.clone()),radius,[box.doorBounds]);if(hit&&(!result||hit.time<result.time)){hit.normal.transformDirection(group.matrixWorld);hit.box=box;result=hit;}continue;}
        if(box.ramp?.thickness){const hit=sweepStair(start,end,radius,box);if(hit&&(!result||hit.time<result.time))result=hit;continue;}
        let enter = 0, exit = 1, axis = -1, sign = 0, valid = true;
        for (let i = 0; i < 3; i++) {
            const s = start.getComponent(i), d = delta.getComponent(i);
            const min = box.min.getComponent(i) - radius, max = box.max.getComponent(i) + radius;
            if (Math.abs(d) < 1e-9) { if (s < min || s > max) valid = false; continue; }
            const a = (min - s) / d, b = (max - s) / d;
            const near = Math.min(a, b), far = Math.max(a, b);
            if (near >= enter) { enter = near; axis = i; sign = d > 0 ? -1 : 1; }
            exit = Math.min(exit, far);
            if (enter > exit) valid = false;
        }
        if (!valid || axis < 0 || enter < 0 || enter > 1 || exit < 0 || (result && enter >= result.time)) continue;
        const normal = new THREE.Vector3(); normal.setComponent(axis, sign);
        result = { time: enter, normal, box };
    }
    return result;
}

export function hasLineOfSight(scene, from, to, ignore = new Set()) {
    const direction = to.clone().sub(from), length = direction.length();
    if (length < 0.08) return true;
    const objects = [];
    scene.traverseVisible(object => {
        if (!object.isMesh || !object.userData.isShootable || object.userData.bot || ignore.has(object)) return;
        // Clear glazing transmits a flash; opaque frames and wood do not.
        if (object.userData.width && object.userData.breakable) return;
        objects.push(object);
    });
    const ray = new THREE.Raycaster(from, direction.normalize(), 0.04, length - 0.04);
    // Render batches report hits on their original source meshes. Honour exclusions
    // after raycasting as well, so a panel never blocks the blast targeting itself.
    return ray.intersectObjects(objects, false).every(hit=>ignore.has(hit.object));
}

export function flashExposure(distance, facing, visible = true) {
    if (!visible || distance >= 12) return 0;
    const range = Math.pow(Math.max(0, 1 - distance / 12), 0.65);
    return THREE.MathUtils.clamp(range * THREE.MathUtils.lerp(0.18, 1, (facing + 1) / 2), 0, 1);
}
