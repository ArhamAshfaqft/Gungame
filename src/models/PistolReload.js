import * as THREE from 'three';

const smooth = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export function pistolReloadState(progress) {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const present = smooth(t / 0.15) * (1 - smooth((t - 0.82) / 0.18));
    // Out, exchange below the frame, then seat a fresh magazine.
    let extraction = 0;
    if (t >= 0.2 && t < 0.44) extraction = smooth((t - 0.2) / 0.24);
    else if (t >= 0.44 && t < 0.52) extraction = 1;
    else if (t >= 0.52 && t < 0.76) extraction = 1 - smooth((t - 0.52) / 0.24);
    const contact = smooth((t - 0.03) / 0.13) * (1 - smooth((t - 0.76) / 0.2));
    const slide = smooth((t - 0.77) / 0.055) * (1 - smooth((t - 0.835) / 0.055));
    return { progress: t, present, contact, extraction, slide,
        groupPosition: new THREE.Vector3(-0.055 * present, 0.045 * present, 0.025 * present),
        groupRotation: new THREE.Euler(-0.06 * present, -0.16 * present, 0.24 * present),
        magazineVisible: t < 0.43 || t > 0.51,
        magazineDrop: extraction * 0.13 };
}

export function applyPistolMechanics(model, progress = 0, shotProgress = null) {
    const parts = model?.userData.reloadParts; if (!parts) return;
    const state = pistolReloadState(progress);
    parts.magazine.position.copy(parts.magazineRest).add(new THREE.Vector3(0, -state.magazineDrop, 0));
    parts.magazine.visible = state.magazineVisible;
    parts.magazine.rotation.set(0, 0, 0);
    parts.slide.position.copy(parts.slideRest);
    parts.slide.position.z += state.slide * 0.025;
    if (shotProgress !== null) parts.slide.position.z += Math.sin(THREE.MathUtils.clamp(shotProgress, 0, 1) * Math.PI) * 0.022;
}

export function applyPistolReloadFraming(position, rotation, progress) {
    const state = pistolReloadState(progress);
    position.add(state.groupPosition);
    rotation.x += state.groupRotation.x; rotation.y += state.groupRotation.y; rotation.z += state.groupRotation.z;
    return state;
}

export function pistolReloadMotion(progress, custom = null) {
    const state = pistolReloadState(progress);
    const rest = new THREE.Vector3(-0.045, -0.075, 0.11);
    // Wrist sits below the magazine's floorplate; fingers wrap toward the front.
    const contact = new THREE.Vector3(-0.02, -0.11 - state.magazineDrop * 1.2, 0.035);
    const leftOffset = contact.sub(rest).multiplyScalar(state.contact);
    if (custom) leftOffset.addScaledVector(new THREE.Vector3().fromArray(custom.Left.position), -state.contact);
    return { id: 'pistolReload', coordinated: true, progress: state.progress, contact: state.contact,
        hands: { Left: { position: leftOffset, rotation: new THREE.Quaternion() },
            Right: { position: new THREE.Vector3(), rotation: new THREE.Quaternion() } } };
}
