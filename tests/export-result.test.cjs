require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ExportResult } = require('../src/components/export-result.tsx');

test('生成后提供持久可点击的 ZIP 与清单链接，而不是声称已经保存', () => {
  const html = renderToStaticMarkup(React.createElement(ExportResult, {
    report: { total: 1, succeeded: 1, failed: 0, items: [] },
    archive: { url: 'blob:archive', filename: 'export.zip' }, summary: { url: 'blob:report', filename: 'report.json' }
  }));
  assert.match(html, /href="blob:archive" download="export.zip"/);
  assert.match(html, /href="blob:report" download="report.json"/);
  assert.match(html, /请点击下载/);
  assert.doesNotMatch(html, /已保存/);
});
test('压缩失败时持续显示错误与失败原因，不展示无效 ZIP 链接', () => {
  const html = renderToStaticMarkup(React.createElement(ExportResult, {
    report: { total: 1, succeeded: 0, failed: 1, items: [{ token: 'a', name: '测试样本', status: 'failed', error: '无权限' }] }, error: '生成失败'
  }));
  assert.match(html, /role="alert"/); assert.match(html, /生成失败/); assert.match(html, /无权限/);
  assert.doesNotMatch(html, /下载 ZIP/);
});
