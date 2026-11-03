import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLibrary, emptyPose, validateLibrary, readLibrary, saveLibrary, blendPose, copyGripToOtherStance, POSE_KEYS, THROWABLE_KEYS, throwablePose } from '../src/studio/PoseLibrary.js';

test('pose libraries round-trip through storage without sharing mutable defaults', () => {
    let stored;
    const storage = { getItem: () => stored, setItem: (key, value) => { stored = value; } };
    const library = emptyLibrary(); library.poses['pistol:hip'].Right.position[0] = 0.025;
    assert.equal(library.poses['primary:hip'].Right.position[0], 0);
    saveLibrary(library, storage);
    assert.deepEqual(readLibrary(storage), library);
    const clean = validateLibrary(library); clean.poses['pistol:hip'].Right.position[0] = 0;
    assert.equal(library.poses['pistol:hip'].Right.position[0], 0.025);
});

test('malformed, missing, non-finite and unsafe imported poses are rejected', () => {
    assert.throws(() => validateLibrary({ version: 5 }));
    for (const value of [Infinity, NaN, '0.1', 1]) {
        const library = emptyLibrary(); library.poses['primary:hip'].Left.position[0] = value;
        assert.throws(() => validateLibrary(library));
    }
    const missing = emptyLibrary(); delete missing.poses['pistol:aim']; assert.throws(() => validateLibrary(missing));
    assert.deepEqual(readLibrary({ getItem: () => '{invalid' }), emptyLibrary());
    assert.deepEqual(readLibrary({ getItem: () => { throw new Error('storage blocked'); } }), emptyLibrary());
});

test('hip/aim interpolation includes weapon, arm, wrist and individual finger adjustments', () => {
    const a = emptyPose(), b = emptyPose();
    b.weapon.position[0] = 0.1; b.Left.shoulder[1] = 0.2; b.Left.elbow[2] = -0.2;
    b.Right.rotation[0] = 1; b.Right.fingers.Index[1] = 0.8;
    b.Right.handRotation[1] = 0.4; b.Left.elbowRotation[0] = 0.8; b.Left.shoulderRotation[2] = 0.2;
    const mixed = blendPose(a, b, 0.25);
    assert.equal(mixed.weapon.position[0], 0.025); assert.equal(mixed.Left.shoulder[1], 0.05);
    assert.equal(mixed.Left.elbow[2], -0.05); assert.equal(mixed.Right.rotation[0], 0.25);
    assert.equal(mixed.Right.fingers.Index[1], 0.2);
    assert.equal(a.weapon.position[0], 0);
    assert.equal(mixed.Right.handRotation[1], 0.1); assert.equal(mixed.Left.elbowRotation[0], 0.2); assert.equal(mixed.Left.shoulderRotation[2], 0.05);
});

test('older saved libraries retain their edits and gain neutral independent joint rotations', () => {
    const old = emptyLibrary(); old.poses['primary:hip'].Left.rotation[1] = 1.4;
    for (const pose of Object.values(old.poses)) for (const side of ['Left', 'Right']) for (const field of ['handRotation', 'elbowRotation', 'shoulderRotation']) delete pose[side][field];
    const migrated = validateLibrary(old);
    assert.equal(migrated.poses['primary:hip'].Left.rotation[1], 1.4);
    assert.deepEqual(migrated.poses['primary:hip'].Left.handRotation, [0, 0, 0]);
    migrated.poses['primary:hip'].Left.handRotation[1] = Infinity;
    assert.throws(() => validateLibrary(migrated));
});

test('sharing a grip updates both hands while preserving distinct weapon framing and other weapons', () => {
    const library = emptyLibrary();
    library.poses['pistol:aim'].Right.handRotation[1] = 0.4;
    library.poses['pistol:aim'].Left.position[0] = 0.025;
    library.poses['pistol:aim'].weapon.position[1] = -0.1;
    library.poses['pistol:hip'].weapon.position[1] = 0.15;
    copyGripToOtherStance(library, 'pistol', 'aim');
    assert.deepEqual(library.poses['pistol:hip'].Right, library.poses['pistol:aim'].Right);
    assert.equal(library.poses['pistol:hip'].Left.position[0], 0.025);
    assert.equal(library.poses['pistol:hip'].weapon.position[1], 0.15);
    assert.equal(library.poses['primary:hip'].Right.handRotation[1], 0);
    library.poses['pistol:aim'].Right.handRotation[1] = 0.8;
    assert.equal(library.poses['pistol:hip'].Right.handRotation[1], 0.4);
});

test('old firearm-only presets migrate to twelve neutral throwable poses without altering firearms', () => {
    const old = emptyLibrary(); old.poses['primary:hip'].weapon.position = [0.041, -0.056, -0.01];
    old.poses['pistol:aim'].Right.handRotation[1] = 0.4;
    for (const key of THROWABLE_KEYS) delete old.poses[key];
    const migrated = validateLibrary(old);
    for (const key of POSE_KEYS) assert.deepEqual(migrated.poses[key], old.poses[key]);
    for (const key of THROWABLE_KEYS) assert.deepEqual(migrated.poses[key], emptyLibrary().poses[key]);
    migrated.poses['flash:pin'].Right.position = [NaN, 0, 0];
    assert.throws(() => validateLibrary(migrated));
});

test('throwable hold, pin, high and low pose edits blend independently per type', () => {
    const library = emptyLibrary();
    library.poses['frag:hold'].Right.handRotation[1] = 0.2;
    library.poses['frag:pin'].Right.handRotation[1] = 0.6;
    library.poses['frag:high'].weapon.position[0] = 0.1;
    library.poses['frag:low'].weapon.position[0] = -0.1;
    assert.equal(throwablePose(library, 'frag').Right.handRotation[1], 0.2);
    assert.ok(Math.abs(throwablePose(library, 'frag', { pinProgress: 0.5 }).Right.handRotation[1] - 0.6) < 0.00001);
    assert.equal(throwablePose(library, 'frag', { throwing: true, throwProgress: 0.3, mode: 'high' }).weapon.position[0], 0.1);
    assert.equal(throwablePose(library, 'frag', { throwing: true, throwProgress: 0.3, mode: 'low' }).weapon.position[0], -0.1);
    assert.equal(throwablePose(library, 'smoke').Right.handRotation[1], 0);
});

test('grenade-only offsets migrate, save and blend independently of hand and group offsets', () => {
    const old = emptyLibrary();
    old.poses['frag:hold'].weapon.position[1] = 0.151;
    old.poses['frag:hold'].Right.position[1] = -0.017;
    for (const key of THROWABLE_KEYS) delete old.poses[key].item;
    const library = validateLibrary(old);
    assert.deepEqual(library.poses['frag:hold'].item.position, [0, 0, 0]);
    library.poses['frag:hold'].item.position[0] = 0.05;
    library.poses['frag:high'].item.position[0] = 0.15;
    library.poses['frag:high'].item.rotation[2] = 0.4;
    const blended = throwablePose(library, 'frag', { throwing: true, throwProgress: 0.15 });
    assert.ok(Math.abs(blended.item.position[0] - 0.1) < 0.00001);
    assert.equal(blended.item.rotation[2], 0.2);
    assert.equal(library.poses['frag:hold'].weapon.position[1], 0.151);
    assert.equal(library.poses['frag:hold'].Right.position[1], -0.017);
    assert.deepEqual(validateLibrary(library).poses['frag:high'].item, library.poses['frag:high'].item);
    library.poses['frag:hold'].item.rotation[0] = Infinity;
    assert.throws(() => validateLibrary(library));
});

test('third-person placement migrates separately and round-trips without altering first-person poses', () => {
    const old = emptyLibrary(); delete old.thirdPerson;
    old.poses['pistol:aim'].Right.position[1] = 0.026;
    const migrated = validateLibrary(old);
    assert.deepEqual(migrated.poses, old.poses);
    assert.deepEqual(migrated.thirdPerson.pistol, { position: [0, 0, 0], rotation: [0, 0, 0] });
    migrated.thirdPerson.pistol.position = [0.02, -0.05, 0.01];
    migrated.thirdPerson.pistol.rotation = [0.1, 0.2, 0.3];
    let stored; const storage = { getItem: () => stored, setItem: (key, value) => { stored = value; } };
    saveLibrary(migrated, storage);
    assert.deepEqual(readLibrary(storage).thirdPerson.pistol, migrated.thirdPerson.pistol);
    assert.deepEqual(readLibrary(storage).poses, old.poses);
    migrated.thirdPerson.primary.rotation[0] = Infinity;
    assert.throws(() => validateLibrary(migrated));
});

test('support grip edits migrate and save separately from weapon and first-person placement', () => {
    const old = emptyLibrary(); delete old.thirdPersonGrips;
    old.thirdPerson.primary.position[1] = -0.05;
    const library = validateLibrary(old);
    assert.deepEqual(library.poses, old.poses); assert.deepEqual(library.thirdPerson, old.thirdPerson);
    library.thirdPersonGrips.primary.position[1] = 0.015;
    library.thirdPersonGrips.primary.fingers.Index[1] = 0.3;
    const clean = validateLibrary(library);
    assert.equal(clean.thirdPersonGrips.primary.position[1], 0.015);
    assert.equal(clean.thirdPersonGrips.primary.fingers.Index[1], 0.3);
    assert.deepEqual(clean.poses, old.poses); assert.deepEqual(clean.thirdPerson, old.thirdPerson);
    library.thirdPersonGrips.primary.fingers.Thumb[0] = NaN;
    assert.throws(() => validateLibrary(library));
});

test('right-hand full-body grips migrate and validate independently from left-hand edits', () => {
    const old = emptyLibrary(); delete old.thirdPersonRightGrips;
    old.thirdPersonGrips.primary.position[1] = 0.015;
    const clean = validateLibrary(old);
    assert.deepEqual(clean.thirdPersonGrips, old.thirdPersonGrips);
    assert.deepEqual(clean.thirdPerson, old.thirdPerson); assert.deepEqual(clean.poses, old.poses);
    assert.deepEqual(clean.thirdPersonRightGrips.primary.position, [0, 0, 0]);
    clean.thirdPersonRightGrips.pistol.fingers.Index[1] = 0.2;
    assert.equal(validateLibrary(clean).thirdPersonRightGrips.pistol.fingers.Index[1], 0.2);
    clean.thirdPersonRightGrips.pistol.rotation[0] = NaN;
    assert.throws(() => validateLibrary(clean));
});
