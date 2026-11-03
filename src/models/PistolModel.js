import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export async function loadPistolModel() {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/assets/weapons/m9.glb');
    const body = new THREE.MeshStandardMaterial({ color: 0x313b42, metalness: 0.55, roughness: 0.42 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x141b1d, roughness: 0.86 });
    gltf.scene.traverse(mesh => {
        if (mesh.isMesh) mesh.material = /mesh_[235]$/.test(mesh.name) ? grip : body;
    });
    gltf.scene.scale.setScalar(1.2);
    gltf.scene.name = 'M9_Pistol';
    // The source contains multiple magazine variants at once. Keep one standard
    // magazine and attach its rounds so all reload parts move together.
    for (const name of ['mag_ext', 'mag_ext_rounds', 'mag_fast', 'mag_fast_rounds']) gltf.scene.getObjectByName(name).visible = false;
    const magazine = gltf.scene.getObjectByName('mag_std');
    const rounds = gltf.scene.getObjectByName('mag_std_rounds');
    gltf.scene.updateMatrixWorld(true); magazine.attach(rounds);
    const slide = gltf.scene.getObjectByName('act_slide');
    gltf.scene.userData.reloadParts = { magazine, magazineRest: magazine.position.clone(), slide, slideRest: slide.position.clone() };
    return gltf.scene;
}
