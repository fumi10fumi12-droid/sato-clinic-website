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
  });
  const click=async selector=>{
    await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
    await delay(30);
  };
  const text=async selector=>evaluate('document.querySelector('+JSON.stringify(selector)+').textContent');
  const visible=async selector=>evaluate('!document.querySelector('+JSON.stringify(selector)+').hidden');
  for(const page of ['index.html','OPEN_SatoClinic.html']){
    await resize(1440);await navigate(page);
    await click('.booking-launch-manage');
    assert.equal(await text('#booking-title'),'予約変更・キャンセル');
    assert.equal(await evaluate('document.querySelectorAll(".booking-record").length'),0);
    await click('.booking-sample-create');
    const original=await text('.booking-record p');
    await click('.booking-record .booking-secondary');
    await click('[data-week="7"]');await click('.booking-slot');await click('.booking-next');
    assert.equal(await text('#booking-title'),'変更内容の確認');
    assert((await text('.booking-review')).includes('変更前'));
    await click('.booking-close');await click('.booking-launch-manage');
    assert.equal(await text('.booking-record p'),original,'Closing change without confirmation preserves booking');
    await click('.booking-record .booking-secondary');await click('[data-week="7"]');await click('.booking-slot');await click('.booking-next');await click('.booking-next');
    assert.notEqual(await text('.booking-record p'),original);
    assert((await text('.booking-management-message')).includes('変更操作が完了'));
    await click('.booking-record .booking-cancel');
    assert((await text('.booking-management-message')).includes('キャンセルしますか'));
    await click('.booking-record .booking-secondary');
    assert(!(await text('.booking-record h3')).includes('キャンセル済み'));
    await click('.booking-record .booking-cancel');await click('.booking-record .booking-cancel');
    assert((await text('.booking-record h3')).includes('キャンセル済み'));
    assert.equal(await evaluate('document.querySelectorAll(".booking-record button").length'),0);
    await click('.booking-close');
    assert(await evaluate('document.activeElement.classList.contains("booking-launch-manage")'));
    // New booking still validates patient information and creates a manageable sample.
    await evaluate('(()=>{const f=document.querySelector("form.reservation-preview");f.elements.department.value="オンライン診療";f.requestSubmit()})()');
    await click('.booking-slot');await click('.booking-next');
    await evaluate('(()=>{const f=document.querySelector(".booking-wizard");Object.entries({family_name:"試験",given_name:"太郎",family_kana:"シケン",given_kana:"タロウ",phone:"09012345678"}).forEach(([n,v])=>f.elements[n].value=v)})()');
    await click('.booking-next');await click('.booking-next');
    assert(await visible('.booking-finished'));
    await click('.booking-manage-finished');
    assert.equal(await evaluate('document.querySelectorAll(".booking-record").length'),2);
    assert(!(await text('.booking-management')).includes('試験'),'Patient names are not retained in management records');
    for(const width of [320,375,768,1440]){
      await resize(width);
      assert(await evaluate('(()=>{const d=document.querySelector(".booking-dialog");return d.scrollWidth<=d.clientWidth+1})()'),'Dialog fits '+width);
      assert(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),'Page fits '+width);
    }
    await click('.booking-close');
    assert(await evaluate('[...document.querySelectorAll(".booking-wizard input")].every(i=>!i.value)'),'Inputs cleared on close');
    await navigate(page);await click('.booking-launch-manage');
    assert.equal(await evaluate('document.querySelectorAll(".booking-record").length'),0,'Reload clears sample bookings');
    await click('.booking-close');
    console.log(page+': new booking, changes, abandoned changes, cancellation confirmation, cancel reversal, focus return, input clearing, reload and responsive layout passed');
  }
  for(const page of ['news.html','medical.html','about.html','hours.html','faq.html','sitemap.html','privacy.html','cookie-policy.html']){
    await navigate(page);await click('.booking-launch-manage');
    assert.equal(await text('#booking-title'),'予約変更・キャンセル');await click('.booking-close');
  }
  assert.deepEqual(errors,[]);
  console.log('Management entry points on all pages passed; no runtime errors.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(timeout);socket?.close();chrome.kill();});
