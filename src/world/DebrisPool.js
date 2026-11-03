import * as THREE from 'three';

// One draw call per material, with a hard cap even if every window and door breaks at once.
export class DebrisPool {
    constructor(scene, geometry, material, capacity, { groundHeight = () => 0,supportRevision=null,supportOwner=null,gravity=14,drag=0,flutter=0,supportInterval=0,supportTravel=.3 } = {}) {
        this.groundHeight = groundHeight;
        Object.assign(this,{supportRevision,supportOwner,gravity,drag,flutter,supportInterval,supportTravel});
        this.supportClock=0;
        geometry.computeBoundingBox();this.shapeBounds=geometry.boundingBox.clone();this.bounds=new THREE.Box3();
        this.capacity = capacity;
        this.slots = new Array(capacity).fill(null);
        this.cursor = 0;
        const opacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
        geometry.setAttribute('debrisOpacity', opacity);
        this.opacity = opacity;
        material = material.clone();
        material.transparent = true;
        material.depthWrite = false;
        material.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float debrisOpacity; varying float vDebrisOpacity;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDebrisOpacity = debrisOpacity;');
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDebrisOpacity;')
                .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vDebrisOpacity;');
        };
        material.customProgramCacheKey = () => 'instanced-debris-opacity-v1';
        this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.count = 0;
        this.matrix = new THREE.Matrix4();
        this.scale = new THREE.Vector3(1, 1, 1);
        scene.add(this.mesh);
    }

    get pieces() { return this.slots.filter(Boolean); }

    spawn(position, velocity, shape, spin, life = 4, color = null) {
        // Preserve retained rubble within a fixed GPU budget.
        let index = -1;
        for (let n = 0; n < this.capacity; n++) {
            const candidate = this.cursor++ % this.capacity;
            if (!this.slots[candidate] || Number.isFinite(this.slots[candidate].life)) { index = candidate; break; }
        }
        if (index < 0) return;
        if(color){this.mesh.setColorAt(index,color);this.mesh.instanceColor.needsUpdate=true;}
        this.slots[index] = { position: position.clone(), velocity: velocity.clone(), shape: shape.clone(),
            rotation: new THREE.Quaternion(), spin: spin.clone(), life, settled: false,restYaw:Math.random()*Math.PI*2 };
        this.mesh.count = Math.max(this.mesh.count, index + 1);
        this.write(index, this.slots[index]);
        this.mesh.instanceMatrix.needsUpdate = true;
        this.opacity.needsUpdate = true;
    }

    write(index, piece) {
        this.matrix.compose(piece.position, piece.rotation, this.scale).multiply(piece.shape);
        this.mesh.setMatrixAt(index, this.matrix);
        this.opacity.setX(index, Math.min(1, piece.life / 0.8));
    }

    update(delta) {
        const step = Math.min(delta, 0.05);
        this.supportClock+=delta;const checkSupport=this.supportClock>=.25;if(checkSupport)this.supportClock=0;
        let last = 0;
        let changed = false;
        const revision=this.supportRevision?.();let supportBudget=48;
        for (let i = 0; i < this.mesh.count; i++) {
            const piece = this.slots[i];
            if (!piece) continue;
            piece.life -= delta;
            if (piece.life <= 0) {
                this.slots[i] = null;
                this.opacity.setX(i, 0);
                this.mesh.setMatrixAt(i, this.matrix.makeScale(0, 0, 0));
                changed = true;
                continue;
            }
            last = i + 1;
            const dirty=this.supportOwner?piece.supportDirty||!this.supportUnchanged(piece.supportState):this.supportRevision?piece.supportRevision!==revision:checkSupport;
            if(piece.settled&&dirty&&supportBudget>0){
                supportBudget--;piece.supportRevision=revision;
                const floor=this.groundHeight(piece.position,piece.position.y+.01);piece.supportState=this.captureSupport(floor);piece.supportDirty=false;if(Math.abs(piece.position.y-this.bottomOffset(piece)-floor)>.025){piece.settled=false;piece.supportSample=null;piece.velocity.set(0,0,0);}
            }
            if (piece.settled && !Number.isFinite(piece.life)) continue;
            if (!piece.settled) {
                const previousY=piece.position.y;
                piece.velocity.y -= this.gravity * step;
                if(this.drag){piece.velocity.x*=Math.exp(-this.drag*step);piece.velocity.z*=Math.exp(-this.drag*step);}
                if(this.flutter){piece.velocity.x+=Math.sin(piece.life*8+i)*this.flutter*step;piece.velocity.z+=Math.cos(piece.life*7+i)*this.flutter*step;}
                piece.position.addScaledVector(piece.velocity, step);
                piece.rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(piece.spin.x * step, piece.spin.y * step, piece.spin.z * step)));
                piece.supportTime=(piece.supportTime||0)+delta;
                const sample=piece.supportSample;
                if(!sample||!this.supportInterval||piece.supportTime>=this.supportInterval||Math.hypot(piece.position.x-sample.x,piece.position.z-sample.z)>this.supportTravel){
                    const ceiling=Math.max(previousY,sample?.ceiling??previousY)+.01,height=this.groundHeight(piece.position,ceiling);
                    piece.supportSample={height,x:piece.position.x,z:piece.position.z,revision,ceiling:previousY,state:this.captureSupport(height)};piece.supportTime=0;
                }
                const offset=this.bottomOffset(piece);let support=piece.supportSample.height,floor=support+offset;
                if(piece.position.y<floor&&this.supportInterval){support=this.groundHeight(piece.position,Math.max(previousY,piece.supportSample.ceiling)+.01);floor=support+offset;piece.supportSample={height:support,x:piece.position.x,z:piece.position.z,revision,ceiling:previousY,state:this.captureSupport(support)};}
                if (piece.position.y < floor) {
                    piece.position.y = floor;
                    if (Math.abs(piece.velocity.y) < 0.8&&Math.hypot(piece.velocity.x,piece.velocity.z)<.3){
                        piece.settled=true;
                        piece.supportRevision=piece.supportSample?.revision??revision;
                        piece.supportState=piece.supportSample.state;piece.supportDirty=false;
                        const q=new THREE.Quaternion();piece.shape.decompose(new THREE.Vector3(),q,new THREE.Vector3());
                        piece.rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),piece.restYaw).multiply(q.invert());
                        piece.position.y=support+this.bottomOffset(piece);piece.velocity.set(0,0,0);piece.spin.set(0,0,0);
                    }
                    piece.velocity.y *= -0.22;
                    piece.velocity.x *= 0.55; piece.velocity.z *= 0.55;
                    piece.spin.multiplyScalar(0.4);
                }
            }
            this.write(i, piece);
            changed = true;
        }
        this.mesh.count = last;
        if (changed) {
            this.opacity.needsUpdate = true;
            this.mesh.instanceMatrix.needsUpdate = true;
        }
    }

    bottomOffset(piece){
        this.matrix.compose(new THREE.Vector3(),piece.rotation,this.scale).multiply(piece.shape);
        this.bounds.copy(this.shapeBounds).applyMatrix4(this.matrix);
        return Math.max(.001,-this.bounds.min.y);
    }

    captureSupport(height){const mesh=this.supportOwner?.();return mesh?{mesh,geometry:mesh.geometry,positions:mesh.geometry.attributes.position.version,index:mesh.geometry.index?.version,matrix:mesh.matrixWorld.clone()}:height===0?{ground:true}:null;}
    supportUnchanged(state){if(state?.ground)return true;return !!state&&state.mesh.visible&&state.mesh.geometry===state.geometry&&state.mesh.geometry.attributes.position.version===state.positions&&state.mesh.geometry.index?.version===state.index&&state.matrix.equals(state.mesh.matrixWorld);}

    clear() {
        this.slots.fill(null);
        this.cursor = 0;
        this.mesh.count = 0;
        this.opacity.array.fill(0);
        this.opacity.needsUpdate = true;
    }

    wake() {
        for (const piece of this.slots) if (piece) {if(this.supportOwner)piece.supportDirty=!this.supportUnchanged(piece.supportState);else if(this.supportRevision)piece.supportRevision=null;else piece.settled=false;}
    }
}
