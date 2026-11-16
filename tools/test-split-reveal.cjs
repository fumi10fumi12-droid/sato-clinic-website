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
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push('console.error');
  });
  const status=()=>evaluate(`document.querySelector('.home-faq-slider .clinical-slider-status').textContent`);
  const choose=async index=>evaluate(`document.querySelectorAll('.home-faq-slider .clinical-slider-dots button')[${index}].click()`);
  const arrow=async direction=>evaluate(`document.querySelector('.home-faq-slider [data-slide="${direction}"]').click()`);
  const settle=async expected=>{
    for(let i=0;i<60;i++){
      if(await evaluate(`document.querySelector('.home-faq-slider .clinical-slider-status').textContent===${JSON.stringify(expected)} && !document.querySelector('.home-faq-slider').classList.contains('is-revealing')`))return;
      await delay(30);
    }
    assert.fail('Reveal did not settle on '+expected);
  };
  for(const file of ['index.html','OPEN_SatoClinic.html']){
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    await resize(1440);await navigate(file);
    await evaluate(`document.querySelector('.home-faq-slider').scrollIntoView({block:'center',behavior:'instant'})`);
    await evaluate(`Promise.all([...document.querySelectorAll('.home-faq-slider figure img')].map(img=>{img.loading='eager';return img.decode();}))`);
    assert.equal(await evaluate(`document.querySelectorAll('.home-faq-slider .clinical-slider-dots button').length`),5);
    await arrow('next');await delay(120);
    assert.equal(await status(),'2 / 5');
    const frame=await evaluate(`(()=>{const s=document.querySelector('.home-faq-slider'),t=s.querySelector('.clinical-slider-track');return {revealing:s.classList.contains('is-revealing'),shutters:[...t.querySelectorAll('.faq-fade-overlay')].map(e=>({opacity:Number(getComputedStyle(e).opacity),transform:getComputedStyle(e).transform,hidden:e.getAttribute('aria-hidden')})),scroll:t.scrollLeft,active:t.querySelectorAll('figure.is-active').length};})()`);
    assert.equal(frame.revealing,true);assert.equal(frame.shutters.length,1);
    assert(frame.shutters[0].opacity>0&&frame.shutters[0].opacity<1,'Outgoing image fades out');
    assert(frame.shutters.every(s=>s.transform==='none'&&s.hidden==='true'));
    assert.equal(frame.scroll,0,'No horizontal slide movement');assert.equal(frame.active,1);
    if(file==='index.html')await screenshot('fade-out-in-motion');
    await settle('2 / 5');
    assert.equal(await evaluate(`document.querySelectorAll('.home-faq-slider .faq-fade-overlay').length`),0);
    await evaluate(`(()=>{const b=document.querySelector('.home-faq-slider [data-slide="next"]');b.click();b.click();b.click();})()`);
    await settle('5 / 5');
    await arrow('next');await settle('1 / 5');
    await arrow('previous');await settle('5 / 5');
    await choose(1);await settle('2 / 5');
    await arrow('next');await delay(90);await arrow('next');await settle('4 / 5');

    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    for(const width of [375,768,1440]){
      await resize(width);await evaluate(`document.querySelector('.home-faq-slider').scrollIntoView({block:'center',behavior:'instant'})`);await delay(80);
      for(let i=0;i<5;i++){await choose(i);await settle((i+1)+' / 5');}
      assert.equal(await evaluate(`document.querySelectorAll('.home-faq-slider .faq-fade-overlay').length`),0,'Reduced-motion mode avoids animation');
      await evaluate(`document.querySelector('#home-smile-slider-track').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);await settle('1 / 5');
      await evaluate(`document.querySelector('#home-smile-slider-track').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);await settle('2 / 5');
      await evaluate(`document.querySelector('#home-smile-slider-track').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`);await settle('5 / 5');
      await choose(0);await settle('1 / 5');
      if(width===375){
        const point=await evaluate(`(()=>{const r=document.querySelector('#home-smile-slider-track').getBoundingClientRect();return {x:r.right-30,y:r.top+r.height/2};})()`);
        await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        for(let step=1;step<=8;step++){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-step*28,y:point.y}]});await delay(25);}
        await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle('2 / 5');
      }
      const layout=await inspect();assert(layout.scrollWidth<=layout.width+1,file+' fits '+width);
    }
    console.log(file+': fade opacity, animation cleanup, rapid clicks, wraparound, five photos, keyboard, swipe and reduced-motion behavior passed');
  }
  for(const [file,slider,count]of [['medical.html','.clinical-slider',6],['about.html','.interior-slider',3]]){
    await resize(1440);await navigate(file);await evaluate(`document.querySelector('${slider}').scrollIntoView({block:'center',behavior:'instant'})`);await delay(650);
    await evaluate(`document.querySelector('${slider} [data-slide="next"]').click()`);await delay(300);
    assert.equal(await evaluate(`document.querySelector('${slider} .clinical-slider-status').textContent`),'2 / '+count);
  }
  assert.deepEqual(errors,[],'No JavaScript or console errors');
  console.log('Existing medical/interior sliders still work. Screenshot: '+output+'/fade-out-in-motion.png');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timeout);socket?.close();chrome.kill();});
