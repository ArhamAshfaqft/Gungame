import bpy, math, os
from mathutils import Vector, Matrix
base=r'E:/Fast Snipe';out=base+'/blender-assets';os.makedirs(out,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=base+'/tactical_soldier_m4_idle.glb')
scene=bpy.context.scene;scene.frame_set(1)
rig=next(o for o in scene.objects if o.type=='ARMATURE')
for o in list(scene.objects):
 if o.type=='MESH' and o.name=='Icosphere':o.hide_render=True;o.hide_set(True)
def point(name):return rig.matrix_world@rig.pose.bones['mixamorig'+name].head
def palm(side):
 return point(side+'Hand').lerp(point(side+'HandMiddle1'),.65)
rh=palm('Right');lh=palm('Left')
fwd=(lh-rh).normalized();fwd.z=0;fwd.normalize();up=Vector((0,0,1));right=fwd.cross(up).normalized()
rot=Matrix((right,fwd,up)).transposed().to_4x4()
before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=base+'/blender-assets/M4A1-Blender.glb')
gun=list(set(scene.objects)-before)
wrapper=bpy.data.objects.new('M4_RightHand_Attachment',None);scene.collection.objects.link(wrapper)
for o in gun:
 if o.parent not in gun:
  world=o.matrix_world.copy();o.parent=wrapper;o.matrix_world=world
for o in gun:
 if any(s in o.name for s in ['mag_ext','mag_fast']):o.hide_render=True;o.hide_set(True)
scale=.52
world=rot@Matrix.Scale(scale,4)
world.translation=rh-world.to_3x3()@Vector((.013,-.018,-.025))
wrapper.parent=rig;wrapper.parent_type='BONE';wrapper.parent_bone='mixamorigRightHand';wrapper.matrix_world=world
bpy.context.view_layer.update()
# Keep the source action intact; attachment follows the right-hand bone.
action=rig.animation_data.action
ranges=[s.frame_range for s in bpy.data.actions]
if ranges:scene.frame_start=max(1,int(min(v[0] for v in ranges)));scene.frame_end=int(max(v[1] for v in ranges))
scene.frame_set(scene.frame_start)
rig.show_in_front=True
# Neutral inspection lighting and camera.
scene.render.engine='CYCLES';scene.cycles.samples=16
scene.world=bpy.data.worlds.new('Preview world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.18,.18,1)
for pos,power,size in [((1,-2,2),180,2),((-1,1,1.8),100,2)]:
 light=bpy.data.lights.new('Preview softbox','AREA');light.energy=power;light.shape='DISK';light.size=size;o=bpy.data.objects.new(light.name,light);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.5))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=1.3
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
target=Vector((.07,.05,.48));cam.location=target+fwd*1.5+right*.9+Vector((0,0,.25));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=out+'/Soldier-M4-Idle-Preview.blend')
scene.render.filepath=out+'/Soldier-M4-Idle-Preview.png';bpy.ops.render.render(write_still=True)
print('PREVIEW_SAVED',scene.frame_start,scene.frame_end)
