import * as T from 'three';

export function validateHandContact(value) {
    if (value == null) return null;
    const vector = (v, limit) => {
        if (!Array.isArray(v) || v.length !== 3 || !v.every(n => Number.isFinite(n) && Math.abs(n) <= limit)) throw Error('Invalid hand contact point.');
        return [...v];
    };
    return { weaponPoint: vector(value.weaponPoint, 10), palmPoint: vector(value.palmPoint, 100) };
}

// Run after wrist/joint edits, retaining the chosen wrist direction and bone lengths.
export function solveHandContact(rig, side, contact, model) {
    if (!contact || !model) return null;
    model.updateWorldMatrix(true, false);
    const hand = rig.bones[side + 'Hand'];
    hand.updateWorldMatrix(true, false);
    const desired = model.localToWorld(new T.Vector3().fromArray(contact.weaponPoint));
    const actual = hand.localToWorld(new T.Vector3().fromArray(contact.palmPoint));
    desired.lerp(actual, 1 - (contact.weight ?? 1));
    const wrist = hand.getWorldPosition(new T.Vector3()).add(desired.clone().sub(actual));
    const rotation = hand.getWorldQuaternion(new T.Quaternion());
    const pole = rig.bones[side + 'ForeArm'].getWorldPosition(new T.Vector3());
    rig.solveIK(rig.bones[side + 'Arm'], rig.bones[side + 'ForeArm'], hand, wrist, pole);
    rig.setWorldRotation(hand, rotation);
    hand.updateWorldMatrix(true, true);
    return hand.localToWorld(new T.Vector3().fromArray(contact.palmPoint)).distanceTo(desired);
}
