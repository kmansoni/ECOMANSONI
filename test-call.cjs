const { chromium } = require('playwright');

(async () => {
  const opts = {
    headless: true,
    args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--no-sandbox','--disable-setuid-sandbox','--disable-web-security']
  };

  const [browser1, browser2] = await Promise.all([chromium.launch(opts), chromium.launch(opts)]);
  const ctx1 = await browser1.newContext({ permissions: ['camera','microphone'] });
  const ctx2 = await browser2.newContext({ permissions: ['camera','microphone'] });
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  const errors1=[], errors2=[], calls1=[], calls2=[];

  page1.on('console', msg => {
    const t = msg.text();
    if (msg.type()==='error') errors1.push(t);
    if (/VideoCall|SFU|calls-v2|CONSUMER|TRANSPORT|ACK|bootstrap|mediasoup|E2EE|worker/i.test(t)) calls1.push('['+msg.type()+'] '+t);
  });
  page2.on('console', msg => {
    const t = msg.text();
    if (msg.type()==='error') errors2.push(t);
    if (/VideoCall|SFU|calls-v2|CONSUMER|TRANSPORT|ACK|bootstrap|mediasoup|E2EE|worker/i.test(t)) calls2.push('['+msg.type()+'] '+t);
  });
  page1.on('pageerror', e => errors1.push('PAGE: '+e.message));
  page2.on('pageerror', e => errors2.push('PAGE: '+e.message));

  console.log('Loading mansoni.ru...');
  await Promise.all([
    page1.goto('https://mansoni.ru', {waitUntil:'domcontentloaded', timeout:30000}),
    page2.goto('https://mansoni.ru', {waitUntil:'domcontentloaded', timeout:30000}),
  ]);

  await page1.screenshot({path:'/tmp/b1.png'});
  await page2.screenshot({path:'/tmp/b2.png'});
  console.log('Loaded. Waiting 8s for errors...');
  await page1.waitForTimeout(8000);

  console.log('\n=== ERRORS B1 ==='); errors1.forEach(e=>console.log(e));
  console.log('\n=== ERRORS B2 ==='); errors2.forEach(e=>console.log(e));
  console.log('\n=== CALL LOGS B1 ==='); calls1.slice(0,20).forEach(e=>console.log(e));
  console.log('\n=== CALL LOGS B2 ==='); calls2.slice(0,20).forEach(e=>console.log(e));

  await browser1.close();
  await browser2.close();
})();
