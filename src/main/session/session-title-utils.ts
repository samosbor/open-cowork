export { DEFAULT_SESSION_TITLE, getDefaultTitleFromPrompt } from '../../shared/session-title';
import { DEFAULT_SESSION_TITLE, getDefaultTitleFromPrompt } from '../../shared/session-title';

export type TitleDecisionInput = {
  userMessageCount: number;
  currentTitle: string;
  prompt: string;
  hasAttempted: boolean;
};

export type TitlePromptOptions = {
  englishOnly?: boolean;
};

export function shouldGenerateTitle(input: TitleDecisionInput): boolean {
  if (input.hasAttempted) return false;
  if (input.userMessageCount !== 1) return false;
  const defaultTitle = getDefaultTitleFromPrompt(input.prompt);
  return input.currentTitle === defaultTitle || input.currentTitle === DEFAULT_SESSION_TITLE;
}

function containsNonEnglishScript(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(value);
}

export function getEnglishDefaultTitleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return DEFAULT_SESSION_TITLE;
  }

  const englishOnly = trimmed
    .replace(/[^\x00-\x7f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!englishOnly) {
    return DEFAULT_SESSION_TITLE;
  }

  if (/[^\x00-\x7f]/.test(trimmed) && englishOnly.split(' ').length < 2) {
    return DEFAULT_SESSION_TITLE;
  }

  return englishOnly.slice(0, 50);
}

export function normalizeGeneratedTitle(
  value: string | null | undefined,
  options: TitlePromptOptions = {}
): string | null {
  if (!value) return null;
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;
  const normalized = firstLine.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!normalized) return null;
  if (
    normalized.toLowerCase() === '(no content)' ||
    normalized.toLowerCase() === '(empty content)'
  ) {
    return null;
  }
  if (options.englishOnly && containsNonEnglishScript(normalized)) {
    return null;
  }
  return normalized.slice(0, 120);
}

export function shouldForceEnglishTitles(provider: string, model: string): boolean {
  return provider === 'openai' && /^(gpt|o\d)/i.test(model.trim());
}

export function buildTitlePrompt(prompt: string, options: TitlePromptOptions = {}): string {
  if (options.englishOnly) {
    return [
      'Generate a short English title for the following user request. Rules:',
      '- Reply in English only',
      '- Max 6 words',
      '- No quotes, numbering, or punctuation at the end',
      '- Prefer concise noun phrases',
      '',
      `User request: ${prompt.trim()}`,
    ].join('\n');
  }

  return [
    'Generate a short title for the following user request. Rules:',
    '- Max 15 characters (Chinese) or 6 words (English)',
    '- Reply in the same language as the user request',
    '- No quotes, numbering, or punctuation at the end',
    '',
    '请根据用户请求生成一个简短的对话标题：',
    '- 不超过15个字',
    '- 同语言输出',
    '- 不要加引号或编号',
    '',
    `User request / 用户请求：${prompt.trim()}`,
  ].join('\n');
}
