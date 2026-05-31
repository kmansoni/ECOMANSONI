const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const opts = {
    headless: false,
    slowMo: 500,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=900,700',
    ]
  };

  const [browser1, browser2] = await Promise.all([
    chromium.launch({...opts, args: [...opts.args, '--window-position=0,0']}),
    chromium.launch({...opts, args: [...opts.args, '--window-position=920,0']}),
  ]);

  const ctx1 = await browser1.newContext({ permissions: ['camera','microphone'] });
  const ctx2 = await browser2.newContext({ permissions: ['camera','microphone'] });
  const page1 = await ctx1.newPage();
  const page2 = await ctx2.newPage();

  const errors1=[], errors2=[], calls1=[], calls2=[];
  page1.on('console', msg => {
    const t = msg.text();
    if (msg.type()==='error') errors1.push(t);
    if (/VideoCall|SFU|calls-v2|CONSUMER|TRANSPORT|ACK|bootstrap|E2EE|worker/i.test(t)) calls1.push('['+msg.type()+'] '+t);
  });
  page2.on('console', msg => {
    const t = msg.text();
    if (msg.type()==='error') errors2.push(t);
    if (/VideoCall|SFU|calls-v2|CONSUMER|TRANSPORT|ACK|bootstrap|E2EE|worker/i.test(t)) calls2.push('['+msg.type()+'] '+t);
  });

  console.log('Открываю mansoni.ru в двух браузерах...');
  await Promise.all([
    page1.goto('https://mansoni.ru', {waitUntil:'domcontentloaded', timeout:30000}),
    page2.goto('https://mansoni.ru', {waitUntil:'domcontentloaded', timeout:30000}),
  ]);
  console.log('Страницы загружены. Жду 60 секунд для ручного входа...');
  console.log('Войди в браузер 1 (левый) и браузер 2 (правый), затем сделай звонок.');

  await page1.waitForTimeout(60000);

  console.log('\n=== ОШИБКИ Браузер 1 ===');
  errors1.forEach(e=>console.log(e));
  console.log('\n=== ОШИБКИ Браузер 2 ===');
  errors2.forEach(e=>console.log(e));
  console.log('\n=== ЛОГИ ЗВОНКОВ Браузер 1 ===');
  calls1.slice(0,30).forEach(e=>console.log(e));
  console.log('\n=== ЛОГИ ЗВОНКОВ Браузер 2 ===');
  calls2.slice(0,30).forEach(e=>console.log(e));

  console.log('\nЖду ещё 120 секунд...');
  await page1.waitForTimeout(120000);

  console.log('\n=== ФИНАЛЬНЫЕ ОШИБКИ Браузер 1 ===');
  errors1.forEach(e=>console.log(e));
  console.log('\n=== ФИНАЛЬНЫЕ ОШИБКИ Браузер 2 ===');
  errors2.forEach(e=>console.log(e));
  console.log('\n=== ФИНАЛЬНЫЕ ЛОГИ ЗВОНКОВ Браузер 1 ===');
  calls1.slice(0,50).forEach(e=>console.log(e));
  console.log('\n=== ФИНАЛЬНЫЕ ЛОГИ ЗВОНКОВ Браузер 2 ===');
  calls2.slice(0,50).forEach(e=>console.log(e));

  await browser1.close();
  await browser2.close();
})();
