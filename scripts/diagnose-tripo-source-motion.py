import bpy,math,json
from mathutils import Quaternion
base='E:/Fast Snipe/'
for kind in ['source','game']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 if kind=='source':bpy.ops.import_scene.fbx(filepath=base+'New animations/running_with_rifle_anim.fbx')
 else:bpy.ops.import_scene.gltf(filepath=base+'public/assets/comparison/tripo-playable.glb')
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 if kind=='game':
  actions=[a for a in bpy.data.actions if a.name=='Tripo_Run'];rig.animation_data.action=actions[0]
 def bone(name):return next(b for b in rig.pose.bones if b.name.replace(':','')=='mixamorig'+name)
 samples=[];positions=[]
 for frame in range(63,81):
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
  hand=rig.matrix_world@bone('RightHand').matrix;chest=rig.matrix_world@bone('Spine2').matrix
  relative=chest.inverted()@hand;samples.append(relative.to_quaternion());positions.append(relative.translation.copy())
 angles=[math.degrees(samples[i].rotation_difference(samples[i+1]).angle) for i in range(len(samples)-1)]
 print('RESULT',kind,json.dumps({'relative_rotation_range_degrees':max(math.degrees(a.rotation_difference(b).angle) for a in samples for b in samples),'max_frame_step':max(angles),'hand_position_range':max((a-b).length for a in positions for b in positions)}))
