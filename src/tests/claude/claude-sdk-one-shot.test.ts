import { beforeEach, describe, expect, it, vi } from 'vitest';

const completeSimpleMock = vi.hoisted(() => vi.fn());

vi.mock('@mariozechner/pi-ai', () => ({
  completeSimple: completeSimpleMock,
  getModel: vi.fn(() => undefined),
}));

vi.mock('../../main/claude/shared-auth', () => ({
  getSharedAuthStorage: () => ({
    setRuntimeApiKey: vi.fn(),
  }),
  ModelRegistry: vi.fn(),
}));

import type { AppConfig } from '../../main/config/config-store';
import { runPiAiOneShot } from '../../main/claude/claude-sdk-one-shot';

function makeConfig(): AppConfig {
  return {
    provider: 'custom',
    customProtocol: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1',
    model: 'test-model',
    activeProfileKey: 'custom:openai',
    profiles: {},
    activeConfigSetId: 'default',
    configSets: [],
    claudeCodePath: '',
    defaultWorkdir: '',
    globalSkillsPath: '',
    enableDevLogs: false,
    theme: 'light',
    sandboxEnabled: false,
    memoryEnabled: true,
    memoryRuntime: {
      llm: {
        inheritFromActive: true,
        apiKey: '',
        baseUrl: '',
        model: '',
        timeoutMs: 180000,
      },
      embedding: {
        inheritFromActive: true,
        apiKey: '',
        baseUrl: '',
        model: 'text-embedding-3-small',
        timeoutMs: 180000,
      },
      useEmbedding: false,
      maxNavSteps: 2,
      ingestionConcurrency: 4,
      storageRoot: '',
      evalEnabled: false,
      evalWorkspaces: [],
      evalMaxRounds: 12,
      evalArtifactsRoot: '',
      promptIterationRounds: 2,
    },
    enableThinking: false,
    bypassApprovals: false,
    isConfigured: true,
  };
}

describe('runPiAiOneShot', () => {
  beforeEach(() => {
    completeSimpleMock.mockReset();
    completeSimpleMock.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      stopReason: 'stop',
    });
  });

  it('passes generation options through to completeSimple', async () => {
    await runPiAiOneShot('hello', 'system', makeConfig(), {
      temperature: 0.2,
      maxTokens: 1234,
    });

    expect(completeSimpleMock).toHaveBeenCalledTimes(1);
    expect(completeSimpleMock.mock.calls[0][2]).toMatchObject({
      apiKey: 'test-key',
      temperature: 0.2,
      maxTokens: 1234,
    });
  });

  it('drops temperature for OpenAI GPT-5 / o-series models', async () => {
    const config = makeConfig();
    config.model = 'gpt-5.4';

    await runPiAiOneShot('hello', 'system', config, {
      temperature: 0,
      maxTokens: 1234,
    });

    expect(completeSimpleMock).toHaveBeenCalledTimes(1);
    const passedOptions = completeSimpleMock.mock.calls[0][2];
    expect(passedOptions).not.toHaveProperty('temperature');
    // Other options are preserved.
    expect(passedOptions).toMatchObject({ apiKey: 'test-key', maxTokens: 1234 });
  });

  it('drops temperature for o3 reasoning models', async () => {
    const config = makeConfig();
    config.model = 'o3';

    await runPiAiOneShot('hello', 'system', config, {
      temperature: 0,
    });

    const passedOptions = completeSimpleMock.mock.calls[0][2];
    expect(passedOptions).not.toHaveProperty('temperature');
  });

  it('keeps temperature for standard OpenAI chat models', async () => {
    const config = makeConfig();
    config.model = 'gpt-4o-mini';

    await runPiAiOneShot('hello', 'system', config, {
      temperature: 0.5,
    });

    const passedOptions = completeSimpleMock.mock.calls[0][2];
    expect(passedOptions).toMatchObject({ temperature: 0.5 });
  });

  it('drops temperature for Anthropic Claude Opus 4.7+ (deprecated)', async () => {
    for (const model of ['claude-opus-4-7', 'claude-opus-4-8']) {
      completeSimpleMock.mockClear();
      const config = makeConfig();
      config.provider = 'anthropic';
      config.customProtocol = undefined;
      config.baseUrl = 'https://api.anthropic.com';
      config.model = model;

      await runPiAiOneShot('hello', 'system', config, {
        temperature: 0,
      });

      const passedOptions = completeSimpleMock.mock.calls[0][2];
      expect(passedOptions, `temperature should be dropped for ${model}`).not.toHaveProperty(
        'temperature'
      );
    }
  });

  it('keeps temperature for Anthropic Claude Opus 4.6 and Sonnet', async () => {
    for (const model of ['claude-opus-4-6', 'claude-sonnet-4-6']) {
      completeSimpleMock.mockClear();
      const config = makeConfig();
      config.provider = 'anthropic';
      config.customProtocol = undefined;
      config.baseUrl = 'https://api.anthropic.com';
      config.model = model;

      await runPiAiOneShot('hello', 'system', config, {
        temperature: 0.3,
      });

      const passedOptions = completeSimpleMock.mock.calls[0][2];
      expect(passedOptions, `temperature should be kept for ${model}`).toMatchObject({
        temperature: 0.3,
      });
    }
  });
});
