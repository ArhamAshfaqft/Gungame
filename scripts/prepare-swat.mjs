// Run with the Vite development server running. The source FBX is never modified.
import { chromium } from 'playwright';
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

let executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if (!executablePath) {
    const cache = path.join(os.homedir(), 'AppData/Local/ms-playwright');
    for (const entry of (await readdir(cache)).filter(n => /^chromium-/.test(n)).reverse()) {
        for (const directory of ['chrome-win64', 'chrome-win']) {
            const candidate = path.join(cache, entry, directory, 'chrome.exe');
            if (await stat(candidate).catch(() => null)) { executablePath = candidate; break; }
        }
        if (executablePath) break;
    }
}
const browser = await chromium.launch({ headless: true, executablePath });
try {
    const page = await browser.newPage();
    await page.goto(process.env.ASSET_SERVER_URL || 'http://127.0.0.1:5180');
    const result = await page.evaluate(async () => {
        const THREE = await import('/node_modules/three/build/three.module.js');
        const { FBXLoader } = await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
        const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
        const { mergeVertices } = await import('/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js');
        const { clone } = await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');
        const { extractArmGeometry } = await import('/src/models/SwatRig.js');
        const { MeshoptSimplifier } = await import('/node_modules/meshoptimizer/meshopt_simplifier.js');
        await MeshoptSimplifier.ready;
        const manager = new THREE.LoadingManager();
        const failed = [];
        manager.onError = url => failed.push(url);
        const complete = new Promise(resolve => { manager.onLoad = resolve; });
        const model = await new FBXLoader(manager).loadAsync('/Ch15_nonPBR.fbx');
        await complete;
        if (failed.length) throw new Error(`Missing source textures: ${failed.join(', ')}`);
        model.animations = [];
        model.name = 'SWAT_Operator';
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const scale = 1.85 / (bounds.max.y - bounds.min.y);
        model.scale.multiplyScalar(scale);
        model.position.y -= bounds.min.y * scale;
        const report = { source: 'Ch15_nonPBR.fbx', height: 1.85, meshes: [], textures: [] };
        const resize = (texture, size, mimeType) => {
            if (!texture) return null;
            const canvas = document.createElement('canvas');
            const ratio = Math.min(1, size / Math.max(texture.image.width, texture.image.height));
            canvas.width = Math.round(texture.image.width * ratio);
            canvas.height = Math.round(texture.image.height * ratio);
            canvas.getContext('2d').drawImage(texture.image, 0, 0, canvas.width, canvas.height);
            const copy = texture.clone();
            copy.image = canvas;
            copy.userData = { mimeType };
            copy.needsUpdate = true;
            report.textures.push({ name: texture.name, width: canvas.width, height: canvas.height, mimeType });
            return copy;
        };
        model.traverse(mesh => {
            if (!mesh.isMesh) return;
            const before = mesh.geometry.attributes.position.count;
            mesh.geometry = mergeVertices(mesh.geometry, 0.0001);
            // FBX creates hundreds of disjoint groups using just two materials.
            // Merge them before glTF export; empty primitives otherwise become unindexed draws.
            const buckets = new Map();
            for (const group of mesh.geometry.groups) {
                if (!group.count) continue;
                if (!buckets.has(group.materialIndex)) buckets.set(group.materialIndex, []);
                const bucket = buckets.get(group.materialIndex);
                for (let i = group.start; i < group.start + group.count; i++) bucket.push(mesh.geometry.index.getX(i));
            }
            const batched = [];
            mesh.geometry.clearGroups();
            for (const [materialIndex, indices] of buckets) {
                mesh.geometry.addGroup(batched.length, indices.length, materialIndex);
                batched.push(...indices);
            }
            mesh.geometry.setIndex(batched);
            report.meshes.push({ name: mesh.name, before, after: mesh.geometry.attributes.position.count,
                triangles: mesh.geometry.index.count / 3, bones: mesh.skeleton?.bones.length });
            const convert = material => new THREE.MeshStandardMaterial({
                name: material.name,
                color: 0xffffff,
                map: resize(material.map, 2048, 'image/jpeg'),
                normalMap: resize(material.normalMap, 1024, 'image/png'),
                normalScale: new THREE.Vector2(0.65, 0.65),
                roughness: 0.85,
                metalness: 0.08,
            });
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
        });
        model.userData = { source: 'User-provided Mixamo Ch15', height: 1.85 };
        const arms = clone(model);
        arms.name = 'SWAT_ViewArms';
        arms.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.geometry = extractArmGeometry(mesh); });
        model.name = 'SWAT_Body';
        report.lod = [];
        model.traverse(mesh => {
            if (!mesh.isSkinnedMesh) return;
            const geometry = mesh.geometry.clone();
            const groups = geometry.groups.map(group => ({ ...group }));
            const output = [];
            geometry.clearGroups();
            for (const group of groups) {
                const source = Uint32Array.from(geometry.index.array.slice(group.start, group.start + group.count));
                const [simplified] = MeshoptSimplifier.simplify(source, geometry.attributes.position.array, 3,
                    Math.floor(source.length * 0.32 / 3) * 3, 0.01);
                if (simplified.length) geometry.addGroup(output.length, simplified.length, group.materialIndex);
                for (const index of simplified) output.push(index);
            }
            geometry.setIndex(output);
            // Compact the vertex/skin buffers after removing triangles.
            const used = [], remap = new Map();
            for (const index of output) if (!remap.has(index)) { remap.set(index, used.length); used.push(index); }
            for (const [name, attribute] of Object.entries(geometry.attributes)) {
                const array = new attribute.array.constructor(used.length * attribute.itemSize);
                used.forEach((vertex, i) => {
                    for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = attribute.array[vertex * attribute.itemSize + k];
                });
                geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
            }
            geometry.setIndex(output.map(index => remap.get(index)));
            geometry.computeBoundingBox(); geometry.computeBoundingSphere();
            mesh.geometry = geometry;
            report.lod.push({ triangles: output.length / 3, vertices: used.length });
        });
        const scene = new THREE.Scene();
        scene.add(model, arms);
        const buffer = await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 2048 });
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
        return { base64: btoa(binary), report: { ...report, outputBytes: bytes.length } };
    });
    await mkdir('public/assets/operators', { recursive: true });
    await mkdir('artifacts', { recursive: true });
    await writeFile('public/assets/operators/swat.glb', Buffer.from(result.base64, 'base64'));
    await writeFile('artifacts/swat-optimization.json', JSON.stringify(result.report, null, 2));
    console.log(JSON.stringify(result.report, null, 2));
} finally {
    await browser.close();
}
