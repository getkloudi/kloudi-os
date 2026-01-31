import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = join(__dirname, '..', '..', '..');
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3001';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();

  try {
    // ── Workflow 1: Sidebar navigation ──────────────────────────
    console.log('▶ Workflow 1: Sidebar navigation');
    await page.goto(WEB_URL);
    await page.waitForTimeout(2000);

    for (const item of [
      'Code Review Patterns',
      'TypeScript Best Practices',
      'API Design Guidelines',
    ]) {
      await page.getByRole('button', { name: item }).click();
      await page.waitForTimeout(1500);
      console.log(`  ✓ ${item}`);
    }

    // ── Workflow 2: Skills section ──────────────────────────────
    console.log('▶ Workflow 2: Skills section');
    for (const item of ['Create React Component', 'Write Unit Tests']) {
      await page.getByRole('button', { name: item }).click();
      await page.waitForTimeout(1500);
      console.log(`  ✓ ${item}`);
    }

    // ── Workflow 3: Projects section ────────────────────────────
    console.log('▶ Workflow 3: Projects section');
    for (const item of ['Scaffold Electron App', 'Build Session Inbox UI']) {
      await page.getByRole('button', { name: item }).click();
      await page.waitForTimeout(1500);
      console.log(`  ✓ ${item}`);
    }

    // ── Workflow 4: Search (⌘K) ─────────────────────────────────
    console.log('▶ Workflow 4: Search omnibox');
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(1000);

    const searchInput = page.getByPlaceholder('Search procedures...');
    await searchInput.fill('api');
    await page.waitForTimeout(1500);
    console.log('  ✓ Search "api"');

    await searchInput.fill('typescript');
    await page.waitForTimeout(1500);
    console.log('  ✓ Search "typescript"');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    console.log('  ✓ Selected result');

    // ── Workflow 5: Run button ──────────────────────────────────
    console.log('▶ Workflow 5: Run action');
    await page.getByRole('button', { name: 'Code Review Patterns' }).click();
    await page.waitForTimeout(1000);

    const runBtn = page.getByRole('button', { name: 'Run' });
    if (await runBtn.isVisible()) {
      await runBtn.click();
      await page.waitForTimeout(2000);
      console.log('  ✓ Clicked Run');
    }

    // ── Workflow 6: API health check ────────────────────────────
    console.log('▶ Workflow 6: API health check');
    await page.goto(`${API_URL}/health`);
    await page.waitForTimeout(2500);

    const body = await page.textContent('body');
    const health = JSON.parse(body);
    console.log(`  ✓ Status: ${health.status}`);
    for (const [name, info] of Object.entries(health.components || {})) {
      console.log(`    ${info.status === 'healthy' ? '✓' : '✗'} ${name}: ${info.status}`);
    }

    // Back to web app
    await page.goto(WEB_URL);
    await page.waitForTimeout(2000);

    console.log('\n✅ All workflows passed');
  } catch (err) {
    console.error('\n❌ Workflow failed:', err.message);
    process.exitCode = 1;
  } finally {
    const videoPath = await page.video().path();
    await context.close();
    await browser.close();
    console.log(`\n🎬 Video saved: ${videoPath}`);
  }
}

run();
