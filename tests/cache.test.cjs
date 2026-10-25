require('./register.cjs');
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const cache = require('../src/services/document-cache.ts');
let session, stored, storageError, reads;
const originalWindow = global.window, originalChrome = global.chrome;
const index = () => ({ files: [], folders: [], tree: [], loadedAt: 123, warnings: [] });
beforeEach(() => {
  session = 'test-session-a'; stored = {}; storageError = false; reads = [];
  global.window = { location: { href: 'https://one.feishu.cn/drive/me/' } };
  global.chrome = {
    runtime: { sendMessage: (message, callback) => callback({ fieldValue: session }) },
    tabs: { query: (_, callback) => callback([{ url: 'https://one.feishu.cn/drive/me/' }]) },
    storage: { local: {
      get: (keys, callback) => {
        reads.push(...keys);
        if (storageError) chrome.runtime.lastError = { message: '存储不可用' };
        callback(Object.fromEntries(keys.map(key => [key, stored[key]])));
        delete chrome.runtime.lastError;
      },
      set: (values, callback) => { Object.assign(stored, structuredClone(values)); callback(); }
    } }
  };
});
after(() => { global.window = originalWindow; global.chrome = originalChrome; });

test('同一域名和会话能复用索引，键中不包含原始会话值', async () => {
  const scope = await cache.getCacheScope();
  assert.ok(!scope.includes(session));
  await cache.saveDocumentIndex(index(), scope);
  assert.deepEqual(await cache.getDocumentIndex(), index());
});
test('切换账号会话后不会读到旧索引', async () => {
  const scope = await cache.getCacheScope();
  await cache.saveDocumentIndex(index(), scope);
  session = 'test-session-b';
  assert.notEqual(await cache.getCacheScope(), scope);
  assert.equal(await cache.getDocumentIndex(), undefined);
});
test('切换飞书域名后不会读到旧索引', async () => {
  const scope = await cache.getCacheScope();
  await cache.saveDocumentIndex(index(), scope);
  window.location.href = 'https://two.feishu.cn/drive/me/';
  assert.equal(await cache.getDocumentIndex(), undefined);
});
test('扫描过程中会话变化时拒绝写入旧索引', async () => {
  const scope = await cache.getCacheScope();
  session = 'changed';
  await assert.rejects(cache.saveDocumentIndex(index(), scope), /会话已变化/);
  assert.deepEqual(stored, {});
});
test('没有登录会话时拒绝回退到旧版全局缓存', async () => {
  session = null; stored.feishuFileList = [{ name: '旧账号数据' }];
  await assert.rejects(cache.getDocumentIndex(), /登录会话/);
  assert.deepEqual(reads, []);
});
test('弹出窗口按当前飞书标签页解析会话', async () => {
  const scope = await cache.getCacheScope();
  window.location.href = 'chrome-extension://helper/popup.html';
  assert.equal(await cache.getCacheScope(), scope);
});
test('当前标签不是飞书时明确提示，不能复用上次域名', async () => {
  window.location.href = 'chrome-extension://helper/popup.html';
  chrome.tabs.query = (_, callback) => callback([{ url: 'https://github.com/' }]);
  await assert.rejects(cache.getCacheScope(), /切换到已登录的飞书/);
});
test('排除目录按会话隔离，刷新索引不丢失设置', async () => {
  const scope = await cache.getCacheScope();
  await cache.setExcludedFolders(['folder', 'folder'], scope);
  await cache.saveDocumentIndex(index(), scope);
  assert.deepEqual(await cache.getExcludedFolders(), ['folder']);
  session = 'another';
  assert.deepEqual(await cache.getExcludedFolders(), []);
});
test('设置打开后切换会话不能把旧目录保存到新账号', async () => {
  const scope = await cache.getCacheScope();
  session = 'another';
  await assert.rejects(cache.setExcludedFolders(['folder'], scope), /会话已变化/);
});
test('本地存储错误必须反馈给调用者', async () => {
  storageError = true;
  await assert.rejects(cache.getDocumentIndex(), /存储不可用/);
});
