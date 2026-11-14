import bpy
bpy.ops.wm.open_mainfile(filepath=r'E:/Fast Snipe/blender-assets/Soldier-M4-Three-Animations.blend')
r=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
for name in ['Tripo_Idle','Tripo_Run','Tripo_Peek']:
 r.animation_data.action=bpy.data.actions[name];bpy.context.scene.frame_set(80);bpy.context.view_layer.update()
 print(name,'armworld',r.matrix_world,'HIP',r.pose.bones['mixamorigHips'].head[:], 'HEAD',r.pose.bones['mixamorigHead'].head[:], 'RESTHIP',r.data.bones['mixamorigHips'].head_local[:], 'HSCALE',r.pose.bones['mixamorigHips'].scale[:])
