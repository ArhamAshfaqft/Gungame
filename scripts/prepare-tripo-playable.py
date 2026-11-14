import bpy,math
from mathutils import Matrix,Vector
base='E:/Fast Snipe/'
bpy.ops.wm.open_mainfile(filepath=base+'blender-assets/Soldier-M4-Idle-Preview.blend')
scene=bpy.context.scene;target=next(o for o in scene.objects if o.type=='ARMATURE')
idle=target.animation_data.action;idle.name='Tripo_Idle'
scene.frame_set(1);bpy.context.view_layer.update();idleHip=(target.matrix_world@target.pose.bones['mixamorigHips'].matrix).translation.copy()
# Preserve the already approved peek actions verbatim while repairing Run.
with bpy.data.libraries.load(base+'blender-assets/Tripo-Approved-Peek-Reference.blend',link=False) as (available,loaded):
 loaded.actions=[n for n in available.actions if n in ['Tripo_Peek','Tripo_PeekOther']]
for a in loaded.actions:
 track=target.animation_data.nla_tracks.new();track.name=a.name;track.strips.new(a.name,1,a);track.mute=True
for filename,name in [('running_with_rifle_anim.fbx','Tripo_Run')]:
 before=set(scene.objects);bpy.ops.import_scene.fbx(filepath=base+'New animations/'+filename)
 imported=set(scene.objects)-before;source=next(o for o in imported if o.type=='ARMATURE');source.animation_data.action.name=name+'_Source'
 scene.frame_set(1);bpy.context.view_layer.update();sourceHip=(source.matrix_world@source.pose.bones['mixamorig:Hips'].matrix).translation.copy()
 target.animation_data.action=None;action=bpy.data.actions.new(name);target.animation_data.action=action
 pairs=[]
 for tb in target.pose.bones:
  sourceName=tb.name.replace('mixamorig','mixamorig:')
  if name=='Tripo_PeekOther':sourceName=sourceName.replace('Left','SWAP').replace('Right','Left').replace('SWAP','Right')
  pairs.append((tb,source.pose.bones.get(sourceName)));pairs=[(t,s) for t,s in pairs if s]
 pairs.sort(key=lambda pair:len(pair[0].parent_recursive))
 for frame in range(1,121):
  scene.frame_set(frame);bpy.context.view_layer.update()
  for tb,sb in pairs:
   rest=target.matrix_world@tb.bone.matrix_local;sr=source.matrix_world@sb.bone.matrix_local;sp=source.matrix_world@sb.matrix
   delta=sp@sr.inverted()
   if name=='Tripo_PeekOther':
    reflect=Matrix.Diagonal(Vector((1,-1,1,1)));delta=reflect@delta@reflect
   rotation=(delta@rest).to_quaternion()
   local=target.matrix_world.inverted().to_quaternion()@rotation
   if tb.parent:
    pos=tb.parent.matrix@(tb.parent.bone.matrix_local.inverted()@tb.bone.matrix_local).translation
   else:
    worldPos=idleHip.copy();worldPos.z+=sp.translation.z-sourceHip.z
    pos=target.matrix_world.inverted()@worldPos
   tb.matrix=Matrix.LocRotScale(pos,local,Vector((1,1,1)))
   bpy.context.view_layer.update()
   tb.rotation_mode='QUATERNION';tb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=tb.name)
   if not tb.parent:tb.keyframe_insert(data_path='location',frame=frame,group=tb.name)
  bpy.context.view_layer.update()
 for o in imported:bpy.data.objects.remove(o,do_unlink=True)
 for a in list(bpy.data.actions):
  if a.name.endswith('_Source'):bpy.data.actions.remove(a,do_unlink=True)
 track=target.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,action);track.mute=True
# Export actions independently; preserve original idle, weapon attachment, and mesh.
target.animation_data.action=idle;scene.frame_start=1;scene.frame_end=120;scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
 if o.type not in {'CAMERA','LIGHT'} and not o.hide_render and not o.hide_get():o.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=base+'blender-assets/Soldier-M4-Three-Animations.blend')
bpy.ops.export_scene.gltf(filepath=base+'public/assets/comparison/tripo-playable.glb',export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=True)

# Keep approved idle and peeking animation samples exactly unchanged.
import subprocess
subprocess.run(['node',base+'scripts/preserve-tripo-approved-clips.mjs'],cwd=base,check=True)
