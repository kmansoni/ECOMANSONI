const { chromium } = require('playwright');

const accounts = [
  { email: 'test1@mansoni.test', password: 'TestPass123!' },
  { email: 'test2@mansoni.test', password: 'TestPass123!' },
];

const opts = {
  headless: false,
  slowMo: 200,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=900,700',
  ]
};

async function loginViaUI(page, email, password, label) {
  console.log(`[${label}] Открываю /auth...`);
  await page.goto('https://mansoni.ru/auth', {waitUntil:'domcontentloaded', timeout:30000});
  await page.waitForTimeout(2000);
  
  // Скриншот чтобы видеть форму
  await page.screenshot({path: `/tmp/auth-${label}.png`});
  
  // Найдём все input
  const inputs = await page.locator('input').all();
  console.log(`[${label}] Найдено input: ${inputs.length}`);
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    const name = await inputs[i].getAttribute('name');
    console.log(`  input[${i}]: type=${type} name=${name} placeholder=${placeholder}`);
  }
  
  // Попробуем заполнить первые два input
  if (inputs.length >= 2) {
    await inputs[0].fill(email);
    await inputs[1].fill(password);
    
    // Ищем кнопку входа
    const buttons = await page.locator('button').all();
    console.log(`[${label}] Найдено кнопок: ${buttons.length}`);
    for (let i = 0; i < buttons.length; i++) {
      const text = await buttons[i].textContent();
      console.log(`  button[${i}]: "${text?.trim()}"`);
    }
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4000);
    console.log(`[${label}] URL после входа: ${page.url()}`);
    await page.screenshot({path: `/tmp/after-login-${label}.png`});
  }
}

(async () => {
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
    if (msg.type()==='error' && !t.includes('path')) errors1.push(t);
    if (/VideoCall|SFU|calls-v2|CONSUMER|TRANSPORT|ACK|bootstrap|E2EE|worker/i.test(t)) calls1.push('['+msg.type()+'] '+t);
  });
  page2.on('console', msg => {
    const t = msg.text();
    if (msg.type()==='error' && !t.includes('path')) errors2.push(t);
    if (/VideoCall|SFU|calls-v2|CONSUMER|TRANSPORT|ACK|bootstrap|E2EE|worker/i.test(t)) calls2.push('['+msg.type()+'] '+t);
  });

  await loginViaUI(page1, accounts[0].email, accounts[0].password, 'B1');
  await loginViaUI(page2, accounts[1].email, accounts[1].password, 'B2');

  console.log('\nОба браузера открыты. Жду 3 минуты...');
  await page1.waitForTimeout(180000);

  console.log('\n=== ОШИБКИ Б1 ==='); errors1.forEach(e=>console.log(e));
  console.log('\n=== ОШИБКИ Б2 ==='); errors2.forEach(e=>console.log(e));
  console.log('\n=== ЛОГИ ЗВОНКОВ Б1 ==='); calls1.slice(0,50).forEach(e=>console.log(e));
  console.log('\n=== ЛОГИ ЗВОНКОВ Б2 ==='); calls2.slice(0,50).forEach(e=>console.log(e));

  await browser1.close();
  await browser2.close();
})();
