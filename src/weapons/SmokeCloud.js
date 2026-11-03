import * as THREE from 'three';
import { seededRandom } from '../world/FractureGeometry.js';

let texture;
function smokeTexture() {
    if (texture) return texture;
    const size = 64, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = x / (size - 1) * 2 - 1, v = y / (size - 1) * 2 - 1;
        const noise = 0.75 + Math.sin(x * 0.31 + Math.sin(y * 0.24) * 2) * 0.12 + Math.sin(y * 0.6 + x * 0.22) * 0.08;
        const alpha = Math.pow(Math.max(0, 1 - Math.hypot(u, v)), 0.65) * noise;
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(alpha * 255);
    }
    texture = new THREE.DataTexture(data, size, size); texture.needsUpdate = true;
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    return texture;
}

export class SmokeCloud {
    constructor(scene, center, clipBounds = null) {
        this.center = center.clone(); this.radius = 3; this.age = 0; this.duration = 14;
        this.clipBounds = clipBounds;
        const material = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: { map: { value: smokeTexture() }, opacity: { value: 0 },
                clipMin: { value: clipBounds?.min || new THREE.Vector3(-1e4, -1e4, -1e4) },
                clipMax: { value: clipBounds?.max || new THREE.Vector3(1e4, 1e4, 1e4) } },
            vertexShader: `varying vec2 vUv; varying vec3 vWorld;
                void main(){
                    vUv=uv;
                    vec4 center=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
                    float size=length(instanceMatrix[0].xyz);
                    vec4 view=viewMatrix*center;
                    view.xy+=position.xy*size;
                    vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
                    vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
                    vWorld=center.xyz+(right*position.x+up*position.y)*size;
                    gl_Position=projectionMatrix*view;
                }`,
            fragmentShader: `uniform sampler2D map; uniform float opacity; uniform vec3 clipMin,clipMax;
                varying vec2 vUv; varying vec3 vWorld;
                void main(){
                    if(any(lessThan(vWorld,clipMin))||any(greaterThan(vWorld,clipMax)))discard;
                    float a=texture2D(map,vUv).a*opacity;
                    if(a<.006)discard;
                    gl_FragColor=vec4(vec3(.36,.39,.4),a);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }`,
        });
        this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, 36);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
        this.puffs = [];
        const random = seededRandom(9182);
        for (let i = 0; i < 36; i++) {
            const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * 2;
            this.puffs.push({ offset: new THREE.Vector3(Math.cos(angle) * distance, random() * 2.4 - 0.4, Math.sin(angle) * distance), size: 2.8 + random() * 1.4 });
        }
        this.matrix = new THREE.Matrix4(); scene.add(this.mesh); this.update(0);
    }
    get strength() { return Math.min(1, this.age / 0.8) * Math.min(1, Math.max(0, (this.duration - this.age) / 2)); }
    update(delta) {
        this.age += delta;
        const growth = 0.3 + Math.min(1, this.age / 1.5) * 0.7;
        this.puffs.forEach((puff, i) => {
            const p = this.center.clone().addScaledVector(puff.offset, growth);
            p.y = Math.max(0.4, p.y);
            this.matrix.makeScale(puff.size * growth, puff.size * growth, puff.size * growth).setPosition(p);
            this.mesh.setMatrixAt(i, this.matrix);
        });
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.material.uniforms.opacity.value = this.strength * 0.72;
    }
    opacityAt(point) {
        if (this.clipBounds && !this.clipBounds.containsPoint(point)) return 0;
        const distance = point.distanceTo(this.center.clone().add(new THREE.Vector3(0, 0.8, 0)));
        return this.strength * Math.max(0, 1 - distance / this.radius) * 0.98;
    }
    dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
