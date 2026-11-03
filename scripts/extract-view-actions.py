"""Isolated extraction of selected action curves from the user-supplied Unity bundle.

Requires UnityPy 1.25.x. Does not execute or modify the original game.
"""
from pathlib import Path
import argparse
import json
import UnityPy

parser = argparse.ArgumentParser()
parser.add_argument('--bundle', default=r'E:\Builds\builds_Data\data.unity3d')
args = parser.parse_args()
selected = {1954: 'pistolDraw', 1955: 'pistolReload', 2239: 'pistolFire',
            1932: 'sniperDraw', 1935: 'sniperReload', 1936: 'sniperFire',
            2174: 'grenadeDraw', 2209: 'grenadePin', 1971: 'grenadeThrow'}
env = UnityPy.load(args.bundle)
clips = []
for obj in env.objects:
    if obj.type.name != 'AnimationClip' or obj.assets_file.name != 'resources.assets' or obj.path_id not in selected:
        continue
    data = obj.parse_as_dict()
    tracks = []
    for field, prop in [('m_PositionCurves', 'position'), ('m_RotationCurves', 'quaternion'), ('m_ScaleCurves', 'scale')]:
        for row in data.get(field, []):
            if not row['path'].startswith('Arms_Root'):
                continue
            keys = row['curve']['m_Curve']
            if not keys:
                continue
            axes = 'xyzw' if prop == 'quaternion' else 'xyz'
            tracks.append({'path': row['path'], 'property': prop,
                           'times': [k['time'] for k in keys],
                           'values': [k['value'][axis] for k in keys for axis in axes]})
    clips.append({'id': selected[obj.path_id], 'sourceId': obj.path_id, 'sourceName': data['m_Name'],
                  'duration': max(max(t['times']) for t in tracks), 'tracks': tracks})
if len(clips) != len(selected):
    raise RuntimeError('Bundle version differs: expected nine selected action clips.')
output = Path('artifacts/csmetal-actions/source-curves.json')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'clips': clips}), encoding='utf8')
print(f'Exported {len(clips)} selected action curves to {output}.')
