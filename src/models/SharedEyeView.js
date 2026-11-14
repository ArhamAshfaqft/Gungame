import * as T from 'three';

// Camera changes presentation only; weapon attachments and posed bones stay intact.
export function characterEyePosition(rig, target = new T.Vector3()) {
    rig.object.updateWorldMatrix(true, true);
    const head = rig.bones.Head || rig.bones.Neck;
    return head.getWorldPosition(target).add(new T.Vector3(0, .055, .09)
        .applyQuaternion(rig.object.getWorldQuaternion(new T.Quaternion())));
}
export function lookThroughCharacter(camera, rig) {
    characterEyePosition(rig, camera.position);
    const forward = new T.Vector3(0, 0, 1).applyQuaternion(rig.object.getWorldQuaternion(new T.Quaternion()));
    camera.up.set(0, 1, 0); camera.lookAt(camera.position.clone().add(forward)); camera.updateMatrixWorld(true);
}
export function eyeViewGeometry(mesh) {
    const source = mesh.geometry, index = source.index;
    const skin = source.attributes.skinIndex, weight = source.attributes.skinWeight;
    if (!mesh.isSkinnedMesh || !skin || !weight) return source;
    const hidden = new Set(mesh.skeleton.bones.flatMap((bone, i) => /^(Head|Neck)$/.test(bone.name.replace(/^mixamorig[:_]?/, '').replace(/_\d+$/, '')) ? [i] : []));
    const headVertex = vertex => {
        let amount = 0;
        for (let k = 0; k < 4; k++) if (hidden.has(skin.getComponent(vertex, k))) amount += weight.getComponent(vertex, k);
        return amount > .25;
    };
    const result = source.clone(), output = []; result.clearGroups();
    for (const group of source.groups.length ? source.groups : [{start:0,count:index?.count || source.attributes.position.count,materialIndex:0}]) {
        const start = output.length;
        for (let i = group.start; i < group.start + group.count; i += 3) {
            const triangle = [0,1,2].map(k => index ? index.getX(i+k) : i+k);
            if (!triangle.some(headVertex)) output.push(...triangle);
        }
        result.addGroup(start, output.length - start, group.materialIndex);
    }
    result.setIndex(output); return result;
}
export function setCharacterEyeView(rig, enabled) {
    rig.object.traverse(mesh => {
        if (!mesh.isSkinnedMesh) return;
        if (enabled && !mesh.userData.eyeGeometry) mesh.userData.eyeGeometry = {full:mesh.geometry,eye:eyeViewGeometry(mesh)};
        const geometries = mesh.userData.eyeGeometry;
        if (geometries) mesh.geometry = enabled ? geometries.eye : geometries.full;
    });
}
