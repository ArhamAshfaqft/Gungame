import * as THREE from 'three';
import { soundEngine } from '../audio/SoundEngine.js';
import { createFracturedPanel, fractureCells } from './FractureGeometry.js';
import { DebrisPool } from './DebrisPool.js';

const ROOM = { width: 10, depth: 8, height: 3.2, thickness: 0.24 };
const DOOR = { width: 1.12, height: 2.16, cols: 8, rows: 16, maxDamage: 450 };
const WINDOW = { width: 1.8, height: 0.9, sill: 1.0 };
const RESPAWN_DELAY = 35;

const tileUVs = (geometry, scale = 3) => {
    const uv = geometry.attributes.uv;
    const position = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(normals.getX(i));
        const ny = Math.abs(normals.getY(i));
        const u = nx > 0.5 ? position.getZ(i) : position.getX(i);
        const v = ny > 0.5 ? position.getZ(i) : position.getY(i);
        uv.setXY(i, u / scale, v / scale);
    }
    return geometry;
};

// Procedural warm-brown plank grain so the door does not depend on a texture file.
const createWoodTexture = () => {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const wave = Math.sin(y * 0.06) * 1.1 + Math.sin(y * 0.21) * 0.35;
            const grain = Math.sin(x * 0.5 + wave) * 0.5 + 0.5;
            const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            const noise = seed - Math.floor(seed);
            const base = 0.44 + grain * 0.1 + noise * 0.05;
            data[i] = Math.min(255, base * 300);
            data[i + 1] = Math.min(255, base * 225);
            data[i + 2] = Math.min(255, base * 170);
            data[i + 3] = 255;
        }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
};
const woodTexture = createWoodTexture();

// A training-room prop: concrete shell, hinged wooden door that loses boards where it is shot,
// and glass panes that shatter. Everything rebuilds after a short delay so the range stays usable.
export class TrainingRoom {
    constructor(scene, colliders, textures = {}) {
        this.scene = scene;
        this.colliders = colliders;
        this.origin = new THREE.Vector3(0, 0, 44);
        this.shadowsDirty = true;
        this.hitSequence = 0;
        this.brokenBoards = new Set();
        this.glassPanes = [];
        this.canInteract = false;
        this.time = 0;

        this.door = { open: false, openAmount: 0, damage: 0, destroyed: false, resetTimer: 0 };

        this.materials = {
            wall: new THREE.MeshStandardMaterial({
                color: 0x9d968a, map: textures.concreteColor || null, normalMap: textures.concreteNormal || null,
                roughness: 0.88, metalness: 0.05
            }),
            wood: new THREE.MeshStandardMaterial({
                color: 0xffffff, map: woodTexture, roughness: 0.82, metalness: 0.02, vertexColors: true
            }),
            frame: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.78 }),
            metal: new THREE.MeshStandardMaterial({ color: 0x3a4448, roughness: 0.6, metalness: 0.5 }),
            roof: new THREE.MeshStandardMaterial({
                color: 0x6d6a63, map: textures.concreteColor || null, normalMap: textures.concreteNormal || null,
                roughness: 0.9, metalness: 0.05
            }),
            glass: new THREE.MeshStandardMaterial({
                color: 0xa9d7e8, transparent: true, opacity: 0.26, roughness: 0.08,
                metalness: 0.15, side: THREE.DoubleSide, depthWrite: false
            }),
            splinter: new THREE.MeshStandardMaterial({ color: 0x7a4a28, roughness: 0.9, transparent: true }),
            shard: new THREE.MeshStandardMaterial({
                color: 0xbfe6f2, transparent: true, opacity: 0.85, roughness: 0.1,
                metalness: 0.2, side: THREE.DoubleSide
            })
        };

        this.woodDebris = new DebrisPool(scene, new THREE.BoxGeometry(1, 1, 1), this.materials.splinter, 192);
        this.materials.wood.userData.surface='wood';this.materials.frame.userData.surface='wood';this.materials.metal.userData.surface='metal';this.materials.glass.userData.surface='glass';
        const shard = new THREE.BufferGeometry();
        shard.setAttribute('position', new THREE.Float32BufferAttribute([-1 / 3, -1 / 3, 0, 2 / 3, -1 / 3, 0, -1 / 3, 2 / 3, 0], 3));
        shard.computeVertexNormals();
        this.glassDebris = new DebrisPool(scene, shard, this.materials.shard, 256);

        this.build();
    }

    get frontZ() {
        return this.origin.z - ROOM.depth / 2;
    }

    build() {
        this.buildWalls();
        this.buildDoor();
        this.buildWindows();
        this.buildLights();
    }

    addWall(center, size, material = this.materials.wall) {
        const mesh = new THREE.Mesh(tileUVs(new THREE.BoxGeometry(size.x, size.y, size.z)), material);
        mesh.position.copy(center);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isShootable = true;
        this.scene.add(mesh);
        this.colliders.push(new THREE.Box3().setFromObject(mesh));
        return mesh;
    }

    buildWalls() {
        const { width: W, depth: D, height: H, thickness: t } = ROOM;
        const x0 = this.origin.x, z0 = this.origin.z;
        const frontZ = this.frontZ;
        const backZ = z0 + D / 2;
        const opening = DOOR.width / 2 + 0.06;
        const halfW = W / 2;
        const winCenter = 3.1;
        const winHalf = 0.6;

        // Front wall: bands either side of the door with a window cut into each, plus the door header.
        for (const side of [-1, 1]) {
            const near = side * opening;
            const far = side * halfW;
            const width = Math.abs(far - near);
            const center = (near + far) / 2;
            const winNear = side * (winCenter - winHalf);
            const winFar = side * (winCenter + winHalf);

            this.addWall(new THREE.Vector3(x0 + center, WINDOW.sill / 2, frontZ), new THREE.Vector3(width, WINDOW.sill, t));
            this.addWall(new THREE.Vector3(x0 + center, WINDOW.sill + WINDOW.height + (H - WINDOW.sill - WINDOW.height) / 2, frontZ),
                new THREE.Vector3(width, H - WINDOW.sill - WINDOW.height, t));
            this.addWall(new THREE.Vector3(x0 + (near + winNear) / 2, WINDOW.sill + WINDOW.height / 2, frontZ),
                new THREE.Vector3(Math.abs(winNear - near), WINDOW.height, t));
            this.addWall(new THREE.Vector3(x0 + (winFar + far) / 2, WINDOW.sill + WINDOW.height / 2, frontZ),
                new THREE.Vector3(Math.abs(far - winFar), WINDOW.height, t));
        }
        this.addWall(new THREE.Vector3(x0, DOOR.height + (H - DOOR.height) / 2, frontZ), new THREE.Vector3(opening * 2, H - DOOR.height, t));

        // Back wall.
        this.addWall(new THREE.Vector3(x0, H / 2, backZ), new THREE.Vector3(W, H, t));

        // Side walls with a window opening cut between the sill and the header.
        for (const side of [-1, 1]) {
            const sx = x0 + side * W / 2;
            this.addWall(new THREE.Vector3(sx, WINDOW.sill / 2, z0), new THREE.Vector3(t, WINDOW.sill, D));
            this.addWall(new THREE.Vector3(sx, WINDOW.sill + WINDOW.height + (H - WINDOW.sill - WINDOW.height) / 2, z0),
                new THREE.Vector3(t, H - WINDOW.sill - WINDOW.height, D));
            const sideDepth = D / 2 - WINDOW.width / 2;
            for (const dz of [-1, 1]) {
                this.addWall(
                    new THREE.Vector3(sx, WINDOW.sill + WINDOW.height / 2, z0 + dz * (D / 2 - sideDepth / 2)),
                    new THREE.Vector3(t, WINDOW.height, sideDepth));
            }
        }

        // Roof.
        this.addWall(new THREE.Vector3(x0, H + 0.1, z0), new THREE.Vector3(W + 0.4, 0.2, D + 0.4), this.materials.roof);
    }

    buildDoor() {
        const x0 = this.origin.x;
        const z = this.frontZ;

        // Hinge sits on the left jamb; boards are laid out in the hinge's local space.
        this.doorHinge = new THREE.Group();
        this.doorHinge.position.set(x0 - DOOR.width / 2, 0, z);
        this.scene.add(this.doorHinge);

        const panel = createFracturedPanel(DOOR.width, DOOR.height, 0.055, this.materials.wood, DOOR.cols, DOOR.rows);
        this.doorMesh = panel.mesh;
        this.doorPieces = panel.pieces;
        this.originalDoorIndices = this.doorMesh.geometry.index.array.slice();
        this.doorMesh.castShadow = true;
        this.doorMesh.receiveShadow = true;
        this.doorMesh.userData.isShootable = true;
        this.doorMesh.userData.breakable = { takeBulletHit: (hit, damage, direction) => this.hitDoor(hit, damage, direction) };
        this.doorHinge.add(this.doorMesh);

        // Lever handle on the outside face.
        this.doorHandle = new THREE.Group();
        const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 10), this.materials.metal);
        mount.rotation.x = Math.PI / 2;
        mount.position.set(DOOR.width - 0.14, 1.02, -0.055);
        this.doorHandle.add(mount);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.035), this.materials.metal);
        lever.position.set(DOOR.width - 0.22, 1.02, -0.085);
        this.doorHandle.add(lever);
        this.doorHandle.traverse(mesh => {
            if (mesh.isMesh) {
                mesh.userData.isShootable = true;
                mesh.userData.breakable = this.doorMesh.userData.breakable;
            }
        });
        this.doorHinge.add(this.doorHandle);

        // Door frame trim.
        for (const dx of [-1, 1]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, DOOR.height + 0.06, 0.3), this.materials.frame);
            post.position.set(x0 + dx * (DOOR.width / 2 + 0.03), (DOOR.height + 0.06) / 2, z);
            post.castShadow = true;
            post.userData.isShootable = true;
            this.scene.add(post);
        }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR.width + 0.26, 0.1, 0.3), this.materials.frame);
        lintel.position.set(x0, DOOR.height + 0.03, z);
        lintel.userData.isShootable = true;
        this.scene.add(lintel);

        this.doorBox = new THREE.Box3(
            new THREE.Vector3(x0 - DOOR.width / 2 - 0.03, 0, z - 0.05),
            new THREE.Vector3(x0 + DOOR.width / 2 + 0.03, DOOR.height, z + 0.05)
        );
        this.colliders.push(this.doorBox);
    }

    buildWindows() {
        const { width: W } = ROOM;
        const y = WINDOW.sill + WINDOW.height / 2;

        // Side windows.
        for (const side of [-1, 1]) {
            this.glassPanes.push(this.addGlassPane(
                new THREE.Vector3(this.origin.x + side * W / 2, y, this.origin.z),
                side * Math.PI / 2, WINDOW.width, WINDOW.height));
        }
        // Front windows flanking the door.
        for (const side of [-1, 1]) {
            this.glassPanes.push(this.addGlassPane(
                new THREE.Vector3(this.origin.x + side * 3.1, y, this.frontZ),
                0, 1.2, WINDOW.height));
        }
    }

    addGlassPane(center, rotationY, width, height) {
        const group = new THREE.Group();
        group.position.copy(center);
        group.rotation.y = rotationY;

        const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.materials.glass);
        pane.userData.isShootable = true;
        pane.userData.shattered = false;
        pane.userData.resetTimer = 0;
        pane.userData.width = width;
        pane.userData.height = height;
        pane.userData.breakable = { takeBulletHit: (hit, damage, direction) => this.shatterGlass(pane, hit, direction) };
        group.add(pane);
        pane.updateWorldMatrix(true, false);
        pane.userData.collider = new THREE.Box3().setFromObject(pane).expandByScalar(0.015);
        this.colliders.push(pane.userData.collider);

        const bar = (size, pos) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), this.materials.metal);
            mesh.position.copy(pos);
            mesh.userData.isShootable = true;
            group.add(mesh);
        };
        bar(new THREE.Vector3(width + 0.12, 0.05, 0.06), new THREE.Vector3(0, height / 2 + 0.02, 0));
        bar(new THREE.Vector3(width + 0.12, 0.05, 0.06), new THREE.Vector3(0, -height / 2 - 0.02, 0));
        bar(new THREE.Vector3(0.05, height + 0.1, 0.06), new THREE.Vector3(-width / 2 - 0.03, 0, 0));
        bar(new THREE.Vector3(0.05, height + 0.1, 0.06), new THREE.Vector3(width / 2 + 0.03, 0, 0));

        this.scene.add(group);
        return pane;
    }

    buildLights() {
        const interior = new THREE.PointLight(0xffdcae, 20, 14, 2);
        interior.position.set(this.origin.x, ROOM.height - 0.45, this.origin.z);
        this.scene.add(interior);

        // Porch lamp: a small metal fixture with a warm bulb so the north-facing doorway reads.
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.1), this.materials.metal);
        bracket.position.set(this.origin.x, 2.45, this.frontZ - 0.08);
        bracket.userData.isShootable = true;
        this.scene.add(bracket);

        const shade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.24), this.materials.metal);
        shade.position.set(this.origin.x, 2.62, this.frontZ - 0.16);
        shade.userData.isShootable = true;
        this.scene.add(shade);

        const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.075, 12, 8),
            new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
        );
        bulb.position.set(this.origin.x, 2.55, this.frontZ - 0.16);
        this.scene.add(bulb);

        const porch = new THREE.PointLight(0xffc98a, 9, 8, 2);
        porch.position.set(this.origin.x, 2.5, this.frontZ - 0.45);
        this.scene.add(porch);
        bulb.userData.isShootable=true;bulb.userData.surface='glass';bulb.userData.breakableLight={lights:[porch],broken:false};
        const insideBulb=new THREE.Mesh(new THREE.SphereGeometry(.11,10,8),new THREE.MeshBasicMaterial({color:0xffe3b0}));insideBulb.position.copy(interior.position);insideBulb.userData.isShootable=true;insideBulb.userData.surface='glass';insideBulb.userData.breakableLight={lights:[interior],broken:false};this.scene.add(insideBulb);
    }

    get debris() { return [...this.woodDebris.pieces, ...this.glassDebris.pieces]; }

    hitDoor(hit, damage = 125, direction = null) {
        if (this.door.destroyed) return { penetrates: true, damageMultiplier: 0.65 };
        this.doorMesh.updateWorldMatrix(true, false);
        const local = this.doorMesh.worldToLocal(hit.point.clone());
        const id = Number.isInteger(hit.instanceId) ? hit.instanceId : this.doorPieces.reduce((best, piece) =>
            piece.center.distanceToSquared(new THREE.Vector2(local.x, local.y)) < this.doorPieces[best].center.distanceToSquared(new THREE.Vector2(local.x, local.y)) ? piece.id : best, 0);
        if (!this.doorPieces[id] || this.brokenBoards.has(id)) return;
        const center = this.doorPieces[id].center;
        // Elongated fractures follow the grain, with deterministic variation for replay/network events.
        const radius = THREE.MathUtils.clamp(0.12 + damage * 0.00035, 0.13, 0.23);
        for (const piece of this.doorPieces) {
            const dx = (piece.center.x - center.x) / radius;
            const dy = (piece.center.y - center.y) / (radius * 1.8);
            if (piece.id === id || dx * dx + dy * dy < 1) this.breakBoard(piece.id, direction);
        }
        this.door.damage += damage;
        soundEngine.playWoodHit();
        const impulse = direction?.clone().normalize() || new THREE.Vector3(0, 0, -1);
        this.spawnSplinters(hit.point, impulse);
        this.shadowsDirty = true;
        if (this.door.damage >= DOOR.maxDamage) this.breakDoor(impulse);
        // An intact wooden leaf stops the round; later rounds can travel through the actual hole.
        return { penetrates: false };
    }

    breakBoard(index, direction = null) {
        if (this.brokenBoards.has(index) || !this.doorPieces[index]) return;
        this.brokenBoards.add(index);
        const piece = this.doorPieces[index];
        const attribute = this.doorMesh.geometry.index;
        attribute.array.fill(0, piece.start, piece.start + piece.count);
        attribute.needsUpdate = true;
        const center = this.doorMesh.localToWorld(new THREE.Vector3(piece.center.x, piece.center.y, 0));
        const size = piece.bounds.getSize(new THREE.Vector2());
        this.spawnDebris('wood', center, direction || new THREE.Vector3(0, 0, -1), new THREE.Vector3(size.x * 0.85, size.y * 0.85, 0.035));
        this.shadowsDirty = true;
    }

    breakDoor(direction = new THREE.Vector3(0, 0, -1)) {
        if (this.door.destroyed) return;
        this.door.destroyed = true;
        this.door.open = false;
        this.doorHandle.visible = false;
        this.doorMesh.userData.isShootable = false;
        for (let i = 0; i < this.doorPieces.length; i++) this.breakBoard(i, direction);
        this.removeDoorCollider();
        this.door.resetTimer = RESPAWN_DELAY;
        this.shadowsDirty = true;
        soundEngine.playDoorBreak();
    }

    shatterGlass(pane, hit, direction = null) {
        const result = { penetrates: true, damageMultiplier: 0.8 };
        if (pane.userData.shattered) return result;
        pane.userData.shattered = true;
        pane.visible = false;
        pane.userData.isShootable = false;
        pane.userData.resetTimer = RESPAWN_DELAY;
        const colliderIndex = this.colliders.indexOf(pane.userData.collider);
        if (colliderIndex !== -1) this.colliders.splice(colliderIndex, 1);
        pane.updateWorldMatrix(true, false);
        const width = pane.userData.width, height = pane.userData.height;
        const local = hit?.point ? pane.worldToLocal(hit.point.clone()) : new THREE.Vector3();
        const cells = fractureCells(width, height, 5, 3, 811 + this.hitSequence++, new THREE.Vector2(local.x + width / 2, local.y + height / 2));
        const normal = direction?.clone().normalize() || new THREE.Vector3(0, 0, 1).applyQuaternion(pane.getWorldQuaternion(new THREE.Quaternion()));
        const lines = [];
        for (const cell of cells) {
            const polygon = cell.polygon.map(point => pane.localToWorld(new THREE.Vector3(point.x - width / 2, point.y - height / 2, 0)));
            for (let i = 0; i < polygon.length; i++) lines.push(...polygon[i].toArray(), ...polygon[(i + 1) % polygon.length].toArray());
            for (let i = 1; i < polygon.length - 1; i++) {
                const a = polygon[0], b = polygon[i], c = polygon[i + 1];
                const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
                const shape = new THREE.Matrix4().makeBasis(b.clone().sub(a), c.clone().sub(a), normal);
                const velocity = normal.clone().multiplyScalar(2.5 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, 0.5 + Math.random(), Math.random() - 0.5));
                this.glassDebris.spawn(center, velocity, shape, new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), 3 + Math.random() * 2);
            }
        }
        // A brief crack flash traces the actual fragment boundaries across the whole pane.
        if (pane.userData.cracks) {
            this.scene.remove(pane.userData.cracks);
            pane.userData.cracks.geometry.dispose();
            pane.userData.cracks.material.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
        const cracks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.8, depthWrite: false }));
        pane.userData.cracks = cracks;
        pane.userData.crackTimer = 0.12;
        this.scene.add(cracks);
        soundEngine.playGlassBreak();
        return result;
    }

    spawnSplinters(point, normal) {
        for (let i = 0; i < 8; i++) this.spawnDebris('wood', point, normal);
    }

    spawnDebris(kind, point, normal, size = null) {
        if (kind !== 'wood') return;
        const shape = new THREE.Matrix4().compose(new THREE.Vector3(),
            this.doorMesh.getWorldQuaternion(new THREE.Quaternion()), size || new THREE.Vector3(0.012 + Math.random() * 0.02, 0.04 + Math.random() * 0.08, 0.018));
        const velocity = normal.clone().multiplyScalar(2 + Math.random() * 3)
            .add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2));
        this.woodDebris.spawn(point, velocity, shape, new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4), 4 + Math.random() * 2);
    }

    removeDoorCollider() {
        const index = this.colliders.indexOf(this.doorBox);
        if (index !== -1) this.colliders.splice(index, 1);
    }

    addDoorCollider() {
        if (!this.colliders.includes(this.doorBox)) this.colliders.push(this.doorBox);
    }

    rebuildDoor() {
        this.doorMesh.geometry.index.array.set(this.originalDoorIndices);
        this.doorMesh.geometry.index.needsUpdate = true;
        this.brokenBoards.clear();
        this.doorMesh.userData.isShootable = true;
        this.shadowsDirty = true;
        this.doorHandle.visible = true;
        this.door.damage = 0;
        this.door.destroyed = false;
        this.door.open = false;
        this.door.openAmount = 0;
        this.doorHinge.rotation.y = 0;
        this.door.resetTimer = 0;
        this.addDoorCollider();
    }

    update(delta, playerPos) {
        this.time += delta;

        // Door swing and its collision state.
        const target = this.door.open && !this.door.destroyed ? 1 : 0;
        const previousAngle = this.door.openAmount;
        this.door.openAmount = THREE.MathUtils.damp(this.door.openAmount, target, 7, delta);
        if (Math.abs(previousAngle - this.door.openAmount) > 0.0005) this.shadowsDirty = true;
        if (this.doorHinge) this.doorHinge.rotation.y = -this.door.openAmount * 1.7;
        const blocking = !this.door.destroyed && this.door.openAmount < 0.12;
        if (blocking) this.addDoorCollider();
        else this.removeDoorCollider();

        // Rebuild destroyed props so the range can be shot again.
        if (this.door.destroyed) {
            this.door.resetTimer -= delta;
            if (this.door.resetTimer <= 0) this.rebuildDoor();
        }
        for (const pane of this.glassPanes) {
            if (pane.userData.cracks?.visible) {
                pane.userData.crackTimer -= delta;
                pane.userData.cracks.visible = pane.userData.crackTimer > 0;
            }
            if (!pane.userData.shattered) continue;
            pane.userData.resetTimer -= delta;
            if (pane.userData.resetTimer <= 0) {
                pane.userData.shattered = false;
                pane.visible = true;
                pane.userData.isShootable = true;
                if (!this.colliders.includes(pane.userData.collider)) this.colliders.push(pane.userData.collider);
            }
        }

        this.woodDebris.update(delta);
        this.glassDebris.update(delta);

        // Interaction prompt.
        if (playerPos) {
            const dx = playerPos.x - this.origin.x;
            const dz = playerPos.z - this.frontZ;
            this.canInteract = Math.hypot(dx, dz) < 3.2 && !this.door.destroyed;
        }
    }

    interact(playerPos) {
        if (playerPos) {
            const dx = playerPos.x - this.origin.x;
            const dz = playerPos.z - this.frontZ;
            this.canInteract = Math.hypot(dx, dz) < 3.2 && !this.door.destroyed;
        }
        if (!this.canInteract || this.door.destroyed) return false;
        this.door.open = !this.door.open;
        soundEngine.playDoorOpen();
        return true;
    }
}
