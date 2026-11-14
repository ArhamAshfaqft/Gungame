import bpy
from mathutils import Vector
base=r'E:/Fast Snipe/blender-assets/'
bpy.ops.wm.open_mainfile(filepath=base+'Soldier-M4-Idle-Preview.blend')
s=bpy.context.scene;rig=next(o for o in s.objects if o.type=='ARMATURE');w=bpy.data.objects['M4_RightHand_Attachment']
positions=[]
for frame in [1,30,60,90,120]:
 s.frame_set(frame);bpy.context.view_layer.update();hand=rig.matrix_world@rig.pose.bones['mixamorigRightHand'].matrix;positions.append(tuple(hand.inverted()@w.matrix_world.translation))
print('RIGHT_HAND_ATTACHMENT_LOCAL',positions)
s.frame_set(1);target=Vector((.07,.05,.48));cam=s.camera;cam.location=Vector((1.5,.1,.8));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=base+'Soldier-M4-Idle-Side.png';bpy.ops.render.render(write_still=True)
