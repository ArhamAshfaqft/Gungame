"""Prepare the two user-supplied water recordings using ffmpeg and stdlib Python."""
import array
import base64
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/audio/water'
RATE = 22050
SOURCES = {
    'entry': 'freesound_community-splash-by-blaukreuz-6261.mp3',
    'steps': 'alex_jauk-walking-in-water-148426.mp3',
}


def decode(name):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(ROOT / name),
                                   '-f', 'f32le', '-ac', '1', '-ar', str(RATE), 'pipe:1'])
    samples = array.array('f')
    samples.frombytes(raw)
    if sys.byteorder != 'little':
        samples.byteswap()
    return samples


def export(key, source, samples, offset=0):
    # Remove recording lead-in, retain a short attack, and prevent edge clicks.
    peak = max(abs(v) for v in samples)
    first = next((i for i, v in enumerate(samples) if abs(v) > peak * .015), 0)
    trim = max(0, first - int(.004 * RATE))
    samples = samples[trim:]
    rms = math.sqrt(sum(v * v for v in samples) / len(samples))
    gain = min(.85 / peak, (.12 if key == 'waterEntry' else .09) / max(rms, 1e-6))
    fade = int(.008 * RATE)
    pcm = array.array('h', (round(max(-1, min(1, v * gain)) * 32767 *
                                min(1, i / fade, (len(samples) - 1 - i) / fade))
                            for i, v in enumerate(samples)))
    if sys.byteorder != 'little':
        pcm.byteswap()
    filename = f'{key}.wav'
    with wave.open(str(OUT / filename), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        output.writeframes(pcm.tobytes())
    return {'key': key, 'file': filename, 'source': source,
            'sourceOffset': round(offset + trim / RATE, 5),
            'duration': round(len(samples) / RATE, 5), 'gain': round(gain, 5)}


OUT.mkdir(parents=True, exist_ok=True)
entry, steps = decode(SOURCES['entry']), decode(SOURCES['steps'])
clips = [export('waterEntry', SOURCES['entry'], entry)]
for i, peak_time in enumerate([1.35, 4.1, 5.2, 6.25, 8.4, 10.85]):
    start = peak_time - .16
    clips.append(export(f'waterStep{i}', SOURCES['steps'],
                        steps[round(start * RATE):round((start + .68) * RATE)], start))
manifest = {'description': 'Player water entry and foot-contact sounds; not bullet or grenade impacts.',
            'provenance': 'User-supplied recordings. No redistribution license asserted.',
            'sources': [{'file': name, 'sha256': hashlib.sha256((ROOT / name).read_bytes()).hexdigest()}
                        for name in SOURCES.values()], 'clips': clips}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
bank = {'version': 1, 'format': 'wav-base64',
        'samples': {clip['key']: base64.b64encode((OUT / clip['file']).read_bytes()).decode('ascii')
                    for clip in clips}}
(OUT / 'samples.json').write_text(json.dumps(bank, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Prepared {len(clips)} water cues ({sum(p.stat().st_size for p in OUT.glob("*.wav"))} bytes).')
