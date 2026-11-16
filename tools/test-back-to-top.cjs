// Local Chrome checks. Screenshots and JSON results are written outside the site.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'sato-responsive-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${output}/chrome`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank',
], {stdio:['ignore','ignore','pipe']});
let socket;
let seq = 0;
const pending = new Map();
const results = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const started = new Promise((resolve, reject) => {
  let log = '';
  chrome.stderr.on('data', chunk => {
    log += chunk;
    const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) resolve(match[1]);
  });
  chrome.on('error', reject);
  chrome.on('exit', code => reject(new Error(`Chrome exited: ${code}; ${log.slice(-1000)}`)));
});
const timeout = setTimeout(() => { console.error('Responsive check timed out'); chrome.kill(); process.exit(1); }, 180000);
async function main() {
  socket = new WebSocket(await started);
  await new Promise((resolve,reject) => {socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(JSON.stringify(message.error)));
    else task.resolve(message.result);
  };
  const send = (method, params={}, sessionId) => new Promise((resolve,reject) => {
    const id = ++seq;
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}));
  });
  const {targetId} = await send('Target.createTarget',{url:'about:blank'});
  const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
  const call = (method,params) => send(method,params,sessionId);
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await call('Page.enable');
  await call('Network.enable');
  // Layout checks run offline; external fonts and map availability are not asserted.
  await call('Network.setBlockedURLs',{urls:['https://*','http://*']});
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const resize = async (width,height=900) => {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width <= 767});
    await call('Emulation.setTouchEmulationEnabled',{enabled:width <= 767});
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  };
  const navigate = async page => {
    await call('Page.navigate',{url:`file://${root}/${page}`});
    for(let i=0;i<100;i++) {
      if(await evaluate('document.readyState === "complete"')) break;
      await delay(30);
    }
    await delay(60);
  };
  const screenshot = async name => {
    const {data} = await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(output,`${name}.png`),Buffer.from(data,'base64'));
  };
  const inspect = () => evaluate(`(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= width + 1) return false;
      // Tables may scroll within their accessible container.
      if (el.closest('.schedule-table-scroll,.booking-table-scroll')) return false;
      return true;
    }).map(el => el.tagName + '.' + el.className).slice(0,8);
    const tableOverflow = innerWidth > 767 ? [] : [...document.querySelectorAll('.hours-table')].filter(table => {
      if (!table.getClientRects().length) return false;
      return table.scrollWidth > table.clientWidth + 1 || table.parentElement.scrollWidth > table.parentElement.clientWidth + 1;
    }).map(table => table.className);
    return {width,scrollWidth:document.documentElement.scrollWidth,offenders,tableOverflow};
  })()`);
  const clickToTop = async () => {
    await evaluate(`window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'})`);
    await delay(80);
    assert(await evaluate('scrollY > 100'),'Page is scrolled before clicking');
    const originalHash=await evaluate('location.hash');
    const point=await evaluate(`(()=>{const r=document.querySelector('.back-to-top').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    for(let i=0;i<80;i++){if(await evaluate('scrollY===0'))break;await delay(50);}
    assert.equal(await evaluate('scrollY'),0,'Button reaches absolute page top');
    assert.equal(await evaluate('location.hash'),originalHash,'Button preserves current preview page/deep link');
  };
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  const pages=['index.html','news.html','medical.html','about.html','hours.html','faq.html','sitemap.html'];
  for(const file of pages){
    await navigate(file);
    for(const width of [375,1440]){await resize(width);await clickToTop();}
    console.log(file+': smooth back-to-top reaches scrollY=0 on mobile and desktop');
  }
  await navigate('OPEN_SatoClinic.html');
  for(const name of ['home','news','medical','about','hours','faq','sitemap']){
    await evaluate(`location.hash='page-${name}'`);await delay(100);await clickToTop();
    assert.equal(await evaluate(`document.querySelector('#page-${name}').getClientRects().length>0`),true);
  }
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await clickToTop();
  console.log('All seven standalone-preview pages keep their selected page and reach scrollY=0; reduced-motion mode passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timeout);socket?.close();chrome.kill();});