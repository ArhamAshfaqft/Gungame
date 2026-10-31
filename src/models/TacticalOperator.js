import * as THREE from 'three';

// Shared geometry helpers keep operator silhouettes consistent at every distance.
const up = new THREE.Vector3(0, 1, 0);
export function segment(parent, a, b, radius, material) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const length = start.distanceTo(end);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, 10), material);
    mesh.position.copy(start).lerp(end, 0.5);
    mesh.quaternion.setFromUnitVectors(up, end.sub(start).normalize());
    parent.add(mesh);
    return mesh;
}

function block(parent, size, pos, mat, bevel = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    mesh.position.set(...pos);
    mesh.rotation.z = bevel;
    parent.add(mesh);
    return mesh;
}

export function tacticalMaterials() {
    const fabric = new THREE.MeshStandardMaterial({ color: 0x535b45, roughness: 0.94 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x30392f, roughness: 0.86 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x171c1c, roughness: 0.8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x444d50, roughness: 0.42, metalness: 0.65 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x182d30, roughness: 0.18, metalness: 0.65 });
    return { fabric, armor, rubber, metal, lens };
}

export function createOperator(variant = 0) {
    const root = new THREE.Group();
    const m = tacticalMaterials();
    m.fabric.color.setHex([0x62664c, 0x665c49, 0x4e5d58][variant % 3]);
    // Torso and plate carrier, with separate collar, cummerbund and shoulder straps.
    segment(root, [0, 0.86, 0], [0, 1.43, 0], 0.205, m.fabric);
    block(root, [0.43, 0.43, 0.26], [0, 1.22, 0.025], m.armor);
    block(root, [0.44, 0.085, 0.29], [0, 1.01, 0], m.rubber);
    for (const x of [-0.15, 0.15]) {
        block(root, [0.07, 0.12, 0.29], [x, 1.45, 0], m.armor);
        block(root, [0.11, 0.17, 0.075], [x, 1.17, 0.18], m.fabric);
        block(root, [0.085, 0.025, 0.085], [x, 1.24, 0.19], m.rubber);
    }
    for (let i = 0; i < 4; i++) block(root, [0.32, 0.012, 0.015], [0, 1.27 + i * 0.035, 0.165], m.fabric);
    block(root, [0.31, 0.35, 0.14], [0, 1.23, -0.21], m.fabric);
    block(root, [0.08, 0.17, 0.09], [0.26, 1.3, -0.02], m.rubber);
    segment(root, [0.28, 1.37, -0.02], [0.28, 1.63, -0.02], 0.009, m.rubber);
    // Balaclava, helmet shell, headset and goggles. Forward is +Z.
    segment(root, [0, 1.5, 0], [0, 1.69, 0], 0.115, m.rubber);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.147, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), m.fabric);
    helmet.position.set(0, 1.7, 0);
    root.add(helmet);
    block(root, [0.25, 0.035, 0.24], [0, 1.72, 0.025], m.armor);
    block(root, [0.215, 0.07, 0.065], [0, 1.66, 0.108], m.rubber);
    for (const x of [-0.055, 0.055]) block(root, [0.085, 0.044, 0.012], [x, 1.66, 0.147], m.lens);
    for (const x of [-0.145, 0.145]) block(root, [0.04, 0.11, 0.09], [x, 1.65, 0], m.armor);
    block(root, [0.04, 0.055, 0.035], [0, 1.79, 0.13], m.metal);
    // Bent arms hold a shouldered rifle instead of a static T pose.
    segment(root, [-0.22, 1.4, 0], [-0.34, 1.17, 0.17], 0.088, m.fabric);
    segment(root, [-0.34, 1.17, 0.17], [-0.06, 1.29, 0.46], 0.069, m.fabric);
    segment(root, [0.22, 1.4, 0], [0.34, 1.19, 0.04], 0.088, m.fabric);
    segment(root, [0.34, 1.19, 0.04], [0.1, 1.31, 0.23], 0.069, m.fabric);
    block(root, [0.11, 0.10, 0.14], [-0.06, 1.3, 0.46], m.rubber, -0.3);
    block(root, [0.1, 0.1, 0.12], [0.1, 1.32, 0.23], m.rubber, 0.2);
    const rifle = new THREE.Group();
    rifle.position.set(0.05, 1.38, 0.18);
    block(rifle, [0.07, 0.09, 0.43], [0, 0, 0.14], m.metal);
    block(rifle, [0.08, 0.15, 0.22], [0, -0.015, -0.15], m.rubber);
    block(rifle, [0.055, 0.16, 0.09], [0, -0.1, 0.09], m.rubber);
    segment(rifle, [0, 0.015, 0.32], [0, 0.015, 0.88], 0.018, m.metal);
    segment(rifle, [0, 0.1, 0], [0, 0.1, 0.28], 0.038, m.rubber);
    root.add(rifle);
    const legs = [];
    for (const x of [-0.12, 0.12]) {
        const leg = new THREE.Group();
        leg.position.set(x, 0.92, 0);
        segment(leg, [0, 0, 0], [0, -0.43, 0.025], 0.105, m.fabric);
        segment(leg, [0, -0.43, 0.025], [0, -0.79, 0], 0.082, m.fabric);
        block(leg, [0.14, 0.16, 0.065], [0, -0.42, 0.10], m.armor);
        block(leg, [0.17, 0.15, 0.28], [0, -0.85, 0.045], m.rubber);
        block(leg, [0.12, 0.18, 0.08], [Math.sign(x) * 0.075, -0.18, 0], m.fabric);
        root.add(leg);
        legs.push(leg);
    }
    root.userData.legs = legs;
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return root;
}

export function createViewArms() {
    const root = new THREE.Group();
    const m = tacticalMaterials();
    // Rifle-space wrist positions: trigger hand and supporting hand beneath the rail.
    segment(root, [0.22, -0.4, 0.52], [0.16, -0.25, 0.21], 0.075, m.fabric);
    segment(root, [0.16, -0.25, 0.21], [0.035, -0.11, 0.16], 0.06, m.fabric);
    segment(root, [-0.30, -0.38, 0.5], [-0.28, -0.23, -0.08], 0.078, m.fabric);
    segment(root, [-0.28, -0.23, -0.08], [-0.015, -0.07, -0.32], 0.058, m.fabric);
    block(root, [0.09, 0.12, 0.12], [0.035, -0.07, 0.17], m.rubber, -0.22);
    block(root, [0.09, 0.075, 0.17], [-0.015, -0.06, -0.32], m.rubber, 0.15);
    for (let i = 0; i < 4; i++) {
        block(root, [0.021, 0.065, 0.025], [0.012 + i * 0.022, -0.05, 0.13], m.rubber);
        block(root, [0.065, 0.021, 0.022], [0.012, -0.04, -0.38 + i * 0.03], m.rubber);
    }
    block(root, [0.08, 0.035, 0.065], [-0.15, -0.15, -0.21], m.rubber);
    block(root, [0.055, 0.012, 0.044], [-0.15, -0.13, -0.21], m.lens);
    return root;
}
