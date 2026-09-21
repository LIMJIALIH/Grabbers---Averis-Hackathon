// Set PLAYWRIGHT_MODULE to a Playwright installation when it is not installed locally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    let user = null;
    let expires = Date.now() / 1000 + 3600;
    let failLogout = false;
    let logoutCount = 0;
    await context.route('**/api/v1/auth/me', route => route.fulfill({ json: { user, configured: true, expires_at: user ? expires : null } }));
    await context.route('**/api/v1/cases', route => route.fulfill({ json: [] }));
    await context.route('**/api/v1/auth/logout', route => {
      logoutCount++;
      if (failLogout) return route.fulfill({ status: 503, json: {} });
      user = null;
      return route.fulfill({ json: { ok: true } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/audit');
    await page.waitForURL('**/login?next=*');
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Continue with Google', exact: true }).isEnabled(), true);
    await context.route('**/api/v1/auth/google/login?*', route => {
      assert.equal(new URL(route.request().url()).searchParams.get('next'), '/audit');
      user = { sub: 'alice', email: 'alice@example.test', name: 'Alice Example', picture: null };
      return route.fulfill({ status: 302, headers: { location: origin + '/audit' } });
    });
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await page.waitForURL(origin + '/audit');
    await page.getByRole('button', { name: 'Account', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: 'Account', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.values(localStorage).some(v => /alice|access_token/.test(v))), false);
    const other = await context.newPage();
    await other.goto(origin + '/');
    await other.getByRole('button', { name: 'Account', exact: true }).waitFor();
    failLogout = true;
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Retry sign out', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Account', exact: true }).count(), 0);
    failLogout = false;
    await page.getByRole('button', { name: 'Retry sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
    await other.waitForURL('**/login?next=*');
    assert.equal(logoutCount, 2);
    user = { sub: 'alice', email: 'alice@example.test', name: 'Alice Example', picture: null };
    expires = Date.now() / 1000 + 3;
    await page.goto(origin + '/');
    await page.getByRole('button', { name: 'Account', exact: true }).waitFor();
    await page.waitForURL('**/login?next=*');
    user = null;
    await page.goto(origin + '/login?next=%2F%2Fevil.test');
    await page.getByRole('button', { name: 'Continue with demo mailbox', exact: true }).click();
    await page.waitForURL(origin + '/');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('docuverify-session')), 'sample');
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('docuverify-session')), null);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log('PASS: login, return path, reload, logout retry, cross-tab logout, expiry, demo isolation, redirect safety, mobile layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
