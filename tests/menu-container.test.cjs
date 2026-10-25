require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

async function withPage(action, toolbar = true) {
  const previous = { document: global.document, window: global.window, MutationObserver: global.MutationObserver };
  class Element {
    constructor() { this.children = []; this.parentElement = null; this.dataset = {}; this.style = {}; }
    get isConnected() { return this === body || Boolean(this.parentElement?.isConnected); }
    get nextElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1]; }
    get previousElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) - 1]; }
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
    appendChild(child) { child.remove(); this.children.push(child); child.parentElement = this; return child; }
    insertAdjacentElement(position, child) { child.remove(); const at = this.parentElement.children.indexOf(this) + (position === 'afterend' ? 1 : 0); this.parentElement.children.splice(at, 0, child); child.parentElement = this.parentElement; }
  }
  const body = new Element();
  let target;
  function replaceToolbar() { body.children.slice().forEach(child => child.remove()); const bar = body.appendChild(new Element()); target = bar.appendChild(new Element()); return target; }
  if (toolbar) replaceToolbar();
  const observers = [];
  global.document = { body, createElement: () => new Element(), querySelector: () => target?.isConnected ? target : null };
  global.window = { location: { pathname: '/wiki/test' } };
  global.MutationObserver = class { constructor(callback) { observers.push(callback); } observe() {} };
  const path = require.resolve('../src/utils/menu-container.ts');
  delete require.cache[path];
  const { createMenuContainer } = require(path);
  try { await action({ createMenuContainer, body, getTarget: () => target, replaceToolbar, mutate: () => observers.forEach(callback => callback()), setPath: value => { global.window.location.pathname = value; } }); }
  finally { Object.assign(global, previous); delete require.cache[path]; }
}

test('两个入口各占工具栏位置，并发获取同一入口只创建一次', async () => withPage(async ({ createMenuContainer, getTarget }) => {
  const [roam, sameRoam, exp] = await Promise.all([createMenuContainer('roam'), createMenuContainer('roam'), createMenuContainer('export')]);
  assert.equal(roam, sameRoam); assert.notEqual(roam, exp);
  assert.equal(getTarget().previousElementSibling, roam); assert.equal(getTarget().nextElementSibling, exp);
}));
test('工具栏被页面导航替换后移动原节点，保留其中的界面状态', async () => withPage(async ({ createMenuContainer, replaceToolbar, getTarget, mutate }) => {
  const container = await createMenuContainer('export');
  container.dataset.testState = 'preserved';
  replaceToolbar(); assert.equal(container.isConnected, false);
  mutate(); assert.equal(getTarget().nextElementSibling, container);
  assert.equal(container.dataset.testState, 'preserved'); assert.equal(await createMenuContainer('export'), container);
  mutate(); assert.equal(getTarget().parentElement.children.length, 2);
}));
test('缺少工具栏时浮动显示，工具栏延迟出现后自动移回', async () => withPage(async ({ createMenuContainer, body, replaceToolbar, getTarget, mutate }) => {
  const container = await createMenuContainer('roam');
  assert.equal(container.parentElement, body); assert.equal(container.style.position, 'fixed');
  replaceToolbar(); mutate(); assert.equal(getTarget().previousElementSibling, container);
  assert.equal(container.style.position, 'relative');
}, false));
test('工具栏移除后降级显示，离开文档页后移除，再回文档页能恢复', async () => withPage(async ({ createMenuContainer, body, getTarget, setPath, mutate }) => {
  const container = await createMenuContainer('export');
  getTarget().parentElement.remove(); mutate(); assert.equal(container.parentElement, body);
  setPath('/home'); mutate(); assert.equal(container.isConnected, false);
  setPath('/drive/me/'); mutate(); assert.equal(container.parentElement, body);
}));
