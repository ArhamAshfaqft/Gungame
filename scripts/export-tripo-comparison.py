import bpy,os
bpy.ops.wm.open_mainfile(filepath=r'E:/Fast Snipe/blender-assets/Soldier-M4-Idle-Preview.blend')
bpy.context.scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.type not in {'CAMERA','LIGHT'} and not o.hide_render and not o.hide_get():o.select_set(True)
os.makedirs(r'E:/Fast Snipe/public/assets/comparison',exist_ok=True)
bpy.ops.export_scene.gltf(filepath=r'E:/Fast Snipe/public/assets/comparison/tripo-soldier-m4-idle.glb',export_format='GLB',use_selection=True,export_animations=True,export_frame_range=True)
