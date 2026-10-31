import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = readFileSync(new URL('../public/assets/operators/swat.glb', import.meta.url));
const length = data.readUInt32LE(12);
const gltf = JSON.parse(data.subarray(20, 20 + length).toString());

test('SWAT body and first-person arms retain skinned finger rigs', () => {
    for (const name of ['SWAT_Body', 'SWAT_ViewArms']) assert.ok(gltf.nodes.some(node => node.name === name));
    assert.equal(gltf.skins.length, 2);
    for (const skin of gltf.skins) {
        assert.equal(skin.joints.length, 65);
        assert.ok(skin.joints.some(index => /HandIndex1/.test(gltf.nodes[index].name)));
    }
});

test('character export batches materials and contains no empty or unindexed primitives', () => {
    for (const mesh of gltf.meshes) {
        assert.ok(mesh.primitives.length <= 2, 'FBX material groups must be batched before export');
        for (const primitive of mesh.primitives) {
            assert.notEqual(primitive.indices, undefined, 'Unindexed primitives can draw unused skin vertices');
            assert.ok(gltf.accessors[primitive.indices].count > 0);
        }
    }
    const body = gltf.meshes[0];
    const triangles = body.primitives.reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count / 3, 0);
    assert.ok(triangles <= 16000, `Remote body costs ${triangles} triangles`);
    assert.ok(data.length < 10 * 1024 * 1024);
});
