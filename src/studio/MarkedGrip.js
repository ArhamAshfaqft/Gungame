import * as T from 'three';

// Raycast the rendered, skinned hand; reject sleeve, opposite hand and weapon hits.
export function isPalmHit(hit, side) {
    const mesh = hit.object;
    if (!mesh.isSkinnedMesh || !hit.face) return false;
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    if (!indices || !weights) return false;
    let amount = 0;
    for (const index of [hit.face.a, hit.face.b, hit.face.c]) for (let k = 0; k < 4; k++) {
        const bone = mesh.skeleton.bones[indices.getComponent(index, k)];
        if (bone?.name.replace(/^mixamorig[:_]?/, '').replace(/_\d+$/, '') === side + 'Hand') amount += weights.getComponent(index, k) / 3;
    }
    return amount > .5;
}

export function createMarkedGrip(api) {
    let which, third, mode = null, gunPoint = null, palmPoint = null, status, controls, draft = false;
    const raycaster = new T.Raycaster();
    const markers = ['#ffbc42', '#43dfde'].map(color => {
        const marker = new T.Mesh(new T.SphereGeometry(1, 12, 8), new T.MeshBasicMaterial({ color, depthTest: false }));
        marker.renderOrder = 1000; marker.userData.contactMarker = true; marker.visible = false; return marker;
    });
    function message(text) { if (status) status.textContent = text; }
    function cancel() { mode = null; api.picking(false); controls?.querySelectorAll('[data-pick]').forEach(b => b.classList.remove('active')); }
    function clear() { cancel(); draft = false; gunPoint = palmPoint = null; for (const marker of markers) { marker.removeFromParent(); marker.visible = false; } }
    function paint() {
        const context = api.context(which, third); if (!context) return;
        for (const [i, point, parent] of [[0, gunPoint, context.model], [1, palmPoint, context.rig.bones[which + 'Hand']]]) {
            const marker = markers[i];
            if (!point) { marker.visible = false; continue; }
            if (marker.parent !== parent) parent.add(marker);
            marker.position.fromArray(point); marker.visible = true;
            const scale = parent.getWorldScale(new T.Vector3());
            marker.scale.set(.004 / Math.abs(scale.x), .004 / Math.abs(scale.y), .004 / Math.abs(scale.z));
        }
    }
    api.canvas.addEventListener('pointerdown', event => {
        if (!mode || event.button !== 0) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const context = api.context(which, third); if (!context) return;
        const rect = api.canvas.getBoundingClientRect();
        raycaster.setFromCamera(new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), context.camera);
        context.rig.object.updateWorldMatrix(true, true); context.model.updateWorldMatrix(true, true);
        let hit;
        if (mode === 'gun') hit = raycaster.intersectObject(context.model, true).find(h => {
            if (!h.object.isMesh || h.object.userData.contactMarker) return false;
            for(let node=h.object;node;node=node.parent)if(!node.visible)return false;
            return true;
        });
        else {
            context.rig.object.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.computeBoundingSphere(); });
            hit = raycaster.intersectObject(context.rig.object, true).find(h => isPalmHit(h, which));
        }
        if (!hit) { message(mode === 'gun' ? 'Click a visible surface on the gun. You can cancel to change the camera.' : `Click the ${which.toLowerCase()} palm, not the sleeve or the other hand. Cancel to orbit if needed.`); return; }
        if (mode === 'gun') gunPoint = context.model.worldToLocal(hit.point.clone()).toArray();
        else palmPoint = context.rig.bones[which + 'Hand'].worldToLocal(hit.point.clone()).toArray();
        draft = true;
        cancel(); paint();
        message(gunPoint && palmPoint ? 'Both marks are ready. Press Connect hand, then turn the wrist if needed.' : gunPoint ? 'Gun marked in gold. Now mark the matching spot on the palm.' : 'Palm marked in cyan. Now mark the gun.');
        updateButtons();
    }, true);
    function updateButtons() { const button = controls?.querySelector('#guide-connect-hand'); if (button) button.disabled = !gunPoint || !palmPoint; }
    function mount(parent, side, fullBody) {
        clear(); which = side; third = fullBody;
        const saved = api.target(which, third).contact;
        gunPoint = saved?.weaponPoint ? [...saved.weaponPoint] : null;
        palmPoint = saved?.palmPoint ? [...saved.palmPoint] : null;
        controls = document.createElement('section'); controls.className = 'guide-contact';
        const title = document.createElement('h3'); title.textContent = 'Connect palm to gun';
        const help = document.createElement('p'); help.className = 'guide-note'; help.textContent = 'Mark a matching contact spot on each surface. The gold and cyan dots meet; wrist controls set the palm direction. For a palm mark, orbit until the inside of the hand is visible.';
        const buttons = document.createElement('div'); buttons.className = 'guide-pad';
        for (const [label, value] of [['1. Mark gun', 'gun'], ['2. Mark palm', 'palm']]) {
            const button = document.createElement('button'); button.textContent = label; button.id = 'guide-mark-' + value; button.dataset.pick = value;
            button.onclick = () => { cancel(); mode = value; api.picking(true); button.classList.add('active'); message(value === 'gun' ? 'Click the gun where this palm should touch.' : `Click a contact spot on the ${which.toLowerCase()} palm.`); }; buttons.append(button);
        }
        const connect = document.createElement('button'); connect.id = 'guide-connect-hand'; connect.className = 'primary'; connect.textContent = '3. Connect hand';
        connect.onclick = () => { cancel(); api.edit(() => { api.target(which, third).contact = { weaponPoint: [...gunPoint], palmPoint: [...palmPoint] }; }); draft = false; message('Connected. Turn the wrist to fit the palm; use the finger controls to wrap the grip.'); };
        const disconnect = document.createElement('button'); disconnect.textContent = 'Disconnect'; disconnect.id = 'guide-disconnect-hand';
        disconnect.onclick = () => { api.edit(() => { api.target(which, third).contact = null; }); gunPoint = palmPoint = null; clear(); updateButtons(); message('Disconnected. You can move the hand freely again.'); };
        const cancelButton = document.createElement('button'); cancelButton.textContent = 'Cancel marking'; cancelButton.onclick = () => { cancel(); message('Marking cancelled. Orbit to choose another view.'); };
        status = document.createElement('p'); status.className = 'guide-note'; status.id = 'guide-contact-status'; status.setAttribute('role', 'status');
        buttons.append(connect, disconnect, cancelButton); controls.append(title, help, buttons, status); parent.append(controls);
        updateButtons(); paint(); message(saved ? 'Saved connection loaded. The hand follows its mark on the gun.' : 'Choose a point on the gun, then the matching point on the palm.');
    }
    return { mount, clear, cancel, update() {
        paint();
        if (!which || mode || draft || !gunPoint || !api.target(which, third).contact) return;
        const gap = api.context(which, third)?.rig.contactMiss?.[which];
        if (gap != null) {
            message(gap > .01 ? `Marks are ${(gap * 100).toFixed(1)} cm apart: the arm cannot reach this spot. Open Arm shape → Shoulder placement, or choose a closer gun mark.` : `Connected · ${(gap * 1000).toFixed(1)} mm gap. Turn the wrist to fit the palm, then wrap the fingers.`);
            status.className = gap > .01 ? 'guide-note guide-warning' : 'guide-note';
        }
    }, get picking() { return !!mode; } };
}
