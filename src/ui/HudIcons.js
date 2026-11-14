// Small, original vector symbols; no image downloads or per-frame rendering.
export function installHudIcons(){
    if(document.getElementById('hud-symbols'))return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id='hud-symbols';svg.setAttribute('aria-hidden','true');
    svg.innerHTML=`<defs>
      <symbol id="hud-rifle" viewBox="0 0 80 30"><path d="M3 13h13l5-7h24v4h28v4H48l-4 5H33l-2 9h-8l2-10H13l-10 5z" fill="currentColor"/><path d="M28 5h12M51 8h15" stroke="currentColor" stroke-width="2"/></symbol>
      <symbol id="hud-m4" viewBox="0 0 80 30"><path d="M2 13h15V9h17v3h20v2h22v3H54v2H41l2 9h-8l-4-10h-7l-4 9h-7l3-11H9l-7 5z" fill="currentColor"/><path d="M23 9V5h13v5M47 12V8h6v6M58 14V9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M40 13h11m-9 2h2m3 0h2" stroke="#15202b" stroke-width="1.5"/></symbol>
      <symbol id="hud-headshot" viewBox="0 0 24 24"><path d="M7 17C4 16 3 13 3 10a9 9 0 0 1 18 0c0 3-1 6-4 7v5H7z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 20h8m-5-3 1-2 1 2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 12h4v3H7zm8 0h4l-1 3h-3z" fill="currentColor"/><circle cx="12" cy="7" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 3v8M8 7h8" stroke="currentColor" stroke-width="1.1"/></symbol>
      <symbol id="hud-sniper" viewBox="0 0 80 30"><path d="M2 14h22l5-5h19v4h29v3H48l-5 5H27l-2 7h-6l1-9H10l-8 5z" fill="currentColor"/><path d="M28 5h20M33 5v5m10-5v5M58 16v11" stroke="currentColor" stroke-width="3"/></symbol>
      <symbol id="hud-pistol" viewBox="0 0 80 30"><path d="M17 4h48v9H42l-6 15H24l5-15H17z" fill="currentColor"/><path d="M39 13h9v7H36" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
      <symbol id="hud-frag" viewBox="0 0 24 24"><path d="M9 7V3h6v4m-6-2H5v5m4-3h6l4 6-1 7H6l-1-7z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 13h10m-9 4h8m-4-9v12" stroke="currentColor"/></symbol>
      <symbol id="hud-flash" viewBox="0 0 24 24"><path d="M8 5h8v16H8zM10 2h6v3m-7 4h6m-6 4h6m-6 4h6" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
      <symbol id="hud-smoke" viewBox="0 0 24 24"><path d="M8 10h9v11H8zM10 7h5M11 6C4 1 20 5 14 0" fill="none" stroke="currentColor" stroke-width="2"/></symbol>
      <symbol id="hud-defend" viewBox="0 0 24 24"><path d="M5 2v6h14V2h-4v3h-2V2h-2v3H9V2zm2 8-2 12h14l-2-12z" fill="currentColor"/></symbol>
      <symbol id="hud-attack" viewBox="0 0 24 24"><path d="m3 2 12 12m6-12L9 14M2 16l6 6m14-6-6 6M3 21 9 15m12 6-6-6" fill="none" stroke="currentColor" stroke-width="3"/></symbol>
      <symbol id="hud-standing" viewBox="0 0 24 30"><circle cx="12" cy="4" r="3" fill="currentColor"/><path d="M8 10h8l2 10h-4v9h-4v-9H6z" fill="currentColor"/></symbol>
      <symbol id="hud-crouching" viewBox="0 0 24 30"><circle cx="12" cy="6" r="3" fill="currentColor"/><path d="m10 11 7 3 5-1m-10-2-3 8 8 2 1 7M9 19l-5 8H1" fill="none" stroke="currentColor" stroke-width="4"/></symbol>
      <symbol id="hud-running" viewBox="0 0 24 30"><circle cx="15" cy="4" r="3" fill="currentColor"/><path d="m13 10-5 7 6 5-3 7m-3-12-4 9H0m13-16 4 7h6M12 10H7l-4 6" fill="none" stroke="currentColor" stroke-width="3"/></symbol>
    </defs>`;
    document.body.prepend(svg);
}
