import { describe, expect, it } from 'vitest';
import { pickNpxCommand, type NpxResolverDeps } from '../src/main/claude/agent-runner';

/**
 * Tests for the npx resolution fallback: prefer the bundled npx, but fall back
 * to a system install (e.g. C:\Program Files\nodejs\npx.cmd) when the bundled
 * one does not actually run.
 */

const WIN_PROGRAM_FILES_NPX = 'C:\\Program Files\\nodejs\\npx.cmd';
const BUNDLED_NPX = 'C:\\app\\resources\\node\\npx.cmd';

function baseDeps(overrides: Partial<NpxResolverDeps> = {}): NpxResolverDeps {
  return {
    platform: 'win32',
    bundledNpx: BUNDLED_NPX,
    pathEnv: '',
    npxWorks: () => true,
    pathExists: () => true,
    explicitCandidates: [WIN_PROGRAM_FILES_NPX],
    preferredFromPath: () => null,
    ...overrides,
  };
}

describe('pickNpxCommand', () => {
  it('uses the bundled npx when it works', () => {
    const result = pickNpxCommand(baseDeps({ npxWorks: (cmd) => cmd === BUNDLED_NPX }));
    expect(result).toBe(BUNDLED_NPX);
  });

  it('falls back to C:\\Program Files\\nodejs\\npx.cmd when the bundled npx does not run', () => {
    const result = pickNpxCommand(
      baseDeps({
        // Bundled npx fails; the explicit Program Files candidate works.
        npxWorks: (cmd) => cmd === WIN_PROGRAM_FILES_NPX,
      })
    );
    expect(result).toBe(WIN_PROGRAM_FILES_NPX);
  });

  it('prefers a PATH-resolved system npx before explicit candidates', () => {
    const pathNpx = 'D:\\nodejs\\npx.cmd';
    const result = pickNpxCommand(
      baseDeps({
        npxWorks: (cmd) => cmd === pathNpx || cmd === WIN_PROGRAM_FILES_NPX,
        preferredFromPath: () => pathNpx,
      })
    );
    expect(result).toBe(pathNpx);
  });

  it('skips a PATH result that equals the (broken) bundled npx', () => {
    const result = pickNpxCommand(
      baseDeps({
        npxWorks: (cmd) => cmd === WIN_PROGRAM_FILES_NPX,
        // PATH resolver returns the bundled path itself — must be ignored.
        preferredFromPath: () => BUNDLED_NPX,
      })
    );
    expect(result).toBe(WIN_PROGRAM_FILES_NPX);
  });

  it('skips explicit candidates that do not exist on disk', () => {
    const result = pickNpxCommand(
      baseDeps({
        npxWorks: () => false,
        pathExists: () => false,
      })
    );
    expect(result).toBe('npx');
  });

  it('falls back to plain npx when nothing works', () => {
    const result = pickNpxCommand(
      baseDeps({
        npxWorks: () => false,
      })
    );
    expect(result).toBe('npx');
  });

  it('does not probe Windows fallbacks on non-Windows platforms', () => {
    const result = pickNpxCommand(
      baseDeps({
        platform: 'linux',
        bundledNpx: '/app/resources/node/bin/npx',
        npxWorks: () => false,
        explicitCandidates: [],
      })
    );
    expect(result).toBe('npx');
  });

  it('uses bundled npx on non-Windows when it works', () => {
    const bundled = '/app/resources/node/bin/npx';
    const result = pickNpxCommand(
      baseDeps({
        platform: 'linux',
        bundledNpx: bundled,
        npxWorks: (cmd) => cmd === bundled,
        explicitCandidates: [],
      })
    );
    expect(result).toBe(bundled);
  });
});
