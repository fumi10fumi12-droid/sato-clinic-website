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
  const errors=[];
  await call('Runtime.enable');
  socket.addEventListener('message', event=>{
    const m=JSON.parse(event.data);
    if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error') errors.push('console.error');
  });
  const mouse=async(x,y)=>call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
  const point=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const hover=async selector=>{const p=await point(selector);await mouse(p.x,p.y);await delay(240);};
  const key=async key=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key});await call('Input.dispatchKeyEvent',{type:'keyUp',key});};
  const click=async selector=>{
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
    const p=await point(selector);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
    await delay(250);
  };
  const open=()=>evaluate(`document.querySelector('.nav-item.is-submenu-open .nav-parent > a')?.textContent || ''`);
  for(const file of ['index.html','news.html','medical.html','about.html','hours.html','faq.html','OPEN_SatoClinic.html']) {
    await resize(1440);await navigate(file);await mouse(1,850);
    const before=await evaluate(`document.querySelector('.page-main').getBoundingClientRect().top`);
    await hover('#nav-parent-3');assert.equal(await open(),'当院について',file+' hover opens');
    assert.equal(await evaluate(`document.querySelector('#mega-menu-3').inert`),false);
    assert.equal(await evaluate(`document.querySelector('.page-main').getBoundingClientRect().top`),before,file+' no layout shift');
    await hover('#mega-menu-3 .mega-links a');assert.equal(await open(),'当院について',file+' pointer enters panel');
    await hover('#nav-parent-2');assert.equal(await open(),'診療内容',file+' switch menus');
    await mouse(5,850);await delay(400);assert.equal(await open(),'',file+' leave closes');
    await hover('#nav-parent-3');await hover('#nav-parent-0');assert.equal(await open(),'',file+' top is a plain link');
    await key('Tab');await evaluate(`document.querySelector('#nav-parent-3').focus()`);
    assert.equal(await open(),'当院について',file+' keyboard focus opens');
    await key('ArrowDown');assert.equal(await evaluate(`document.activeElement.className`),'mega-overview');
    await key('Tab');assert.equal(await evaluate(`document.activeElement.closest('.mega-links')!==null`),true,file+' Tab enters detail links');
    await key('Escape');assert.equal(await open(),'',file+' Escape closes');
    assert.equal(await evaluate(`document.activeElement.getAttribute('aria-controls')`),'mega-menu-3');
    assert.equal(await evaluate(`document.querySelector('#mega-menu-3').inert`),true);
    await resize(900);await hover('#nav-parent-4');assert.equal(await open(),'診療時間・所在地',file+' tablet menu');
    await resize(375);await click('.menu-toggle');assert.equal(await evaluate(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')`),'true');
    await click('[aria-controls="mega-menu-3"]');assert.equal(await open(),'当院について',file+' mobile accordion opens');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#mega-menu-3')).position`),'static');
    assert.equal(await evaluate(`document.querySelector('#nav-parent-3').getAttribute('href')`),file==='OPEN_SatoClinic.html'?'#page-about':'about.html',file+' parent link retained');
    const width=await inspect();assert(width.scrollWidth<=width.width+1,file+' mobile no overflow');
    await click('[aria-controls="mega-menu-3"]');assert.equal(await open(),'',file+' mobile accordion closes');
    await click('[aria-controls="mega-menu-2"]');assert.equal(await open(),'診療内容');
    await key('Escape');assert.equal(await open(),'');
    await key('Escape');assert.equal(await evaluate(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')`),'false');
    console.log(file+': hover, pointer transfer, switching, no layout shift, keyboard, Escape, tablet and mobile passed');
  }
  await resize(1440);await navigate('index.html');await hover('#nav-parent-3');await screenshot('mega-desktop');
  await click('#mega-menu-3 a[href="about.html#about-director"]');
  await delay(800);
  assert.equal(await evaluate(`location.pathname.endsWith('/about.html') && location.hash==='#about-director'`),true,'real detail link navigation');
  assert.equal(await evaluate(`!!document.querySelector(location.hash)`),true);
  await resize(375);await navigate('index.html');await click('.menu-toggle');await click('[aria-controls="mega-menu-3"]');
  await screenshot('mega-mobile');
  await resize(1440);await navigate('OPEN_SatoClinic.html');await hover('#nav-parent-3');
  await click('#mega-menu-3 a[data-preview-target="about-director"]');await delay(700);
  assert.equal(await evaluate(`location.hash`),'#page-about');
  assert.equal(await evaluate(`document.querySelector('#about-director').getClientRects().length>0`),true,'preview target visible');
  assert.equal(await open(),'','preview closes after navigation');
  const anchor=await evaluate(`(()=>{const r=document.querySelector('#about-director').getBoundingClientRect();return {y:r.y,header:document.querySelector('.site-header').getBoundingClientRect().bottom};})()`);
  assert(anchor.y>=anchor.header-1,'anchor not hidden under header');
  for(const width of [320,767]) {
    await resize(width);await navigate('index.html');
    const tap=async selector=>{
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
      const p=await point(selector);
      await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:2,radiusY:2}]});
      await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(250);
    };
    await tap('.menu-toggle');await tap('[aria-controls="mega-menu-3"]');
    assert.equal(await open(),'当院について','actual touch opens at '+width);
    const layout=await inspect();assert(layout.scrollWidth<=layout.width+1,'touch layout fits '+width);
    await tap('[aria-controls="mega-menu-3"]');assert.equal(await open(),'','actual second tap closes');
  }
  await resize(1440);await navigate('index.html');await hover('#nav-parent-3');
  await mouse(1,850);await delay(50);await hover('#mega-menu-3 .mega-links a');
  assert.equal(await open(),'当院について','brief pointer gap does not flicker closed');
  assert.deepEqual(errors,[],'no JavaScript or console errors');
  console.log('Real local-file links and standalone-preview deep links passed. No JavaScript/console errors. Screenshots: '+output);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(timeout);socket?.close();chrome.kill();});
