import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const panelPath = path.resolve(process.cwd(), 'src/renderer/components/RemoteControlPanel.tsx');
const panelContent = readFileSync(panelPath, 'utf8');

describe('RemoteControlPanel links', () => {
  it('does not show one-click permission link', () => {
    expect(panelContent).not.toContain('一键配置权限');
  });

  it('includes BotFather setup link', () => {
    expect(panelContent).toContain('https://t.me/BotFather');
  });
});
