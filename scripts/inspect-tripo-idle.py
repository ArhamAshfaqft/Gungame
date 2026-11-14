import bpy,json
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r'E:/Fast Snipe/tactical_soldier_m4_idle.glb')
bpy.context.scene.frame_set(1)
for o in bpy.context.scene.objects:
 print('OBJECT',o.name,o.type,tuple(o.dimensions))
 if o.type=='ARMATURE':
  for b in o.pose.bones:
   if any(x in b.name for x in ['Hand','ForeArm','Arm','Head','Hips']) and not any(x in b.name for x in ['Index','Middle','Ring','Pinky','Thumb']):print('BONE',b.name,tuple(o.matrix_world@b.head),tuple(o.matrix_world@b.tail))
print('RANGE',bpy.context.scene.frame_start,bpy.context.scene.frame_end)
