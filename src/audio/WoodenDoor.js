// Short domestic latch and timber hinge movement. Generated once per audio
// context, avoiding the old metallic impact recording and sawtooth fallback.
export function woodenDoorBuffer(ctx){
 const duration=.48,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
 let seed=1763,low=0;
 for(let i=0;i<data.length;i++){
  const t=i/ctx.sampleRate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed/2147483648-1;low+=.18*(noise-low);
  const latch=Math.exp(-t*100)*(Math.sin(t*2*Math.PI*680)*.24+noise*.22);
  const movement=Math.sin(Math.PI*t/duration)**2*Math.exp(-t*3);
  const grain=low*.22+Math.sin(2*Math.PI*(185*t+22*t*t)+.9*Math.sin(t*31))*.035;
  const settle=t>.32?Math.exp(-(t-.32)*75)*Math.sin((t-.32)*2*Math.PI*230)*.1:0;
  data[i]=latch+movement*grain+settle;
 }
 return buffer;
}
