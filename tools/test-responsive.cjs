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
  const pages = ['index.html','news.html','medical.html','about.html','hours.html','faq.html','OPEN_SatoClinic.html'];
  for(const page of pages) {
    await resize(1440);
    await navigate(page);
    for(const width of [320,375,390,430,600,767,768,900,1024,1100,1101,1280,1440,1920]) {
      await resize(width);
      await delay(30);
      const result = await inspect();
      results.push({page,...result});
      if (page === 'index.html' || page === 'OPEN_SatoClinic.html') {
        const heroBottom = await evaluate(`document.querySelector('.hero').getBoundingClientRect().bottom + scrollY`);
        assert(Math.abs(heroBottom - 900) < 2, page + ' at ' + width + 'px: hero bottom ' + heroBottom);
        const footerOrder = await evaluate(`(() => {
          const footer = document.querySelector('.clinic-columns--access-first');
          return ['.clinic-access-details','.clinic-access','.clinic-hours','.clinic-right'].map(selector => {
            const r=footer.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y};
          });
        })()`);
        if(width >= 1101) {
          assert(Math.abs(footerOrder[0].y-footerOrder[1].y)<1,'Address and map must align at the top');
          assert(footerOrder[0].x<footerOrder[1].x,'Address must be to the left of the map');
          assert(footerOrder[2].y>footerOrder[0].y,'Hours must appear below the access information');
        } else {
          assert(footerOrder.every((item,index) => index === 0 || item.y>footerOrder[index-1].y),'Mobile footer must follow the reading order');
        }
      }
      if ([320,768,1440].includes(width)) {
        const spacingErrors = await evaluate(`(() => {
          const errors = [];
          const check = (nodes) => {
            const visible = [...nodes].filter(el => el.getClientRects().length);
            for(let i=1;i<visible.length;i++) {
              const before = visible[i-1].getBoundingClientRect();
              const after = visible[i].getBoundingClientRect();
              const gap = after.top - before.bottom;
              const previous = visible[i-1];
              const baseGap = previous.matches('.hero') || visible[i].matches('.home-greeting') ? 100 : previous.matches('.faq-item') ? 18 : visible[i].matches('.home-medical,.home-about,.home-staff,.clinical-gallery') || previous.matches('.news-article,.medical-intro,.medical-entry,.about-block,.staff-card,.faq-content') ? 80 : 160;
              const expectedGap = baseGap * Number(getComputedStyle(document.body).zoom || 1);
              if(Math.abs(gap - expectedGap) > 1) errors.push({before:visible[i-1].className,after:visible[i].className,gap});
            }
          };
          document.querySelectorAll('.page-main').forEach(main => check(main.querySelectorAll(':scope > :is(.hero,.home-overview,.home-stack,.page-content,.photo-gallery,.staff-section,.clinic-footer)')));
          document.querySelectorAll('.news-content,.medical-content,.about-content').forEach(container => check(container.children));
          document.querySelectorAll('.home-medical,.home-staff,.staff-section,.faq-group').forEach(container => check(container.querySelectorAll(':scope > :is(.medical-entry,.staff-card,.faq-item)')));
          return errors;
        })()`);
        assert.deepEqual(spacingErrors,[],page + ' at ' + width + 'px: ' + JSON.stringify(spacingErrors));
      }
      if(result.scrollWidth > result.width + 1) console.error('OVERFLOW',page,width,result);
      if((page === 'index.html' && [320,375,390,430,768,1440].includes(width)) || (page !== 'index.html' && width === 390)) await screenshot(`${page}-${width}`);
    }
    await evaluate(`document.querySelector('[data-text-size="large"]').click()`);
    for (const width of [320,390,768,1024,1440]) {
      await resize(width);
      await delay(30);
      results.push({page,largeText:true,...await inspect()});
    }
    await evaluate(`document.querySelector('[data-text-size="standard"]').click()`);
    await resize(767,375);
    results.push({page,landscape:true,...await inspect()});
  }
  await resize(375);
  await navigate('index.html');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.global-nav')).display`),'none');
  await evaluate(`document.querySelector('.menu-toggle').click()`);
  assert.equal(await evaluate(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')`),'true');
  results.push({page:'menu-open',...await inspect()});
  await screenshot('menu-375');
  await evaluate(`document.querySelector('.menu-toggle').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')`),'false');
  await evaluate(`document.querySelector('.home-services select').selectedIndex=1;document.querySelector('.home-services form').requestSubmit()`);
  assert.equal(await evaluate(`!!document.querySelector('dialog[open]')`),true);
  results.push({page:'booking-open',...await inspect()});
  await screenshot('booking-375');
  await evaluate(`document.querySelector('.booking-close').click()`);
  for(const width of [320,375,390,430]) {
    await resize(width);
    await evaluate(`document.querySelector('.home-services').scrollIntoView()`);
    await delay(100);
    await screenshot(`schedule-${width}`);
  }
  await resize(375);
  for(const [selector,name] of [['.home-medical','medical'],['.home-staff','staff'],['.clinic-footer','footer']]) {
    await evaluate(`document.querySelector('${selector}').scrollIntoView()`);
    await delay(100);
    await screenshot(`${name}-375`);
  }
  await resize(1440);
  await evaluate(`document.querySelector('.clinic-footer').scrollIntoView()`);
  await delay(100);
  const footerClip = await evaluate(`(() => {const r=document.querySelector('.clinic-footer').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
  const footerImage = await call('Page.captureScreenshot',{format:'png',clip:footerClip,captureBeyondViewport:true});
  fs.writeFileSync(path.join(output,'home-footer-1440.png'),Buffer.from(footerImage.data,'base64'));
  await navigate('medical.html');
  for (const width of [1440,390]) {
    await resize(width);
    for (const number of [3,4,6,7]) {
      const selector = '.medical-photo-frame--' + number;
      await evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center'})`);
      await delay(100);
      const clip = await evaluate(`(() => {const r=document.querySelector('${selector}').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
      const {data} = await call('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
      fs.writeFileSync(path.join(output,`medical-photo-${number}-${width}.png`),Buffer.from(data,'base64'));
    }
  }
  await resize(375);
  for (const width of [1440,390]) {
    await resize(width);
    await navigate('medical.html');
    await evaluate(`document.querySelector('.clinical-slider').scrollIntoView({block:'center'})`);
    const status = () => evaluate(`document.querySelector('.clinical-slider-status').textContent`);
    assert.equal(await evaluate(`document.querySelectorAll('.clinical-slider-track figure').length`),6);
    await evaluate(`document.querySelector('[data-slide="next"]').click()`);
    await delay(200);
    assert.equal(await status(),'2 / 6');
    await evaluate(`document.querySelector('[data-slide="previous"]').click()`);
    await delay(200);
    assert.equal(await status(),'1 / 6');
    await evaluate(`document.querySelector('.clinical-slider-dots').lastElementChild.click()`);
    await delay(200);
    assert.equal(await status(),'6 / 6');
    await evaluate(`document.querySelector('[data-slide="next"]').click()`);
    await delay(200);
    assert.equal(await status(),'1 / 6');
    await evaluate(`document.querySelector('.clinical-slider-track').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
    await delay(200);
    assert.equal(await status(),'2 / 6');
    await evaluate(`document.querySelector('.clinical-slider-track').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
    await delay(200);
    assert.equal(await status(),'1 / 6');
    if (width === 390) {
      const point = await evaluate(`(() => {const r=document.querySelector('.clinical-slider-track').getBoundingClientRect();return {x:r.right-40,y:r.top+r.height/2};})()`);
      await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      for(let step=1;step<=8;step++) {
        await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x-step*30,y:point.y}]});
        await delay(25);
      }
      await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await delay(1000);
      await screenshot('clinical-slider-swipe');
      assert.notEqual(await status(),'1 / 6','Touch swipe should advance the gallery');
    }
    await screenshot('clinical-slider-' + width);
    for(let index=0;index<6;index++) {
      await evaluate(`document.querySelector('.clinical-slider-dots').children[${index}].click()`);
      await delay(300);
      assert.equal(await status(),(index+1)+' / 6');
      await screenshot('clinical-crop-'+(index+1)+'-'+width);
    }
    results.push({page:'clinical-slider-'+width,...await inspect()});
  }
  for (const width of [1440,390]) {
    await resize(width);
    await navigate('about.html');
    await evaluate(`document.querySelector('.interior-slider').scrollIntoView({block:'center'})`);
    assert.equal(await evaluate(`document.querySelectorAll('#interior-slider-track figure').length`),3);
    await evaluate(`document.querySelector('.interior-slider [data-slide="next"]').click()`);
    await delay(200);
    assert.equal(await evaluate(`document.querySelector('.interior-slider .clinical-slider-status').textContent`),'2 / 3');
    await evaluate(`document.querySelector('.interior-slider .clinical-slider-dots').lastElementChild.click()`);
    await delay(200);
    assert.equal(await evaluate(`document.querySelector('.interior-slider .clinical-slider-status').textContent`),'3 / 3');
    await evaluate(`document.querySelector('.interior-slider [data-slide="next"]').click()`);
    await delay(200);
    assert.equal(await evaluate(`document.querySelector('.interior-slider .clinical-slider-status').textContent`),'1 / 3');
    await screenshot('interior-slider-' + width);
    results.push({page:'interior-slider-'+width,...await inspect()});
  }
  await resize(375);
  await navigate('about.html');
  await evaluate(`document.querySelectorAll('.about-block')[4].scrollIntoView()`);
  await screenshot('about-policy-375');
  await navigate('faq.html');
  await evaluate(`document.querySelector('.faq-item summary').click()`);
  assert.equal(await evaluate(`document.querySelector('.faq-item').open`),true);
  await screenshot('faq-375');
  await navigate('OPEN_SatoClinic.html');
  for (const name of ['news','medical','about','hours','faq']) {
    await evaluate(`location.hash='page-${name}'`);
    await delay(50);
    assert.equal(await evaluate(`getComputedStyle(document.getElementById('page-${name}')).display !== 'none'`),true);
    results.push({page:`preview-${name}`,...await inspect()});
  }
  await evaluate(`location.hash='page-about'`);
  await delay(100);
  await evaluate(`document.querySelector('.interior-slider [data-slide="next"]').click()`);
  await delay(200);
  assert.equal(await evaluate(`document.querySelector('.interior-slider .clinical-slider-status').textContent`),'2 / 3');
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  const failures = results.filter(item => item.scrollWidth > item.width + 1 || item.tableOverflow.length);
  assert.equal(failures.length,0,JSON.stringify(failures));
  console.log(`Passed ${results.length} layout checks, mobile menu, booking dialog and FAQ. Screenshots: ${output}`);
}
main().catch(error => {console.error(error);process.exitCode=1;}).finally(() => {clearTimeout(timeout);socket?.close();chrome.kill();});
