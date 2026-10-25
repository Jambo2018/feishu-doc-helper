require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { collectPages, mergeExplorerPages } = require('../src/utils/pagination.ts');
const { getRoamCandidates, onlyFolders } = require('../src/services/roam-service.ts');
const { runExportQueue } = require('../src/services/export-runner.ts');
const { reserveArchivePath } = require('../src/utils/archive-path.ts');
const { scanDocuments } = require('../src/services/export-service.ts');
const { request } = require('../src/utils/request.ts');
const apiClient = require('../src/api/feishu-api.ts');

const doc = (token, parent = 'folder', name = token) => ({ obj_token: token, obj_type: 22, name, parentToken: parent, path: '我的文件夹/测试', url: `https://example.feishu.cn/docx/${token}` });
const folder = (token, parent) => ({ obj_token: token, parentToken: parent, name: '同名目录', path: '测试', url: '' });
const empty = () => ({ node_list: [], entities: { nodes: {} } });
const wiki = (token, children = false) => ({ obj_token: `obj-${token}`, wiki_token: token, obj_type: 22, title: token, has_child: children, url: `https://example.feishu.cn/wiki/${token}` });
const response = (nodes, child_map) => ({ code: 0, data: { tree: { nodes, child_map, root_list: [] } } });
const baselineApi = () => ({ fetchFolders: async () => empty(), fetchShareFolders: async () => empty(), fetchMySpaceFileList: async () => ({ data: empty() }), fetchChildrenList: async () => ({ data: empty() }), fetchWikiSpaces: async () => [], fetchWikiNodeChildren: async () => response({}, {}) });

test('读取第二页，并保留原查询条件和正确编码游标', async () => {
  const calls = [];
  const pages = await collectPages('https://example.feishu.cn/list?size=40&token=folder', async url => {
    calls.push(new URL(url));
    return calls.length === 1 ? { data: { has_more: true, last_label: 'a||b + c' } } : { data: { has_more: false } };
  });
  assert.equal(pages.length, 2);
  assert.equal(calls[1].searchParams.get('last_label'), 'a||b + c');
  assert.equal(calls[1].searchParams.get('token'), 'folder');
  assert.equal(calls[1].searchParams.get('size'), '40');
});
test('兼容下一页 page_token 和 cursor', async () => {
  for (const [field, query] of [['next_page_token', 'page_token'], ['next_cursor', 'cursor']]) {
    let calls = 0;
    await collectPages('https://example.feishu.cn/list', async url => {
      if (++calls === 1) return { data: { has_more: true, [field]: 'next' } };
      assert.equal(new URL(url).searchParams.get(query), 'next');
      return { data: { has_more: false } };
    });
    assert.equal(calls, 2);
  }
});
test('有下一页却缺少游标时不能宣告列表完整', async () => {
  await assert.rejects(collectPages('https://example.feishu.cn/list', async () => ({ data: { has_more: true } })), /未返回可识别/);
});
test('重复游标会终止，避免无限请求', async () => {
  let calls = 0;
  await assert.rejects(collectPages('https://example.feishu.cn/list', async () => { calls++; return { data: { has_more: true, last_label: 'same' } }; }), /重复/);
  assert.equal(calls, 2);
});
test('合并多页目录并去除重复节点', () => {
  const result = mergeExplorerPages([{ data: { node_list: ['a'], entities: { nodes: { a: { name: 'A' } } } } }, { data: { node_list: ['a', 'b'], entities: { nodes: { b: { name: 'B' } } } } }]);
  assert.deepEqual(result.data.node_list, ['a', 'b']);
  assert.equal(result.data.entities.nodes.a.name, 'A');
  assert.equal(result.data.entities.nodes.b.name, 'B');
});
test('无效目录响应不能被吞成空目录', () => assert.throws(() => mergeExplorerPages([{ data: {} }]), /结构/));

test('排除目录按标识匹配，并排除全部子孙目录', () => {
  const files = [doc('a', 'nested'), doc('b', 'keep')];
  const result = getRoamCandidates(files, [folder('excluded'), folder('nested', 'excluded'), folder('keep')], ['excluded']);
  assert.deepEqual(result.map(x => x.obj_token), ['b']);
});
test('同名目录和 token 末字符不会误排', () => {
  const kept = { ...doc('keep', 'keep'), path: '我的文件夹/AI资料' };
  assert.deepEqual(getRoamCandidates([kept], [folder('otherA'), folder('keep')], ['otherA']), [kept]);
});
test('排除根节点后不再打开其文档', () => {
  assert.equal(getRoamCandidates([doc('a', 'child')], [folder('root'), folder('child', 'root')], ['root']).length, 0);
});
test('目录父链成环时仍会终止', () => {
  assert.equal(getRoamCandidates([doc('a', 'one')], [folder('one', 'two'), folder('two', 'one')], []).length, 1);
});
test('无有效 URL 的文档不用于漫游', () => assert.equal(getRoamCandidates([{ ...doc('a'), url: '' }], [], []).length, 0));
test('设置目录树仅包含文件夹', () => {
  const result = onlyFolders([{ key: 'f', type: 'folder', children: [{ key: 'file:a', type: 'file' }] }, { key: 'file:b', type: 'file' }]);
  assert.deepEqual(result.map(x => x.key), ['f']);
  assert.deepEqual(result[0].children, []);
});

test('知识库父页面和子页面正文均保留，树节点 key 不冲突', async () => {
  const api = baselineApi();
  const parent = wiki('parent', true), leaf = wiki('leaf');
  api.fetchWikiSpaces = async () => [{ space_id: 'space', space_name: '知识库', root_token: 'root' }];
  api.fetchWikiNodeChildren = async (_, token) => token === 'root' ? response({ parent }, { root: ['parent'] }) : response({ leaf }, { parent: ['leaf'] });
  const index = await scanDocuments(api);
  assert.deepEqual(index.files.map(x => x.obj_token).sort(), ['obj-leaf', 'obj-parent']);
  assert.equal(index.files.find(x => x.obj_token === 'obj-parent').parentToken, 'obj-parent');
  const keys = [];
  const visit = nodes => nodes.forEach(node => { keys.push(node.key); visit(node.children || []); });
  visit(index.tree);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('obj-parent') && keys.includes('file:obj-parent'));
});
test('知识库根页面本身有正文时也会进入导出列表', async () => {
  const api = baselineApi();
  api.fetchWikiSpaces = async () => [{ space_id: 'space', space_name: '知识库', root_token: 'root' }];
  api.fetchWikiNodeChildren = async () => response({ root: wiki('root') }, { root: [] });
  assert.deepEqual((await scanDocuments(api)).files.map(x => x.obj_token), ['obj-root']);
});
test('子目录失败时保留其他文档并明确给出不完整警告', async () => {
  const api = baselineApi();
  api.fetchFolders = async () => { throw new Error('无权访问目录'); };
  api.fetchMySpaceFileList = async () => ({ data: { node_list: ['a'], entities: { nodes: { a: { obj_token: 'a', type: 22, name: 'A' } } } } });
  const index = await scanDocuments(api);
  assert.equal(index.files.length, 1);
  assert.equal(index.files[0].url, '');
  assert.match(index.warnings[0], /无权访问/);
});
test('所有来源均失败时，不会缓存一个成功的空列表', async () => {
  const api = Object.fromEntries(Object.keys(baselineApi()).map(key => [key, async () => { throw new Error('离线'); }]));
  await assert.rejects(scanDocuments(api), /离线/);
});
test('相同文件夹从根目录再次返回时不会重复扫描', async () => {
  const api = baselineApi(); let calls = 0;
  const folders = { node_list: ['f'], entities: { nodes: { f: { obj_token: 'f', name: '目录', type: 0 } } } };
  api.fetchFolders = async () => folders;
  api.fetchMySpaceFileList = async () => ({ data: folders });
  api.fetchChildrenList = async () => { calls++; return { data: { node_list: ['a'], entities: { nodes: { a: { obj_token: 'a', type: 22, name: 'A' } } } } }; };
  const index = await scanDocuments(api);
  assert.equal(calls, 1);
  assert.equal(index.files.length, 1);
});
test('目录列出节点但未返回实体时，不能静默当作完整列表', async () => {
  const api = baselineApi();
  api.fetchMySpaceFileList = async () => ({ data: { node_list: ['a', 'missing'], entities: { nodes: { a: { obj_token: 'a', type: 22, name: 'A' } } } } });
  const index = await scanDocuments(api);
  assert.equal(index.files.length, 1);
  assert.match(index.warnings.join(' '), /目录项缺少数据/);
});
test('知识库子节点实体缺失时保留父页并标明不完整', async () => {
  const api = baselineApi(); const parent = wiki('parent', true);
  api.fetchWikiSpaces = async () => [{ space_id: 'space', space_name: '知识库', root_token: 'root' }];
  api.fetchWikiNodeChildren = async (_, token) => token === 'root' ? response({ parent }, { root: ['parent'] }) : response({}, { parent: ['missing'] });
  const index = await scanDocuments(api);
  assert.deepEqual(index.files.map(x => x.obj_token), ['obj-parent']);
  assert.match(index.warnings.join(' '), /子页面缺少数据/);
});

const okBackend = () => ({ createExportTask: async ({ token }) => token, waitForExportResult: async token => ({ url: token, type: 'docx' }), download: async token => new Blob(['content-' + token]) });
const sink = () => ({ entries: [], file(name, content) { this.entries.push({ name, content }); } });
test('正常文件按目录收集，并在完成后推进进度', async () => {
  const archive = sink(), progress = [];
  const result = await runExportQueue([doc('a'), doc('b')], okBackend(), archive, value => progress.push(value));
  assert.equal(result.succeeded, 2); assert.equal(result.failed, 0);
  assert.deepEqual(archive.entries.map(x => x.name).sort(), ['我的文件夹/测试/a.docx', '我的文件夹/测试/b.docx']);
  assert.deepEqual(progress.map(x => x.completed), [1, 2]);
  assert.ok(progress.every(x => x.completed === x.succeeded + x.failed));
});
test('创建任务返回 null 时准确报告失败，不再声称全部成功', async () => {
  const backend = okBackend(); backend.createExportTask = async ({ token }) => token === 'b' ? null : token;
  const result = await runExportQueue([doc('a'), doc('b')], backend, sink());
  assert.equal(result.succeeded, 1); assert.equal(result.failed, 1); assert.equal(result.items[1].status, 'failed');
});
test('下载为空时准确报告失败', async () => {
  const backend = okBackend(); backend.download = async () => new Blob([]);
  const result = await runExportQueue([doc('a')], backend, sink());
  assert.equal(result.succeeded, 0); assert.equal(result.failed, 1); assert.match(result.items[0].error, /为空/);
});
test('轮询超时和权限错误不会导致其他文件中断', async () => {
  const backend = okBackend(); backend.waitForExportResult = async (ticket, token) => { if (token === 'a') throw new Error('无导出权限'); return { url: token, type: 'docx' }; };
  const result = await runExportQueue([doc('a'), doc('b')], backend, sink());
  assert.equal(result.failed, 1); assert.equal(result.succeeded, 1); assert.match(result.items[0].error, /权限/);
});
test('重复选择不会重复导出同一文档', async () => {
  const result = await runExportQueue([doc('a'), doc('a')], okBackend(), sink());
  assert.equal(result.total, 1); assert.equal(result.succeeded, 1);
});
test('相同路径文件不会被静默覆盖', async () => {
  const archive = sink();
  await runExportQueue([doc('a', 'folder', '同名'), doc('b', 'folder', '同名')], okBackend(), archive);
  assert.deepEqual(archive.entries.map(x => x.name).sort(), ['我的文件夹/测试/同名 (2).docx', '我的文件夹/测试/同名.docx'].sort());
});
test('ZIP 路径不能越出目录，大小写碰撞也会保留两份', () => {
  const used = new Set();
  const first = reserveArchivePath('../目录', '../A', 'docx', used);
  const second = reserveArchivePath('../目录', '../a', 'docx', used);
  assert.ok(!first.split('/').includes('..')); assert.notEqual(first.toLowerCase(), second.toLowerCase());
});
test('已经收集的文档能生成并重新读取真实 ZIP', async () => {
  const archive = sink();
  const result = await runExportQueue([doc('a'), doc('b')], okBackend(), archive);
  const zip = new JSZip();
  for (const entry of archive.entries) zip.file(entry.name, entry.content);
  zip.file('_导出结果.json', JSON.stringify(result));
  const binary = await zip.generateAsync({ type: 'nodebuffer' });
  const loaded = await JSZip.loadAsync(binary);
  assert.equal(await loaded.file('我的文件夹/测试/a.docx').async('string'), 'content-a');
  assert.equal(await loaded.file('我的文件夹/测试/b.docx').async('string'), 'content-b');
  assert.equal(JSON.parse(await loaded.file('_导出结果.json').async('string')).succeeded, 2);
});
test('直接使用真实 JSZip 接收下载 Blob，不依赖 FileReader 适配器', async () => {
  const zip = new JSZip();
  const result = await runExportQueue([doc('a')], okBackend(), zip);
  const blob = await zip.generateAsync({ type: 'blob' });
  const loaded = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.equal(result.succeeded, 1);
  assert.equal(await loaded.file('我的文件夹/测试/a.docx').async('string'), 'content-a');
});
test('二进制读取失败必须计为失败，不能留下成功记录', async () => {
  const backend = okBackend();
  backend.download = async () => ({ size: 1, arrayBuffer: async () => { throw new Error('二进制读取失败'); } });
  const result = await runExportQueue([doc('a')], backend, sink());
  assert.equal(result.succeeded, 0); assert.equal(result.failed, 1);
  assert.match(result.items[0].error, /二进制读取失败/);
});
test('并发数量有上限，进度不会在下载完成前增加', async () => {
  let active = 0, maxActive = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const backend = okBackend();
  backend.download = async () => { active++; maxActive = Math.max(active, maxActive); await gate; active--; return new Blob(['ok']); };
  const progress = [];
  const running = runExportQueue([doc('a'), doc('b'), doc('c')], backend, sink(), x => progress.push(x), 2);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(progress.length, 0); assert.equal(active, 2);
  release(); await running;
  assert.equal(maxActive, 2); assert.equal(progress.at(-1).completed, 3);
});

test('临时 503 会重试并成功', async () => {
  let calls = 0;
  const value = await request('https://example.feishu.cn/api', {}, 'json', { pause: async () => {}, fetcher: async () => ++calls === 1 ? new Response('', { status: 503 }) : Response.json({ code: 0, data: 'ok' }) });
  assert.equal(calls, 2); assert.equal(value.data, 'ok');
});
test('403 权限失败不会反复请求', async () => {
  let calls = 0;
  await assert.rejects(request('https://example.feishu.cn/api', {}, 'json', { pause: async () => {}, fetcher: async () => { calls++; return new Response('', { status: 403 }); } }), /403/);
  assert.equal(calls, 1);
});
test('导出创建 POST 不会自动重复提交', async () => {
  let calls = 0;
  await assert.rejects(request('https://example.feishu.cn/api', { method: 'POST' }, 'json', { pause: async () => {}, fetcher: async () => { calls++; throw new TypeError('断网'); } }), /断网/);
  assert.equal(calls, 1);
});
test('HTTP 200 中的业务错误不能当成成功', async () => {
  await assert.rejects(request('https://example.feishu.cn/api', {}, 'json', { fetcher: async () => Response.json({ code: 403, msg: '禁止导出' }) }), /禁止导出/);
});
test('请求超时会终止，不会无限等待', async () => {
  await assert.rejects(request('https://example.feishu.cn/api', {}, 'json', { attempts: 1, timeoutMs: 5, fetcher: async (_, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')))) }), /超时/);
});
test('下载返回登录页面或 JSON 错误时不能被打包成文档', async () => {
  for (const contentType of ['text/html', 'application/json']) {
    await assert.rejects(request('https://example.feishu.cn/download', {}, 'blob', { fetcher: async () => new Response('error', { headers: { 'content-type': contentType } }) }), /未返回文件/);
  }
});

async function withApiResponses(replies, action) {
  const previousFetch = global.fetch, previousWindow = global.window;
  const calls = [];
  global.window = { location: { origin: 'https://example.feishu.cn' } };
  global.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const reply = replies[calls.length - 1];
    if (!reply) throw new Error('出现未预期的额外请求');
    return Response.json(reply);
  };
  try { await action(calls); }
  finally { global.fetch = previousFetch; global.window = previousWindow; }
}

test('实际知识库 API 包装器读取全部页并去重', async () => {
  await withApiResponses([
    { code: 0, data: { spaces: [{ space_id: 'a' }], has_more: true, last_label: 'next' } },
    { code: 0, data: { spaces: [{ space_id: 'a' }, { space_id: 'b' }], has_more: false } }
  ], async calls => {
    assert.deepEqual((await apiClient.fetchWikiSpaces()).map(x => x.space_id), ['a', 'b']);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.searchParams.get('last_label'), 'next');
    assert.equal(calls[1].init.credentials, 'include');
  });
});
test('实际目录 API 包装器合并分页，并保留父目录 token', async () => {
  await withApiResponses([
    { code: 0, data: { node_list: ['a'], entities: { nodes: { a: { obj_token: 'a' } } }, has_more: true, next_page_token: 'next' } },
    { code: 0, data: { node_list: ['b'], entities: { nodes: { b: { obj_token: 'b' } } }, has_more: false } }
  ], async calls => {
    assert.deepEqual((await apiClient.fetchChildrenList('parent')).data.node_list, ['a', 'b']);
    assert.equal(calls[1].url.searchParams.get('token'), 'parent');
    assert.equal(calls[1].url.searchParams.get('page_token'), 'next');
  });
});
test('未知的知识库子页分页格式必须明确报错', async () => {
  await withApiResponses([{ code: 0, data: { tree: { nodes: { root: { child_paging: { has_more: true } } }, child_map: { root: [] } } } }], async () => {
    await assert.rejects(apiClient.fetchWikiNodeChildren('space', 'root'), /未读取的子页分页/);
  });
});
test('不支持的导出类型不应伪装成 PDF 支持', async () => {
  await assert.rejects(apiClient.createExportTask({ token: 'unknown', obj_type: 999 }), /暂不支持/);
});
