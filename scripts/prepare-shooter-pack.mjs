// Convert source FBXs to shared, animation-only runtime data. No character meshes/textures.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const pistol = process.argv.includes('--pistol');
const archiveName = pistol ? 'Pistol_Handgun Locomotion Pack.zip' : 'Basic Shooter Pack.zip';
const directory = resolve(pistol ? 'artifacts/pistol-pack-review' : 'artifacts/shooter-pack-review');
mkdirSync(directory, { recursive: true });
const extraction = spawnSync('powershell', ['-NoProfile', '-Command', `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($env:SHOOTER_PACK_ARCHIVE)
try { foreach ($entry in $archive.Entries) {
 if ($entry.FullName -eq 'Ch15_nonPBR.fbx') { continue }
 if ([System.IO.Path]::GetFileName($entry.FullName) -ne $entry.FullName -or [System.IO.Path]::GetExtension($entry.FullName) -ne '.fbx') { throw 'Unexpected archive entry' }
 $target = [System.IO.Path]::GetFullPath((Join-Path $env:SHOOTER_PACK_REVIEW $entry.FullName))
 if (-not $target.StartsWith($env:SHOOTER_PACK_REVIEW + '\\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid archive path' }
 [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
} } finally { $archive.Dispose() }
`], { env: { ...process.env, SHOOTER_PACK_ARCHIVE: resolve(archiveName), SHOOTER_PACK_REVIEW: directory }, encoding: 'utf8' });
if (extraction.status !== 0) throw new Error(extraction.stderr || 'Could not extract animation FBXs.');

const normalize = name => name.replace(/^mixamorig[:_]?/i, '').replace(/_\d+$/, '');
const glb = readFileSync('public/assets/operators/swat.glb');
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
const targetBones = new Map(json.skins[0].joints.map(index => {
    const node = json.nodes[index], position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(position, quaternion, scale);
    else { position.fromArray(node.translation || [0, 0, 0]); quaternion.fromArray(node.rotation || [0, 0, 0, 1]); }
    return [normalize(node.name), { position, quaternion }];
}));
const ids = pistol ? {
    'pistol idle': 'pistolIdle', 'pistol walk': 'pistolWalk', 'pistol run': 'pistolRun',
    'pistol walk backward': 'pistolWalkBack', 'pistol run backward': 'pistolRunBack',
    'pistol strafe': 'pistolStrafeRight', 'pistol strafe (2)': 'pistolStrafeLeft',
    'pistol jump': 'pistolJump', 'pistol jump (2)': 'pistolJumpForward',
    'pistol walk arc': 'pistolWalkArcLeft', 'pistol walk arc (2)': 'pistolWalkArcRight',
    'pistol run arc': 'pistolRunArcLeft', 'pistol run arc (2)': 'pistolRunArcRight',
    'pistol walk backward arc': 'pistolWalkBackArcRight', 'pistol walk backward arc (2)': 'pistolWalkBackArcLeft',
    'pistol run backward arc': 'pistolRunBackArcRight', 'pistol run backward arc (2)': 'pistolRunBackArcLeft',
    'pistol stand to kneel': 'pistolStandToKneel', 'pistol kneeling idle': 'pistolKneelIdle', 'pistol kneel to stand': 'pistolKneelToStand',
} : { 'rifle aiming idle': 'idle', walking: 'walk', 'walking backwards': 'walkBack',
    'rifle run': 'run', 'run backwards': 'runBack', strafe: 'strafeRunLeft', 'strafe (2)': 'strafeRunRight',
    // These two source files are named opposite to their measured X travel.
    'strafe left': 'strafeRight', 'strafe right': 'strafeLeft', reloading: 'reload', 'firing rifle': 'fire',
    'rifle jump': 'jump', 'turn left': 'turnLeft', 'turning right 45 degrees': 'turnRight',
    'hit reaction': 'hit', 'toss grenade': 'throw' };
const clips = [];
const labels = { strafeLeft: 'strafe left (walk)', strafeRight: 'strafe right (walk)',
    strafeRunLeft: 'strafe left (run)', strafeRunRight: 'strafe right (run)' };
for (const file of readdirSync(directory).filter(file => file.endsWith('.fbx')).sort()) {
    const id = ids[file.replace(/\.fbx$/, '')]; if (!id) continue;
    const bytes = readFileSync(join(directory, file));
    const source = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const sourceBones = new Map(); source.traverse(bone => { if (bone.isBone) sourceBones.set(normalize(bone.name), bone); });
    for (const animation of source.animations) {
        const hipsTrack = animation.tracks.find(track => track.name.endsWith('Hips.position'));
        const rootDelta = hipsTrack ? [0, 1, 2].map(axis => +(hipsTrack.values[hipsTrack.values.length - 3 + axis] - hipsTrack.values[axis]).toFixed(4)) : [0, 0, 0];
        const tracks = [];
        for (const track of animation.tracks) {
            const [rawName, property] = track.name.split('.'), bone = normalize(rawName);
            const target = targetBones.get(bone), original = sourceBones.get(bone);
            if (!target || !original) throw new Error(`Unmapped animation bone ${bone}`);
            if (property !== 'quaternion' && !(bone === 'Hips' && property === 'position')) continue;
            const values = track.values.slice();
            if (property === 'quaternion') {
                const correction = target.quaternion.clone().multiply(original.quaternion.clone().invert());
                for (let i = 0; i < values.length; i += 4) new THREE.Quaternion().fromArray(values, i).premultiply(correction).normalize().toArray(values, i);
            } else {
                for (let i = 0; i < values.length; i += 3) {
                    values[i] = target.position.x; values[i + 2] = target.position.z;
                    values[i + 1] += target.position.y - original.position.y;
                }
            }
            const converted = property === 'quaternion' ? new THREE.QuaternionKeyframeTrack(`${bone}.${property}`, track.times, values)
                : new THREE.VectorKeyframeTrack(`${bone}.${property}`, track.times, values);
            converted.optimize();
            tracks.push({ bone, property, times: Array.from(converted.times, n => +n.toFixed(6)), values: Array.from(converted.values, n => +n.toFixed(6)) });
        }
        clips.push({ id, name: labels[id] || file.replace(/\.fbx$/, ''), sourceFile: file, sourceRootDelta: rootDelta, duration: animation.duration, tracks });
    }
}
const expected = pistol ? 20 : 16;
if (clips.length !== expected) throw new Error(`Expected ${expected} clips; found ${clips.length}.`);
mkdirSync('public/assets/animations', { recursive: true });
const output = JSON.stringify({ version: 1, source: `User-provided Mixamo ${archiveName.replace('.zip', '')}`, inPlace: true, clips });
writeFileSync(`public/assets/animations/${pistol ? 'pistol' : 'shooter'}-pack.json`, output);
console.log(`Prepared ${clips.length} retargeted, in-place clips: ${(Buffer.byteLength(output) / 1024).toFixed(0)} KB.`);
