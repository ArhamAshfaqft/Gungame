"""Prepare a replaceable mono PCM bank with onset trimming and peak normalization."""
import json,base64,subprocess,wave,io
from pathlib import Path
import numpy as np
rows=json.loads(Path('artifacts/cs-audio/extracted.json').read_text());out=Path('public/assets/audio/combat');out.mkdir(parents=True,exist_ok=True)
manifest=[];samples={}
for row in rows:
 result=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',row['rawFile'],'-ac','1','-ar','22050','-f','s16le','-'],capture_output=True,check=True)
 data=np.frombuffer(result.stdout,dtype='<i2').astype(np.float32)/32768
 peak=float(np.max(np.abs(data)));indices=np.flatnonzero(np.abs(data)>max(.002,peak*.015))
 if not len(indices):raise RuntimeError('Silent '+row['key'])
 start=max(0,int(indices[0])-110);end=min(len(data),int(indices[-1])+2205);data=data[start:end]
 data*=.85/max(.01,float(np.max(np.abs(data))))
 fade=min(220,len(data)//4);data[-fade:]*=np.linspace(1,0,fade)
 stream=io.BytesIO()
 with wave.open(stream,'wb') as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(22050);wav.writeframes((data*32767).astype('<i2').tobytes())
 pcm=stream.getvalue();(out/(row['key']+'.wav')).write_bytes(pcm);samples[row['key']]=base64.b64encode(pcm).decode()
 manifest.append({**row,'duration':len(data)/22050,'file':row['key']+'.wav'})
(out/'samples.json').write_text(json.dumps({'version':1,'format':'wav-base64','samples':samples}))
(out/'manifest.json').write_text(json.dumps({'version':1,'placeholder':True,'source':r'User-provided E:\Builds\builds_Data\data.unity3d','license':'Not established; no open-source or redistribution license asserted. Temporary user-requested placeholders.','clips':manifest},indent=2))
(out/'NOTICE.txt').write_text('Temporary audio extracted from the user-provided CSMetal Unity build at E:\\Builds.\nSource ownership and licensing are unverified; no CC0/open-source claim is made.\nReplace before distribution with cleared original audio.\nSee manifest.json for original asset names and path IDs.\nProcessing: mono 22.05 kHz PCM, silence trimming, peak normalization, short tail fades.\nThe pin and throw cues are temporary repurposed mechanical/swipe sounds.\n')
print(json.dumps({'clips':len(samples),'bankBytes':(out/'samples.json').stat().st_size}))
