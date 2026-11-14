import * as T from 'three';

const basis=(x,y,z)=>new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(...x),new T.Vector3(...y),new T.Vector3(...z)));
const rightRotation=basis([0,0,1],[0,1,0],[-1,0,0]);
const supportRotation=basis([0,0,1],[1,0,0],[0,1,0]);
const pistolSupportRotation=basis([0,0,-1],[0,1,0],[1,0,0]);
const palmGeometryCache=new WeakMap();

// The palm is rigid. Forearm/finger influences on its centre made the glove
// slide even when the wrist transform was fixed. Keep blending at the wrist
// and knuckles, but bind the central palm to its hand bone on full-body clones.
export function calibratePalmWeights(rig){
    if(rig.armsOnly)return;
    rig.object.updateMatrixWorld(true);
    rig.object.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;
        const sourceGeometry=mesh.geometry,cached=palmGeometryCache.get(sourceGeometry);
        if(cached){mesh.geometry=cached;return;}
        mesh.geometry=mesh.geometry.clone();
        const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,point=new T.Vector3();
        for(const side of ['Right','Left']){
            const hand=rig.bones[side+'Hand'],index=mesh.skeleton.bones.indexOf(hand),height=rig.bones[side+'HandMiddle1'].position.y;if(index<0)continue;
            for(let i=0;i<ids.count;i++){
                let amount=0;for(let k=0;k<4;k++)if(ids.getComponent(i,k)===index)amount+=weights.getComponent(i,k);
                if(amount<.6)continue;
                mesh.getVertexPosition(i,point);mesh.localToWorld(point);hand.worldToLocal(point);
                if(point.y<height*.28||point.y>height*.86||Math.abs(point.x)>height*.4)continue;
                ids.setXYZW(i,index,0,0,0);weights.setXYZW(i,1,0,0,0);
            }
        }
        ids.needsUpdate=weights.needsUpdate=true;
        palmGeometryCache.set(sourceGeometry,mesh.geometry);
    });
}

// Pick an actual glove vertex near the centre of the palm, rather than treating
// the wrist joint as the skin contact. Cached once for each character.
export function palmSurfacePoint(rig,side) {
    rig.palmSurfaces??={};if(rig.palmSurfaces[side])return rig.palmSurfaces[side];
    const hand=rig.bones[side+'Hand'],knuckle=rig.bones[side+'HandMiddle1'];
    const center=new T.Vector3(0,knuckle.position.y*.65,1.5),point=new T.Vector3();
    let best=null,score=Infinity;
    rig.object.updateMatrixWorld(true);
    const meshes=[];rig.object.traverse(mesh=>{if(mesh.isSkinnedMesh){mesh.skeleton.update();mesh.computeBoundingSphere();meshes.push(mesh);}});
    const ray=new T.Raycaster(hand.localToWorld(new T.Vector3(0,center.y,knuckle.position.y*2)),new T.Vector3(0,0,-1).transformDirection(hand.matrixWorld));
    for(const hit of ray.intersectObjects(meshes,false)){
        const mesh=hit.object,face=hit.face,index=mesh.skeleton.bones.indexOf(hand);if(!face||index<0)continue;
        const indices=[face.a,face.b,face.c],ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
        let amount=0;for(const i of indices)for(let k=0;k<4;k++)if(ids.getComponent(i,k)===index)amount+=weights.getComponent(i,k)/3;
        if(amount<.45||Math.abs(hand.worldToLocal(hit.point.clone()).z)>knuckle.position.y*.4)continue;
        const vertices=indices.map(i=>mesh.getVertexPosition(i,new T.Vector3()));
        const bary=T.Triangle.getBarycoord(mesh.worldToLocal(hit.point.clone()),...vertices,new T.Vector3());
        // This central palm face is rigid; retain the wrist and finger-joint blends elsewhere.
        for(const i of indices){ids.setXYZW(i,index,0,0,0);weights.setXYZW(i,1,0,0,0);}ids.needsUpdate=weights.needsUpdate=true;
        const local=vertices.reduce((v,p,i)=>v.addScaledVector(p,bary.getComponent(i)),new T.Vector3());
        (rig.palmSurfaceVertices??={})[side]={mesh,index:face.a,indices,bary};
        return rig.palmSurfaces[side]=hand.worldToLocal(mesh.localToWorld(local));
    }
    rig.object.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;
        mesh.skeleton.update();const index=mesh.skeleton.bones.indexOf(hand);if(index<0)return;
        const ids=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
        for(let i=0;i<ids.count;i++){
            let weight=0;for(let k=0;k<4;k++)if(ids.getComponent(i,k)===index)weight+=weights.getComponent(i,k);
            if(weight<.999)continue;
            mesh.getVertexPosition(i,point);mesh.localToWorld(point);hand.worldToLocal(point);
            if(point.z<=0)continue;
            const distance=(point.x-center.x)**2+(point.y-center.y)**2+(point.z-center.z)**2;
            if(distance<score){score=distance;best=point.clone();(rig.palmSurfaceVertices??={})[side]={mesh,index:i};}
        }
    });
    return rig.palmSurfaces[side]=best||center;
}

export function posedPalmPosition(rig,side,target=new T.Vector3()) {
    const sample=rig.palmSurfaceVertices?.[side];
    if(sample?.indices){target.set(0,0,0);for(let i=0;i<3;i++)target.addScaledVector(sample.mesh.getVertexPosition(sample.indices[i],new T.Vector3()),sample.bary.getComponent(i));return sample.mesh.localToWorld(target);}
    if(sample){sample.mesh.getVertexPosition(sample.index,target);return sample.mesh.localToWorld(target);}
    return rig.bones[side+'Hand'].localToWorld(palmSurfacePoint(rig,side).clone());
}

function surface(model,origin,direction) {
    model.updateWorldMatrix(true,true);
    const ray=new T.Raycaster(model.localToWorld(origin),direction.transformDirection(model.matrixWorld));
    const meshes=[];model.traverse(n=>{if(n.isMesh&&n.visible&&!/^Holo|M4_Holo/.test(n.name))meshes.push(n);});
    const hit=ray.intersectObjects(meshes,false)[0];
    return hit?model.worldToLocal(hit.point):null;
}

export function weaponContacts(rig,model,slot) {
    if(!model.getObjectByName('anchor_grip'))return null;
    rig.weaponContactCache??=new WeakMap();if(rig.weaponContactCache.has(model))return rig.weaponContactCache.get(model);
    const pistol=slot==='pistol';
    const frames=rig.animationHandRotations?.[pistol?'pistol':'rifle'];
    const orient=(side,fallback)=>frames?.[side]?.clone()||fallback.clone();
    const right=surface(model,new T.Vector3(.15,pistol?-.028:-.025,.018),new T.Vector3(-1,0,0));
    const left=pistol?surface(model,new T.Vector3(-.15,-.025,.018),new T.Vector3(1,0,0))
        :surface(model,new T.Vector3(0,-.3,slot==='assault'?-.23:-.30),new T.Vector3(0,1,0));
    const contacts=right&&left?{
        Right:{weaponPoint:right,palmPoint:palmSurfacePoint(rig,'Right'),rotation:orient('Right',rightRotation)},
        Left:{weaponPoint:left,palmPoint:palmSurfacePoint(rig,'Left'),rotation:orient('Left',pistol?pistolSupportRotation:supportRotation)}
    }:null;
    rig.weaponContactCache.set(model,contacts);return contacts;
}

export function contactWrist(rig,model,side,contact) {
    const skinOffset=contact.palmPoint.clone().multiply(rig.bones[side+'Hand'].getWorldScale(new T.Vector3())).applyQuaternion(contact.rotation).divide(model.getWorldScale(new T.Vector3()));
    return contact.weaponPoint.clone().sub(skinOffset);
}

export function fitPalmSurface(rig,model,side,contact,guide) {
    if(guide?.contact)return;
    const hand=rig.bones[side+'Hand'],rotation=hand.getWorldQuaternion(new T.Quaternion());
    const target=model.localToWorld(contact.weaponPoint.clone());
    const offset=new T.Vector3().fromArray(guide?.position||[0,0,0]);
    if(side==='Left')offset.multiply(model.getWorldScale(new T.Vector3()));
    target.add(offset.applyQuaternion(model.getWorldQuaternion(new T.Quaternion())));
    for(let i=0;i<3;i++){
        const error=target.clone().sub(posedPalmPosition(rig,side));if(error.lengthSq()<1e-8)break;
        const wrist=hand.getWorldPosition(new T.Vector3()).add(error);
        rig.solveIK(rig.bones[side+'Arm'],rig.bones[side+'ForeArm'],hand,wrist,rig.bones[side+'ForeArm'].getWorldPosition(new T.Vector3()));
        rig.alignForearmTwist(side,rotation);rig.setWorldRotation(hand,rotation);
    }
}
