import { describe, it, expect } from 'vitest';
import { splitTextByFileMentions, getFileLinkButtonClassName, splitChildrenByFileMentions } from '../src/renderer/utils/file-link';

describe('splitTextByFileMentions', () => {
  it('detects bare filenames with extension', () => {
    const input = 'Open sample-document.txt to view';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'Open ' },
      { type: 'file', value: 'sample-document.txt' },
      { type: 'text', value: ' to view' },
    ]);
  });

  it('detects Chinese filenames at the start of a line', () => {
    const input = 'simple-sales-report.xlsx - generated Excel file';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'file', value: 'simple-sales-report.xlsx' },
      { type: 'text', value: ' - generated Excel file' },
    ]);
  });

  it('detects absolute paths', () => {
    const input = 'Path /Users/haoqing/test/report.docx generated';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'Path ' },
      { type: 'file', value: '/Users/haoqing/test/report.docx' },
      { type: 'text', value: ' generated' },
    ]);
  });

  it('detects absolute paths with spaces', () => {
    const input = 'Document saved as: /Users/haoqing/Library/Application Support/open-cowork/default_working_dir/word-document/sample-document.docx';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'Document saved as: ' },
      { type: 'file', value: '/Users/haoqing/Library/Application Support/open-cowork/default_working_dir/word-document/sample-document.docx' },
    ]);
  });

  it('detects Windows absolute paths that use forward slashes', () => {
    const input = 'Saved to C:/Users/demo/Documents/report.txt successfully';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'Saved to ' },
      { type: 'file', value: 'C:/Users/demo/Documents/report.txt' },
      { type: 'text', value: ' successfully' },
    ]);
  });

  it('detects UNC network share paths', () => {
    const input = 'Saved to \\\\server\\share\\reports\\summary.docx successfully';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'Saved to ' },
      { type: 'file', value: '\\\\server\\share\\reports\\summary.docx' },
      { type: 'text', value: ' successfully' },
    ]);
  });

  it('detects bare Chinese filename after descriptive paragraph', () => {
    const input = [
      'Created a Word document with content "Beijing weather outlook for the next month" (including trends, feels-like temperature, precipitation and wind, and daily-life suggestions):',
      '',
      'beijing-weather-next-month.docx',
    ].join('\n');
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      {
        type: 'text',
        value: 'Created a Word document with content "Beijing weather outlook for the next month" (including trends, feels-like temperature, precipitation and wind, and daily-life suggestions):\n\n',
      },
      { type: 'file', value: 'beijing-weather-next-month.docx' },
    ]);
  });

  it('ignores urls', () => {
    const input = 'View https://example.com/demo.txt';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([{ type: 'text', value: input }]);
  });

  it('ignores file URLs instead of turning them into broken file buttons', () => {
    const input = 'View file:///C:/Users/demo/report.txt';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([{ type: 'text', value: input }]);
  });

  it('ignores UNC file URLs instead of splitting out the trailing filename', () => {
    const input = 'View file://server/share/report.txt';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([{ type: 'text', value: input }]);
  });

  it('does not treat numeric dimensions as filenames', () => {
    const input = 'HTML size should be 10.0" × 5.6" (16:9 ratio).';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([{ type: 'text', value: input }]);
  });

  it('detects filenames embedded in English sentences with valid boundaries', () => {
    const input = 'I can see slide1.html already exists. Let me create other slide files. First create slide2.html:';
    const parts = splitTextByFileMentions(input);
    expect(parts).toEqual([
      { type: 'text', value: 'I can see ' },
      { type: 'file', value: 'slide1.html' },
      { type: 'text', value: ' already exists. Let me create other slide files. First create ' },
      { type: 'file', value: 'slide2.html' },
      { type: 'text', value: ':' },
    ]);
  });

  it('provides a left-aligned file link button class', () => {
    const className = getFileLinkButtonClassName();
    expect(className).toContain('text-left');
    expect(className).toContain('break-all');
  });

  it('splits string children into file and text parts', () => {
    const parts = splitChildrenByFileMentions(['simple.md - description']);
    expect(parts).toEqual([
      { type: 'file', value: 'simple.md' },
      { type: 'text', value: ' - description' },
    ]);
  });
});
