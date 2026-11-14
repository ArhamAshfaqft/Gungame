import bpy
for f in ['rifle_side_lean_anim.fbx','running_with_rifle_anim.fbx']:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath='E:/Fast Snipe/New animations/'+f)
 for o in bpy.context.scene.objects:
  if o.type=='ARMATURE':
   print('FILE',f,'SCALE',tuple(o.scale),'BONES',len(o.data.bones),'NAMES',[b.name for b in list(o.data.bones)[:7]])
   for b in o.pose.bones:
    if b.name.endswith('Hand') or b.name.endswith('Hips'):print('BONE',b.name,tuple(b.location),tuple(b.rotation_quaternion))
 for a in bpy.data.actions:print('ACTION',a.name,tuple(a.frame_range))
