import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

console.log('=== Mansoni Auth Premium Test ===\n');

await page.goto('http://localhost:8083/auth');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'test_auth_01_initial.png', fullPage: true });

// 1. Проверка элементов Brand Panel
console.log('1. Brand Panel:');
const logo = await page.$('img[alt=""]');
console.log('   - Logo (img):', logo ? '✅' : '❌');
const brandText = await page.$('text=/mansoni/i');
console.log('   - Brand text: ', brandText ? '✅' : '❌');

// 2. Проверка Phone Input
console.log('\n2. Phone Input:');
const phoneInput = await page.$('input[type="tel"]');
console.log('   - Phone input field:', phoneInput ? '✅' : '❌');

// 3. Проверка кнопки "Получить код"
console.log('\n3. Buttons:');
const getCodeBtn = await page.$('button:has-text("Получить код")');
console.log('   - "Получить код" button:', getCodeBtn ? '✅' : '❌');

// 4. Проверка темы (dark mode toggle)
const themeBtn = await page.$('[aria-label="Toggle theme"]');
console.log('   - Theme toggle:', themeBtn ? '✅' : '❌');

// 5. Проверка Auth Toggle (Вход/Регистрация)
console.log('\n4. Auth Toggle:');
const loginTab = await page.$('button:has-text("Вход")');
const registerTab = await page.$('button:has-text("Регистрация")');
console.log('   - "Вход" tab:', loginTab ? '✅' : '❌');
console.log('   - "Регистрация" tab:', registerTab ? '✅' : '❌');

// 6. Проверка QR код кнопки
const qrBtn = await page.$('button:has-text("QR")');
console.log('   - QR-код button:', qrBtn ? '✅' : '❌');

// 7. Desktop Showcase (Feature cards)
console.log('\n5. Desktop Showcase:');
const desktopShowcase = await page.$('text=/Мессенджер/i');
console.log('   - Feature "Мессенджер":', desktopShowcase ? '✅' : '❌');

// 8. Включаю регистрацию
console.log('\n6. Switch to Registration:');
if (registerTab) {
  await registerTab.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test_auth_02_register.png', fullPage: true });
  const registerForm = await page.$('text=/Создать аккаунт/i');
  console.log('   - Registration form:', registerForm ? '✅' : '❌');
}

// 9. Проверка полей формы регистрации
console.log('\n7. Registration Form Fields:');
const firstNameInput = await page.$('input[id="firstName"]');
const lastNameInput = await page.$('input[id="lastName"]');
const emailInput = await page.$('input[id="email"]');
console.log('   - First Name:', firstNameInput ? '✅' : '❌');
console.log('   - Last Name:', lastNameInput ? '✅' : '❌');
console.log('   - Email:', emailInput ? '✅' : '❌');

// 10. Проверка социальных кнопок
console.log('\n8. Social Login Buttons:');
const googleBtn = await page.$('button:has-text("Google")');
const telegramBtn = await page.$('button:has-text("Telegram")');
const appleBtn = await page.$('button:has-text("iCloud")');
console.log('   - Google:', googleBtn ? '✅' : '❌');
console.log('   - Telegram:', telegramBtn ? '✅' : '❌');
console.log('   - iCloud:', appleBtn ? '✅' : '❌');

// 11. Проверка Wave Background
const waveBackground = await page.$('svg');
console.log('\n9. Wave Background SVG:', waveBackground ? '✅' : '❌');

// 12. Проверка Trust Badge
const trustBadge = await page.$('text=/Защита данных/i');
console.log('   - Trust Badge:', trustBadge ? '✅' : '❌');

console.log('\n=== Test Complete ===');
console.log('Screenshots: test_auth_01_initial.png, test_auth_02_register.png');

await browser.close();
