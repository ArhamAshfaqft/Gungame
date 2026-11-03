import * as T from 'three';

// Compile the exact normal/instanced/batched material variants before Play.
// The first impact used to introduce these programs during the explosion.
export async function warmDestruction(game){
 await game.arena.materialsReady;
 const {renderer,scene,camera,arena,surfaceDamage}=game,stage=new T.Group(),geometries=[],batches=[],instances=[],keys=new Set(),geometry=new T.BoxGeometry(.1,.1,.1);
 geometries.push(geometry);const add=(material,kind='plain',color=false)=>{
  const key=`${material.id}:${kind}:${color}`;if(keys.has(key))return;keys.add(key);let mesh;
  if(kind==='batched'){mesh=new T.BatchedMesh(1,24,36,material);const id=mesh.addGeometry(geometry);mesh.addInstance(id);batches.push(mesh);}
  else if(kind==='instance'){mesh=new T.InstancedMesh(geometry,material,1);mesh.setMatrixAt(0,new T.Matrix4());if(color)mesh.setColorAt(0,new T.Color(0xffffff));}
  else mesh=new T.Mesh(geometry,material);
  mesh.position.set(0,-10000,0);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;stage.add(mesh);
 };
 scene.traverse(mesh=>{if(!mesh.isMesh||!mesh.userData.damageablePart)return;for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){add(mat);add(mat,'batched');}});
 for(const mat of Object.values(surfaceDamage.markMaterials)){add(mat);add(mat,'batched');}if(arena.blastScars)add(arena.blastScars.material);
 // Every instanced particle source exists at load time, but instance colours
 // are allocated only by the first coloured fragment. Warm both shader paths.
 scene.traverse(mesh=>{if(!mesh.isInstancedMesh)return;const proxy=new T.InstancedMesh(mesh.geometry,mesh.material,1);proxy.position.y=-10000;proxy.frustumCulled=false;proxy.setMatrixAt(0,new T.Matrix4());proxy.setColorAt(0,new T.Color(0xffffff));stage.add(proxy);instances.push(proxy);});
 for(const body of arena.liquids?.bodies||[]){const material=body.streamMaterial();add(material);}
 arena.prepareRender?.(camera.position);
 const viewport=renderer.getViewport(new T.Vector4()),scissor=renderer.getScissor(new T.Vector4()),test=renderer.getScissorTest(),target=renderer.getRenderTarget(),override=scene.overrideMaterial;
 try{
  // Gameplay renders into the composer's linear HDR target. Warming only the
  // canvas compiles different tone-mapping/output programs and misses the hitch.
  if(game.composer)renderer.setRenderTarget(game.composer.readBuffer);
  await renderer.compileAsync(scene,camera);await renderer.compileAsync(stage,camera,scene);
  if(game.ambientOcclusion){scene.overrideMaterial=game.ambientOcclusion.normalMaterial;stage.overrideMaterial=scene.overrideMaterial;await renderer.compileAsync(scene,camera);await renderer.compileAsync(stage,camera,scene);scene.overrideMaterial=override;stage.overrideMaterial=null;}
  renderer.setRenderTarget(target);scene.add(stage);renderer.shadowMap.needsUpdate=true;
  if(game.composer)game.composer.render(0);else{renderer.setViewport(0,0,1,1);renderer.setScissor(0,0,1,1);renderer.setScissorTest(true);renderer.render(scene,camera);}
 }finally{
  scene.overrideMaterial=override;stage.removeFromParent();renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(test);
  for(const batch of batches)batch.dispose();for(const instance of instances)instance.dispose();for(const g of geometries)g.dispose();arena.shadowsDirty=true;
 }
 return{variants:keys.size};
}
