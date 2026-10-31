import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let templatePromise;
export async function loadSniperModel() {
    templatePromise ||= (async () => {
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        const [rifle, optic] = await Promise.all([
            loader.loadAsync('/assets/weapons/m98b.glb'),
            loader.loadAsync('/assets/weapons/scope.glb'),
        ]);
        const body = new THREE.MeshStandardMaterial({ color: 0x303a43, roughness: 0.45, metalness: 0.55 });
        const barrel = new THREE.MeshStandardMaterial({ color: 0x222832, roughness: 0.35, metalness: 0.7 });
        const scope = new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.3, metalness: 0.75 });
        rifle.scene.traverse(mesh => {
            if (mesh.isMesh) mesh.material = /mesh_[17]$/.test(mesh.name) ? barrel : body;
        });
        optic.scene.traverse(mesh => { if (mesh.isMesh) mesh.material = scope; });
        optic.scene.position.set(0.016, 0.102, -0.12);
        rifle.scene.add(optic.scene);
        rifle.scene.name = 'M98B_Scoped';
        return rifle.scene;
    })();
    return (await templatePromise).clone(true);
}
