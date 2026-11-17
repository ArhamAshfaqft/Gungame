import * as T from 'three';
import {torsoEnvelope,torsoClearance} from './ArmClearance.js';
const stocks=new WeakMap();
// Read the buttpad from the actual mesh once; the scope and muzzle are excluded.
export function sniperStock(model){
    if(stocks.has(model))return stocks.get(model);
    model.updateWorldMatrix(true,true);
    const inverse=model.matrixWorld.clone().invert(),points=[];
    model.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const matrix=inverse.clone().multiply(mesh.matrixWorld),positions=mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++)points.push(new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix));
    });
    const rear=Math.max(...points.map(p=>p.z)),pad=points.filter(p=>p.z>rear-.004);
    const bounds=new T.Box3().setFromPoints(pad),contact=bounds.getCenter(new T.Vector3());
    const stock={contact,points:points.filter(p=>p.z>rear-.15)};stocks.set(model,stock);return stock;
}
export function seatSniperStock(rig,model,state={},bindings){
    const body=torsoEnvelope(rig,rig.object.getWorldQuaternion(new T.Quaternion()));
    const ads=T.MathUtils.clamp(state.adsProgress??(state.isAiming?1:0),0,1);
    const target=rig.bones.RightArm.getWorldPosition(new T.Vector3())
        .addScaledVector(body.across,-.01).addScaledVector(body.up,.11-.02*(1-ads))
        .addScaledVector(new T.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new T.Quaternion())),.03);
    const stock=sniperStock(model),current=model.localToWorld(stock.contact.clone());
    model.position.copy(model.parent.worldToLocal(model.getWorldPosition(new T.Vector3()).add(target.clone().sub(current))));
    model.updateMatrixWorld(true);
    // The buttpad can settle over the shoulder pocket as the sights pitch.
    // Project the entire rifle into arm reach, then out of the vest, keeping
    // both constraints active instead of solving one and breaking the other.
    const limits=['Right','Left'].map(side=>{
        const hand=rig.bones[side+'Hand'],upper=rig.bones[side+'Arm'],lower=rig.bones[side+'ForeArm'],binding=bindings[side];
        const rotation=binding.anchor.getWorldQuaternion(new T.Quaternion()).multiply(binding.sample.frame.clone().invert());
        const wrist=binding.anchor.getWorldPosition(new T.Vector3()).sub(binding.sample.point.clone().multiply(hand.getWorldScale(new T.Vector3())).applyQuaternion(rotation));
        const a=upper.getWorldPosition(new T.Vector3()),b=lower.getWorldPosition(new T.Vector3());
        return {a,wrist,radius:(a.distanceTo(b)+b.distanceTo(hand.getWorldPosition(new T.Vector3())))*.99};
    });
    const shift=new T.Vector3(),point=new T.Vector3();
    const worldPoints=stock.points.map(p=>model.localToWorld(p.clone()));
    for(let pass=0;pass<16;pass++){
        const previous=shift.clone();
        for(const {a,wrist,radius} of limits){
            const delta=wrist.clone().add(shift).sub(a),length=delta.length();
            if(length>radius)shift.addScaledVector(delta,(radius-length)/length);
        }
        for(const source of worldPoints){
            point.copy(source).add(shift);
            if(torsoClearance(point,body,0)>=.002)continue;
            const relative=point.clone().sub(body.center);
            const x=relative.dot(body.across)/body.x,y=relative.dot(body.up)/body.y,z=relative.dot(body.front)/body.z;
            const norm=Math.sqrt(x*x+y*y+z*z),direction=body.across.clone().multiplyScalar(x/body.x).addScaledVector(body.up,y/body.y).addScaledVector(body.front,z/body.z).normalize();
            shift.addScaledVector(direction,(1-norm)*Math.min(body.x,body.y,body.z)+.002);
        }
        shift.clampLength(0,.10);
        if(previous.distanceToSquared(shift)<1e-12)break;
    }
    model.position.copy(model.parent.worldToLocal(model.getWorldPosition(new T.Vector3()).add(shift)));model.updateMatrixWorld(true);
    rig.stockContact={target:target.add(shift),actual:model.localToWorld(stock.contact.clone())};
}
