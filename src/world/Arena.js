import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export class Arena {
    constructor(scene) {
        this.scene = scene;
        this.colliders = [];
        this.jumpPads = [];
        this.textureLoader = new THREE.TextureLoader();

        this.initTextures();
        this.buildEnvironment();
        this.buildLayout();
        this.setupLighting();
    }

    initTextures() {
        const loadTex = (path, repeatX = 1, repeatY = 1) => {
            const tex = this.textureLoader.load(path);
            if (path.includes('_c.')) tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 8;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeatX, repeatY);
            return tex;
        };

        this.concreteColor = loadTex('/assets/textures/concrete_c.webp');
        this.concreteNormal = loadTex('/assets/textures/concrete_n.webp');

        this.metalColor = loadTex('/assets/textures/metal_c.webp');
        this.metalNormal = loadTex('/assets/textures/metal_n.webp');

        this.crateColor = loadTex('/assets/textures/crate_c.webp', 1, 1);
        this.crateNormal = loadTex('/assets/textures/crate_n.webp', 1, 1);

        this.floorColor = loadTex('/assets/textures/ph_asphalt_c.webp', 18, 18);
        this.floorNormal = loadTex('/assets/textures/ph_asphalt_n.webp', 18, 18);
    }

    setupLighting() {
        // Sun Light
        const sun = new THREE.DirectionalLight(0xffddad, 2.6);
        sun.position.set(-35, 32, 25);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 160;
        sun.shadow.camera.left = -60;
        sun.shadow.camera.right = 60;
        sun.shadow.camera.top = 60;
        sun.shadow.camera.bottom = -60;
        sun.shadow.bias = -0.0005;
        this.scene.add(sun);

        // Hemisphere / Sky Light
        const hemi = new THREE.HemisphereLight(0xa4c4dc, 0x3b352c, 1.25);
        this.scene.add(hemi);
        this.scene.add(new THREE.AmbientLight(0xb8c5cf, 0.7));

        const sky = new Sky();
        sky.scale.setScalar(450);
        sky.material.uniforms.turbidity.value = 7;
        sky.material.uniforms.rayleigh.value = 1.5;
        sky.material.uniforms.mieCoefficient.value = 0.006;
        sky.material.uniforms.mieDirectionalG.value = 0.8;
        sky.material.uniforms.sunPosition.value.copy(sun.position).normalize();
        this.scene.add(sky);

        // Atmosphere Fog
        this.scene.fog = new THREE.FogExp2(0x7d8c96, 0.006);
        this.scene.background = new THREE.Color(0x8fa5b4);
    }

    buildEnvironment() {
        // Main Ground Floor
        const groundGeom = new THREE.PlaneGeometry(140, 140);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0xb5b9b5,
            map: this.floorColor,
            normalMap: this.floorNormal,
            roughness: 0.65,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeom, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.userData.isShootable = true;
        this.scene.add(ground);

        // Perimeter Boundary Walls
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x737b7b,
            map: this.concreteColor,
            normalMap: this.concreteNormal,
            roughness: 0.8,
            metalness: 0.1
        });

        const half = 70;
        const wallHeight = 14;
        const wallThickness = 4;

        this.createBoxCollider(new THREE.Vector3(0, wallHeight / 2, -half), new THREE.Vector3(140, wallHeight, wallThickness), wallMat);
        this.createBoxCollider(new THREE.Vector3(0, wallHeight / 2, half), new THREE.Vector3(140, wallHeight, wallThickness), wallMat);
        this.createBoxCollider(new THREE.Vector3(-half, wallHeight / 2, 0), new THREE.Vector3(wallThickness, wallHeight, 140), wallMat);
        this.createBoxCollider(new THREE.Vector3(half, wallHeight / 2, 0), new THREE.Vector3(wallThickness, wallHeight, 140), wallMat);
    }

    buildLayout() {
        const metalMat = new THREE.MeshStandardMaterial({
            color: 0x405554,
            map: this.metalColor,
            normalMap: this.metalNormal,
            roughness: 0.78,
            metalness: 0.25
        });

        const crateMat = new THREE.MeshStandardMaterial({
            color: 0x817352,
            map: this.crateColor,
            normalMap: this.crateNormal,
            roughness: 0.6,
            metalness: 0.3
        });

        const platformMat = new THREE.MeshStandardMaterial({
            color: 0x7c8079,
            map: this.concreteColor,
            normalMap: this.concreteNormal,
            roughness: 0.7,
            metalness: 0.2
        });
        crateMat.userData.surface='wood';

        // 1. Central 2-Story Sniper Tower
        this.createBoxCollider(new THREE.Vector3(0, 3.5, 0), new THREE.Vector3(14, 7, 14), platformMat);
        // Tower roof / balcony
        this.createBoxCollider(new THREE.Vector3(0, 7.2, 0), new THREE.Vector3(16, 0.4, 16), metalMat);
        // Parapets / cover on tower roof
        this.createBoxCollider(new THREE.Vector3(0, 8.0, -7.5), new THREE.Vector3(16, 1.2, 0.8), crateMat);
        this.createBoxCollider(new THREE.Vector3(0, 8.0, 7.5), new THREE.Vector3(16, 1.2, 0.8), crateMat);

        // 2. Elevated Sniper Bridges / Catwalks (Tier 1: 3.5m high)
        this.createBoxCollider(new THREE.Vector3(-24, 3.5, 0), new THREE.Vector3(16, 0.5, 8), metalMat);
        this.createBoxCollider(new THREE.Vector3(24, 3.5, 0), new THREE.Vector3(16, 0.5, 8), metalMat);
        this.createBoxCollider(new THREE.Vector3(0, 3.5, -24), new THREE.Vector3(8, 0.5, 16), metalMat);
        this.createBoxCollider(new THREE.Vector3(0, 3.5, 24), new THREE.Vector3(8, 0.5, 16), metalMat);

        // Connect catwalk bridges to center tower
        this.createBoxCollider(new THREE.Vector3(-14, 3.5, 0), new THREE.Vector3(8, 0.4, 4), metalMat);
        this.createBoxCollider(new THREE.Vector3(14, 3.5, 0), new THREE.Vector3(8, 0.4, 4), metalMat);

        // 3. Slide & Speed Ramps (Angles for high-speed slide jump transfers)
        this.createRamp(new THREE.Vector3(-24, 0, 10), 6, 3.75, 12, 0);
        this.createRamp(new THREE.Vector3(24, 0, -10), 6, 3.75, 12, Math.PI);

        // 4. Tactical Shipping Containers & Cover Blocks (for corner sliding & peeking)
        const containerSpawns = [
            { pos: [-36, 1.6, -18], size: [12, 3.2, 5], rot: 0.2 },
            { pos: [36, 1.6, 18], size: [12, 3.2, 5], rot: -0.3 },
            { pos: [-18, 1.6, -38], size: [5, 3.2, 12], rot: 0 },
            { pos: [18, 1.6, 38], size: [5, 3.2, 12], rot: 0.1 },
            { pos: [-38, 1.6, 30], size: [10, 3.2, 5], rot: 0.4 },
            { pos: [38, 1.6, -30], size: [10, 3.2, 5], rot: -0.4 }
        ];

        for (const c of containerSpawns) {
            const container = this.createBoxCollider(
                new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]),
                new THREE.Vector3(c.size[0], c.size[1], c.size[2]),
                metalMat,
                c.rot
            );
            const ribMat = metalMat.clone();
            ribMat.color.setHex(c.pos[0] < 0 ? 0x48615a : 0x755444);
            container.material = ribMat;
            const ribGeometry = new THREE.BoxGeometry(0.065, c.size[1] - 0.2, 0.075);
            for (let x = -c.size[0] / 2 + 0.3; x < c.size[0] / 2; x += 0.42) {
                for (const side of [-1, 1]) {
                    const rib = new THREE.Mesh(ribGeometry, ribMat);
                    rib.position.set(x, 0, side * (c.size[2] / 2 + 0.02));
                    container.add(rib);
                }
            }
        }

        // 5. Military Crate Clusters (Chest height cover for head glitching/peeks)
        const crateSpawns = [
            [-8, 0.7, 12], [-10, 0.7, 12], [-8, 2.1, 12],
            [8, 0.7, -12], [10, 0.7, -12], [8, 2.1, -12],
            [-22, 4.2, 2], [-22, 4.2, -2],
            [22, 4.2, 2], [22, 4.2, -2]
        ];

        for (const [x, y, z] of crateSpawns) {
            this.createBoxCollider(new THREE.Vector3(x, y, z), new THREE.Vector3(1.4, 1.4, 1.4), crateMat);
        }

        // Tactical range: traversal stays grounded instead of using arena launch pads.
        this.buildDetails();
    }

    createBoxCollider(pos, size, material, rotY = 0) {
        const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
        // Tile by physical surface area instead of stretching one texture over a building.
        const uv = geom.attributes.uv;
        const position = geom.attributes.position;
        const normals = geom.attributes.normal;
        for (let i = 0; i < uv.count; i++) {
            const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i));
            const u = nx > 0.5 ? position.getZ(i) : position.getX(i);
            const v = ny > 0.5 ? position.getZ(i) : position.getY(i);
            uv.setXY(i, u / 3, v / 3);
        }
        const mesh = new THREE.Mesh(geom, material);
        mesh.position.copy(pos);
        if (rotY !== 0) mesh.rotation.y = rotY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isShootable = true;
        this.scene.add(mesh);

        // Calculate world axis-aligned bounding box (AABB)
        const box = new THREE.Box3().setFromObject(mesh);
        mesh.userData.collider=box;
        this.colliders.push(box);
        return mesh;
    }

    createRamp(pos, width, height, length, rotY = 0) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(length, 0);
        shape.lineTo(0, height);
        shape.closePath();

        const extrudeSettings = { depth: width, bevelEnabled: false };
        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.center();
        // Map the long axis onto Z, with the high edge facing the catwalk.
        geom.rotateY(-Math.PI / 2);

        const mat = new THREE.MeshStandardMaterial({
            color: 0x80847a,
            map: this.concreteColor,
            normalMap: this.concreteNormal,
            roughness: 0.6,
            metalness: 0.2
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(pos.x, pos.y + height / 2, pos.z);
        mesh.rotation.y = rotY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isShootable = true;
        this.scene.add(mesh);

        const box = new THREE.Box3().setFromObject(mesh);
        box.ramp = { position: pos.clone(), width, height, length, rotation: rotY };
        this.colliders.push(box);
    }

    buildDetails() {
        const steel = new THREE.MeshStandardMaterial({ color: 0x28383c, roughness: 0.7, metalness: 0.45 });
        const paint = new THREE.MeshStandardMaterial({ color: 0xa58a45, roughness: 0.85 });
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x243b48, roughness: 0.24, metalness: 0.45 });
        const trim = new THREE.MeshStandardMaterial({ color: 0x454f51, roughness: 0.85 });
        const add = (size, pos, mat) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
            mesh.position.set(...pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.isShootable = true;
            this.scene.add(mesh);
            return mesh;
        };
        // Industrial facade breaks the blank tower into readable floors.
        for (const z of [-7.025, 7.025]) {
            for (let x = -5; x <= 5; x += 2.5) {
                add([1.9, 1.05, 0.07], [x, 5.3, z], steel);
                add([1.65, 0.82, 0.09], [x, 5.3, z * 1.003], windowMat);
            }
            add([14.1, 0.2, 0.12], [0, 3.45, z], trim);
            for (const x of [-6.4, 6.4]) add([0.32, 7, 0.22], [x, 3.5, z], trim);
            add([2.2, 2.65, 0.09], [0, 1.325, z], steel);
            for (let i = 0; i < 7; i++) add([1.95, 0.035, 0.12], [0, 0.35 + i * 0.32, z * 1.01], trim);
            add([2.4, 0.14, 0.14], [0, 2.75, z], paint);
        }
        // Catwalk supports and edge markings.
        for (const x of [-30, -18, 18, 30]) {
            for (const z of [-3, 3]) add([0.32, 3.5, 0.32], [x, 1.75, z], steel);
        }
        for (const x of [-24, 24]) {
            for (const z of [-3.9, 3.9]) add([15.8, 0.035, 0.15], [x, 3.78, z], paint);
            for (const z of [-3.85, 3.85]) {
                // Leave ramp access at the middle of each platform.
                for (const side of [-1, 1]) {
                    for (const y of [4.3, 4.8]) add([5.3, 0.045, 0.045], [x + side * 5.2, y, z], steel);
                    for (let offset = 3; offset < 8; offset += 2.3) add([0.07, 1.1, 0.07], [x + side * offset, 4.27, z], steel);
                }
            }
        }
        for (const [x, z] of [[-16, 14], [-17, 15], [29, 19], [30, 20], [-31, -11], [9, -27]]) {
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1, 20), steel);
            barrel.position.set(x, 0.5, z);
            barrel.castShadow = true; barrel.receiveShadow = true;
            barrel.userData.isShootable = true;
            this.scene.add(barrel);
            this.colliders.push(new THREE.Box3().setFromObject(barrel));
            for (const y of [-0.3, 0.3]) {
                const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.343, 0.018, 4, 20), trim);
                hoop.rotation.x = Math.PI / 2; hoop.position.y = y;
                barrel.add(hoop);
            }
        }
        // Lane paint, concrete blast barriers and distant industrial silhouettes.
        for (let z = -60; z <= 60; z += 6) {
            add([0.12, 0.008, 2.7], [-12, 0.01, z], paint);
            add([0.12, 0.008, 2.7], [12, 0.01, z], paint);
        }
        for (const x of [-45, 45]) {
            for (const z of [-8, 8]) this.createBoxCollider(new THREE.Vector3(x, 0.65, z), new THREE.Vector3(4, 1.3, 0.8), trim);
        }
        for (let i = 0; i < 14; i++) {
            const angle = i / 14 * Math.PI * 2;
            const height = 12 + (i * 7 % 17);
            add([14, height, 10], [Math.cos(angle) * 91, height / 2, Math.sin(angle) * 91], trim);
        }
        // Large sector labels remain legible while sprinting.
        for (const [text, x, z, yaw] of [['SECTOR 07', 3.5, 7.08, 0], ['SNIPER RANGE', -69.9, 22, Math.PI / 2]]) {
            const canvas = document.createElement('canvas');
            canvas.width = 1024; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#172426'; ctx.fillRect(0, 0, 1024, 256);
            ctx.fillStyle = '#d1bc78'; ctx.fillRect(0, 0, 14, 256);
            ctx.font = 'bold 115px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(text, 520, 168);
            const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
            sign.position.set(x, 2, z); sign.rotation.y = yaw;
            this.scene.add(sign);
        }
    }

    createJumpPad(x, y, z, force = 22.0) {
        const group = new THREE.Group();
        group.position.set(x, y, z);

        // Base ring
        const baseGeom = new THREE.CylinderGeometry(1.8, 2.0, 0.2, 24);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.5, metalness: 0.7 });
        const baseMesh = new THREE.Mesh(baseGeom, baseMat);
        group.add(baseMesh);

        // Glowing center pad
        const padGeom = new THREE.CylinderGeometry(1.4, 1.4, 0.25, 24);
        const padMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
        const padMesh = new THREE.Mesh(padGeom, padMat);
        padMesh.position.y = 0.05;
        group.add(padMesh);

        // Light pillar
        const light = new THREE.PointLight(0x00ffcc, 2.0, 8);
        light.position.y = 0.8;
        group.add(light);

        this.scene.add(group);

        this.jumpPads.push({
            x,
            y,
            z,
            radius: 1.8,
            force
        });
    }
}
