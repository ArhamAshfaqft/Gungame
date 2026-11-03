import * as THREE from 'three';

const templates = new Map();
export function grenadeModelPosition(throwProgress = 0, mode = 'high') {
    const reach = Math.min(1, throwProgress / 0.4);
    return [0.06, -0.02 + (mode === 'low' ? -0.06 : 0.14) * reach, 0.02 - (mode === 'low' ? 0.14 : 0.24) * reach];
}
export function applyGrenadePlacement(model, throwProgress = 0, mode = 'high', pose = null) {
    model.position.fromArray(grenadeModelPosition(throwProgress, mode));
    if (pose?.item) model.position.add(new THREE.Vector3().fromArray(pose.item.position));
    model.rotation.set(...(pose?.item?.rotation || [0, 0, 0]));
}
export function createGrenadeModel(type) {
    if (!templates.has(type)) {
        const group = new THREE.Group();
        const color = { frag: 0x566043, flash: 0x7b8283, smoke: 0x52656a }[type];
        const body = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.65 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x242c2c, metalness: 0.65, roughness: 0.45 });
        const shell = new THREE.Mesh(type === 'frag'
            ? new THREE.SphereGeometry(0.058, 12, 8)
            : new THREE.CylinderGeometry(0.04, 0.04, 0.14, 12), body);
        if (type === 'frag') shell.scale.y = 1.15;
        group.add(shell);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.025, 8), dark);
        cap.position.y = 0.075;
        group.add(cap);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.11, 0.015), dark);
        lever.position.set(0.04, 0.035, 0);
        lever.rotation.z = -0.25;
        group.add(lever);
        const pin = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 5, 12), dark);
        pin.name = 'SafetyPin'; pin.position.set(-0.025, 0.08, 0.015);
        group.add(pin);
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.016, 12), new THREE.MeshStandardMaterial({
            color: type === 'smoke' ? 0xbfc8c6 : type === 'flash' ? 0xa5c4ca : 0xa09a58, roughness: 0.8,
        }));
        stripe.position.y = -0.025;
        if (type !== 'frag') group.add(stripe);
        templates.set(type, group);
    }
    return templates.get(type).clone(true);
}
