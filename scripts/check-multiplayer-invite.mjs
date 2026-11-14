import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();
 await page.route('**/src/multiplayer/NetworkSession.js*',route=>route.fulfill({contentType:'application/javascript',body:`export class NetworkSession{constructor(){this.remotes=new Map();this.ping=0;}async connect(){this.code='ABC2345';this.connected=true;await this.onReady();}}`}));
 await page.route('**/invite-check*',route=>route.fulfill({contentType:'text/html',body:'<div id="hud"></div><div class="map-brief"></div><button id="btn-play"></button>'}));
 await page.goto('http://127.0.0.1:5181/invite-check?multiplayer=1');
 await page.evaluate(async()=>{
  const {multiplayerMenu}=await import('/src/multiplayer/MultiplayerMenu.js');
  multiplayerMenu({mapId:'villa',graphicsReady:Promise.resolve(),btnPlay:document.querySelector('#btn-play'),poseInspector:{button:{}},idleComparison:{panel:{style:{}}},tripoPlayer:{button:{}}},{});
 });
 await page.locator('#mp-create').click();
 await page.locator('#mp-copy').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.querySelector('#mp-copy').disabled);
 const invite=await page.locator('#mp-invite').inputValue();
 assert.match(invite,/^http:\/\/192\.168\.100\.25:2567\//);
 assert.equal(new URL(invite).searchParams.get('room'),'ABC2345');
 await page.locator('#mp-copy').click();
 await page.waitForFunction(()=>document.querySelector('#mp-status').textContent.startsWith('Invite link copied'));
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),invite);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
 await page.locator('#mp-copy').click();
 await page.waitForFunction(()=>document.querySelector('#mp-status').textContent.includes('Ctrl+C'));
 assert.deepEqual(await page.locator('#mp-invite').evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,invite.length]);
 console.log(JSON.stringify({invite,clipboard:'passed',manualFallback:'passed',realRoomTouched:false}));
}finally{await browser.close();}
