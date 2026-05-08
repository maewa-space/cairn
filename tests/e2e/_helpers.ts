import type { Page, ElectronApplication } from '@playwright/test';
import { _electron as electron } from '@playwright/test';

export async function launchAndBypassOnboarding(args: string[]): Promise<{
  app: ElectronApplication;
  win: Page;
}> {
  const app = await electron.launch({ args });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');

  // Seed a dummy key so the FirstRunGate doesn't bounce us to /welcome on next nav.
  await win.evaluate(async () => {
    await window.quill.keys.set('openai', 'sk-test-bootstrap');
  });

  await win.evaluate(() => {
    window.location.hash = '#/home';
  });
  await win.waitForTimeout(80);
  return { app, win };
}
