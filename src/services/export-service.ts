import * as feishuApi from '../api/feishu-api';
import type { FeishuFile, FeishuFolder, WikiNode, WikiTreeResponse, TreeDataNode, TreeNode } from '../types/feishu';
import { getCacheScope, getDocumentIndex, saveDocumentIndex, type DocumentIndex } from './document-cache';

type ScanApi = Pick<typeof feishuApi, 'fetchFolders' | 'fetchShareFolders' | 'fetchMySpaceFileList' | 'fetchChildrenList' | 'fetchWikiSpaces' | 'fetchWikiNodeChildren'>;
type ScanContext = { files: FeishuFile[]; folders: FeishuFolder[]; warnings: string[]; seenFolders: Set<string>; seenWiki: Set<string> };
const nameOf = (value: string) => (value || '未命名').replace(/\//g, '-');
const failure = (error: unknown) => (error as Error)?.message || '读取失败';

export function buildTreeStructure(files: FeishuFile[], folders: FeishuFolder[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const folder of folders) {
    if (!folder.obj_token || nodes.has(folder.obj_token)) continue;
    nodes.set(folder.obj_token, { key: folder.obj_token, value: folder.obj_token, label: folder.name, type: 'folder', obj_token: folder.obj_token, path: folder.path, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const file of files) {
    const key = `file:${file.obj_token}`;
    const node: TreeNode = { key, value: key, label: file.name, type: 'file', obj_token: file.obj_token, obj_type: file.obj_type, path: file.path, url: file.url };
    const parent = nodes.get(file.parentToken);
    if (parent) parent.children!.push(node);
    else roots.push(node);
  }
  const seen = new Set<string>();
  for (const folder of folders) {
    if (seen.has(folder.obj_token)) continue;
    seen.add(folder.obj_token);
    const node = nodes.get(folder.obj_token);
    if (!node) continue;
    const parent = folder.parentToken && folder.parentToken !== folder.obj_token ? nodes.get(folder.parentToken) : undefined;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  }
  return roots;
}

async function scanFolder(token: string, path: string, parentToken: string, context: ScanContext, api: ScanApi) {
  const visitKey = token || 'my-space-root';
  if (context.seenFolders.has(visitKey)) return;
  context.seenFolders.add(visitKey);
  const result = token ? await api.fetchChildrenList(token) : await api.fetchMySpaceFileList();
  if (!result?.data?.node_list || !result.data.entities?.nodes) throw new Error('文件夹列表结构异常');
  for (const id of result.data.node_list) {
    const node = result.data.entities.nodes[id];
    if (!node?.obj_token) { context.warnings.push(`${path}：部分目录项缺少数据，列表可能不完整`); continue; }
    if (node.obj_token === token) continue;
    const name = nameOf(node.name);
    if (node.type === 0) {
      if (!context.folders.some(folder => folder.obj_token === node.obj_token)) {
        context.folders.push({ obj_token: node.obj_token, name, path: `${path}/${name}`, parentToken, url: node.url || '' });
      }
      try { await scanFolder(node.obj_token, `${path}/${name}`, node.obj_token, context, api); }
      catch (error) { context.warnings.push(`${path}/${name}：${failure(error)}`); }
    } else {
      context.files.push({ obj_token: node.obj_token, obj_type: node.type, name, path, parentToken, url: node.url || '' });
    }
  }
}

export async function processWikiNode(node: WikiNode, path: string, context: ScanContext, api: ScanApi, spaceId: string, parentToken: string, initialTree?: WikiTreeResponse) {
  if (!node?.obj_token || !node.wiki_token) { context.warnings.push(`${path}：知识库页面缺少标识，列表可能不完整`); return; }
  if (context.seenWiki.has(node.wiki_token)) return;
  context.seenWiki.add(node.wiki_token);
  const name = nameOf(node.title);
  if (!node.has_child) {
    context.files.push({ obj_token: node.obj_token, obj_type: node.obj_type, name, path, parentToken, url: node.url || '' });
    return;
  }
  const currentPath = `${path}/${name}`;
  context.folders.push({ obj_token: node.obj_token, name, path: currentPath, parentToken, url: node.url || '' });
  // A Wiki page can contain both its own document and child pages.
  context.files.push({ obj_token: node.obj_token, obj_type: node.obj_type, name, path: currentPath, parentToken: node.obj_token, url: node.url || '' });
  try {
    const tree = (initialTree || await api.fetchWikiNodeChildren(spaceId, node.wiki_token)).data.tree;
    for (const token of tree.child_map[node.wiki_token] || []) {
      if (tree.nodes[token]) await processWikiNode(tree.nodes[token], currentPath, context, api, spaceId, node.obj_token);
      else context.warnings.push(`${currentPath}：部分知识库子页面缺少数据，列表可能不完整`);
    }
  } catch (error) { context.warnings.push(`${currentPath}：${failure(error)}`); }
}

export async function scanDocuments(api: ScanApi = feishuApi): Promise<DocumentIndex> {
  const context: ScanContext = { files: [], folders: [
    { path: '我的文件夹', name: '我的文件夹', obj_token: 'virtual_my_files', url: '' },
    { path: '共享文件夹', name: '共享文件夹', obj_token: 'virtual_shared_files', url: '' },
    { path: '我的知识库', name: '我的知识库', obj_token: 'virtual_knowledge_base', url: '' }
  ], warnings: [], seenFolders: new Set(), seenWiki: new Set() };

  async function scanTopFolders(shared: boolean) {
    const data = shared ? await api.fetchShareFolders() : await api.fetchFolders();
    const root = shared ? 'virtual_shared_files' : 'virtual_my_files';
    const label = shared ? '共享文件夹' : '我的文件夹';
    if (!data?.node_list || !data.entities?.nodes) throw new Error('文件夹列表结构异常');
    for (const id of data.node_list) {
      const folder = data.entities.nodes[id];
      if (!folder?.obj_token) { context.warnings.push(`${label}：部分文件夹缺少数据，列表可能不完整`); continue; }
      if (context.seenFolders.has(folder.obj_token)) continue;
      const name = nameOf(folder.name);
      context.folders.push({ obj_token: folder.obj_token, name, path: `${label}/${name}`, parentToken: root, url: folder.url || '' });
      try { await scanFolder(folder.obj_token, `${label}/${name}`, folder.obj_token, context, api); }
      catch (error) { context.warnings.push(`${label}/${name}：${failure(error)}`); }
    }
  }

  try { await scanTopFolders(false); }
  catch (error) { context.warnings.push(`我的文件夹：${failure(error)}`); }
  try { await scanFolder('', '我的文件夹', 'virtual_my_files', context, api); }
  catch (error) { context.warnings.push(`我的文件夹根目录：${failure(error)}`); }
  try { await scanTopFolders(true); }
  catch (error) { context.warnings.push(`共享文件夹：${failure(error)}`); }
  try {
    for (const space of await api.fetchWikiSpaces()) {
      const folderToken = `wiki-space:${space.space_id}`;
      const spacePath = `我的知识库/${nameOf(space.space_name)}`;
      context.folders.push({ obj_token: folderToken, name: nameOf(space.space_name), path: spacePath, parentToken: 'virtual_knowledge_base', url: '' });
      try {
        const info = await api.fetchWikiNodeChildren(space.space_id, space.root_token);
        const tree = info.data.tree;
        const root = tree.nodes[space.root_token];
        if (root?.obj_token && root.obj_type) {
          await processWikiNode(root, spacePath, context, api, space.space_id, folderToken, info);
        } else {
          for (const token of tree.child_map[space.root_token] || []) {
            if (tree.nodes[token]) await processWikiNode(tree.nodes[token], spacePath, context, api, space.space_id, folderToken);
            else context.warnings.push(`${spacePath}：部分知识库子页面缺少数据，列表可能不完整`);
          }
        }
      } catch (error) { context.warnings.push(`${spacePath}：${failure(error)}`); }
    }
  } catch (error) { context.warnings.push(`我的知识库：${failure(error)}`); }
  const files = [...new Map(context.files.map(file => [file.obj_token, file])).values()];
  const folders = [...new Map(context.folders.map(folder => [folder.obj_token, folder])).values()];
  if (!files.length && context.warnings.length) throw new Error(context.warnings.join('；'));
  return { files, folders, tree: buildTreeStructure(files, folders), loadedAt: Date.now(), warnings: context.warnings };
}

const loads = new Map<string, Promise<DocumentIndex>>();
export async function loadAllFileList(): Promise<DocumentIndex> {
  const scope = await getCacheScope();
  if (!loads.has(scope)) {
    loads.set(scope, (async () => {
      const index = await scanDocuments();
      await saveDocumentIndex(index, scope);
      return index;
    })().finally(() => loads.delete(scope)));
  }
  return loads.get(scope)!;
}

function convertTree(node: TreeNode): TreeDataNode {
  return { title: node.label, key: node.key, type: node.type, obj_token: node.obj_token, obj_type: node.obj_type, path: node.path, url: node.url, checkable: true, selectable: false, children: node.children?.map(convertTree) };
}

export async function getTreeData(scope?: string): Promise<TreeDataNode[]> {
  return (await getDocumentIndex(scope))?.tree.map(convertTree) || [];
}
