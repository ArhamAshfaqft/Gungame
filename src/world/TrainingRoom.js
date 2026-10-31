import * as THREE from 'three';
import { soundEngine } from '../audio/SoundEngine.js';

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
        this.debris = [];
        this.brokenBoards = new Set();
        this.glassPanes = [];
        this.canInteract = false;
        this.time = 0;

        this.door = { open: false, openAmount: 0, damage: 0, destroyed: false, resetTimer: 0 };

        this.materials = {
            wall: new THREE.MeshStandardMaterial({
                color: 0x9d968a, map: textures.concreteColor, normalMap: textures.concreteNormal,
                roughness: 0.88, metalness: 0.05
            }),
            wood: new THREE.MeshStandardMaterial({
                color: 0xffffff, map: woodTexture, roughness: 0.82, metalness: 0.02
            }),
            frame: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.78 }),
            metal: new THREE.MeshStandardMaterial({ color: 0x3a4448, roughness: 0.6, metalness: 0.5 }),
            roof: new THREE.MeshStandardMaterial({
                color: 0x6d6a63, map: textures.concreteColor, normalMap: textures.concreteNormal,
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

        this.splinterGeometry = new THREE.BoxGeometry(0.035, 0.022, 0.095);
        this.shardGeometry = new THREE.PlaneGeometry(0.11, 0.14);

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

        const cellW = DOOR.width / DOOR.cols;
        const cellH = DOOR.height / DOOR.rows;
        this.doorMesh = new THREE.InstancedMesh(
            // Boards overlap slightly so a shot can never slip through a seam between them.
            new THREE.BoxGeometry(cellW + 0.004, cellH + 0.004, 0.055),
            this.materials.wood,
            DOOR.cols * DOOR.rows
        );
        this.doorMesh.castShadow = true;
        this.doorMesh.receiveShadow = true;
        this.doorMesh.userData.isShootable = true;
        this.doorMesh.userData.breakable = { takeBulletHit: (hit, damage) => this.hitDoor(hit, damage) };

        this.boardMatrices = [];
        const matrix = new THREE.Matrix4();
        const tint = new THREE.Color();
        for (let row = 0; row < DOOR.rows; row++) {
            for (let col = 0; col < DOOR.cols; col++) {
                const index = row * DOOR.cols + col;
                // Alternate the board depth by checkerboard so the overlaps never z-fight.
                const depth = (row + col) % 2 === 0 ? -0.0015 : 0.0015;
                matrix.makeTranslation((col + 0.5) * cellW, (row + 0.5) * cellH, depth);
                this.boardMatrices.push(matrix.clone());
                this.doorMesh.setMatrixAt(index, matrix);
                // Alternate plank tones so the door still reads as boards even with no gaps.
                const shade = 0.93 + Math.random() * 0.1;
                tint.setRGB(shade, shade, shade);
                this.doorMesh.setColorAt(index, tint);
            }
        }
        this.doorMesh.instanceMatrix.needsUpdate = true;
        this.doorMesh.instanceColor.needsUpdate = true;
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
        this.doorHandle.traverse(mesh => { if (mesh.isMesh) mesh.userData.isShootable = true; });
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
        pane.userData.breakable = { takeBulletHit: hit => this.shatterGlass(pane, hit) };
        group.add(pane);

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
    }

    // Sniper round smashes the boards it lands on plus a few around the impact.
    hitDoor(hit, damage = 125, direction = null) {
        if (this.door.destroyed) return;
        const id = hit.instanceId;
        if (id !== undefined) {
            const col = id % DOOR.cols;
            const row = Math.floor(id / DOOR.cols);
            this.breakBoard(id);
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
                if (Math.random() > 0.55) continue;
                const c = col + dc;
                const r = row + dr;
                if (c >= 0 && c < DOOR.cols && r >= 0 && r < DOOR.rows) this.breakBoard(r * DOOR.cols + c);
            }
        }
        this.door.damage += damage;
        soundEngine.playWoodHit();
        const burst = direction ? direction.clone().negate() : new THREE.Vector3(0, 0, -1);
        this.spawnSplinters(hit.point, burst);
        if (this.door.damage >= DOOR.maxDamage) this.breakDoor();
    }

    breakBoard(index) {
        if (this.brokenBoards.has(index)) return;
        this.brokenBoards.add(index);
        const matrix = new THREE.Matrix4().makeTranslation(0, -999, 0);
        this.doorMesh.setMatrixAt(index, matrix);
        this.doorMesh.instanceMatrix.needsUpdate = true;
    }

    breakDoor() {
        this.door.destroyed = true;
        this.door.open = false;
        this.doorHandle.visible = false;
        for (let i = 0; i < DOOR.cols * DOOR.rows; i++) this.breakBoard(i);
        this.removeDoorCollider();
        this.door.resetTimer = RESPAWN_DELAY;
        const center = new THREE.Vector3(this.origin.x, 1.1, this.frontZ);
        for (let i = 0; i < 18; i++) this.spawnDebris('wood', center, new THREE.Vector3(0, 0, -1));
        soundEngine.playDoorBreak();
    }

    shatterGlass(pane, hit) {
        if (pane.userData.shattered) return;
        pane.userData.shattered = true;
        pane.visible = false;
        pane.userData.isShootable = false;
        pane.userData.resetTimer = RESPAWN_DELAY;
        const point = hit?.point?.clone() || pane.getWorldPosition(new THREE.Vector3());
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(pane.getWorldQuaternion(new THREE.Quaternion()));
        for (let i = 0; i < 14; i++) this.spawnDebris('glass', point, normal);
        soundEngine.playGlassBreak();
    }

    spawnSplinters(point, normal) {
        for (let i = 0; i < 6; i++) this.spawnDebris('wood', point, normal);
    }

    spawnDebris(kind, point, normal) {
        const isWood = kind === 'wood';
        const material = (isWood ? this.materials.splinter : this.materials.shard).clone();
        material.transparent = true;
        const mesh = new THREE.Mesh(isWood ? this.splinterGeometry : this.shardGeometry, material);
        mesh.position.copy(point).addScaledVector(normal, 0.05);
        mesh.scale.setScalar(isWood ? 0.6 + Math.random() * 0.8 : 0.5 + Math.random() * 0.9);
        mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        this.scene.add(mesh);
        const velocity = normal.clone().multiplyScalar((isWood ? 3.5 : 2.6) * (0.4 + Math.random()))
            .add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.2 + Math.random() * 2.4, (Math.random() - 0.5) * 3));
        this.debris.push({
            mesh,
            velocity,
            spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
            life: 2.2 + Math.random() * 1.2,
            baseOpacity: isWood ? 1 : 0.85
        });
    }

    removeDoorCollider() {
        const index = this.colliders.indexOf(this.doorBox);
        if (index !== -1) this.colliders.splice(index, 1);
    }

    addDoorCollider() {
        if (!this.colliders.includes(this.doorBox)) this.colliders.push(this.doorBox);
    }

    rebuildDoor() {
        for (const index of this.brokenBoards) this.doorMesh.setMatrixAt(index, this.boardMatrices[index]);
        this.brokenBoards.clear();
        this.doorMesh.instanceMatrix.needsUpdate = true;
        this.doorHandle.visible = true;
        this.door.damage = 0;
        this.door.destroyed = false;
        this.door.open = false;
        this.door.openAmount = 0;
        this.addDoorCollider();
    }

    update(delta, playerPos) {
        this.time += delta;

        // Door swing and its collision state.
        const target = this.door.open && !this.door.destroyed ? 1 : 0;
        this.door.openAmount = THREE.MathUtils.damp(this.door.openAmount, target, 7, delta);
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
            if (!pane.userData.shattered) continue;
            pane.userData.resetTimer -= delta;
            if (pane.userData.resetTimer <= 0) {
                pane.userData.shattered = false;
                pane.visible = true;
                pane.userData.isShootable = true;
            }
        }

        // Debris physics.
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const piece = this.debris[i];
            piece.life -= delta;
            piece.velocity.y -= 14 * delta;
            piece.mesh.position.addScaledVector(piece.velocity, delta);
            piece.mesh.rotation.x += piece.spin.x * delta;
            piece.mesh.rotation.y += piece.spin.y * delta;
            piece.mesh.rotation.z += piece.spin.z * delta;
            if (piece.mesh.position.y < 0.03) {
                piece.mesh.position.y = 0.03;
                piece.velocity.set(0, 0, 0);
                piece.spin.set(0, 0, 0);
            }
            if (piece.life < 0.7) {
                piece.mesh.material.opacity = Math.max(0, piece.life / 0.7) * piece.baseOpacity;
            }
            if (piece.life <= 0) {
                this.scene.remove(piece.mesh);
                piece.mesh.material.dispose();
                this.debris.splice(i, 1);
            }
        }

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
