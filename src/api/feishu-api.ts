import { v4 as uuidv4 } from 'uuid';
import { getFileExtensionByObjType, getFileTypeByObjType, sleep } from '../utils/common';
import { request, RequestError } from '../utils/request';
import { collectPages, mergeExplorerPages } from '../utils/pagination';
import type { WikiSpace, WikiTreeResponse } from '../types/feishu';

type JsonResponse = { code: number; data: any; msg?: string };
const getJson = (url: string) => request<JsonResponse>(url, { headers: { Accept: 'application/json' } });
const endpoint = (path: string) => new URL(path, window.location.origin).href;

export function getCookies(fieldName: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'getCookies', fieldName, url: window.location.href }, response => {
        const error = chrome.runtime.lastError;
        if (error || response?.error) reject(new Error(error?.message || response?.error));
        else resolve(response?.fieldValue || null);
      });
    } else {
      const entry = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(`${fieldName}=`));
      resolve(entry ? entry.slice(fieldName.length + 1) : null);
    }
  });
}

export async function fetchWikiSpaces(): Promise<WikiSpace[]> {
  const pages = await collectPages(endpoint('/space/api/wiki/v2/space/get/?size=40'), getJson);
  const spaces = new Map<string, WikiSpace>();
  for (const page of pages) {
    if (!Array.isArray(page.data.spaces)) throw new Error('知识库列表结构发生变化');
    for (const space of page.data.spaces) spaces.set(space.space_id, space);
  }
  return [...spaces.values()];
}

export async function fetchWikiNodeChildren(spaceId: string, wikiToken: string): Promise<WikiTreeResponse> {
  const params = new URLSearchParams({ space_id: spaceId, wiki_token: wikiToken });
  const result = await getJson(endpoint(`/space/api/wiki/v2/tree/get_info/?${params}`));
  if (!result.data?.tree?.nodes || !result.data.tree.child_map) throw new Error('知识库目录结构发生变化');
  const paging = result.data.tree.nodes[wikiToken]?.child_paging;
  // The bundled interface examples do not document this cursor format.
  // Surface an incomplete scan instead of silently claiming a full backup.
  if (paging?.has_more || paging?.hasMore) throw new Error('此知识库节点存在未读取的子页分页，当前列表可能不完整');
  return result as WikiTreeResponse;
}

async function explorer(path: string) {
  return mergeExplorerPages(await collectPages(endpoint(path), getJson));
}

export async function fetchFolders() {
  return (await explorer('/space/api/explorer/v3/my_space/folder/?asc=1&rank=5&length=50')).data;
}

export async function fetchShareFolders() {
  return (await explorer('/space/api/explorer/v2/share/folder/list/?asc=0&rank=3&hidden=0&length=50')).data;
}

export function fetchChildrenList(token: string) {
  return explorer(`/space/api/explorer/v3/children/list/?asc=1&rank=5&length=50&token=${encodeURIComponent(token)}`);
}

export function fetchMySpaceFileList() {
  return explorer('/space/api/explorer/v3/my_space/obj/?length=50');
}

export async function createExportTask(file: { token: string; obj_type: number }): Promise<string> {
  const type = getFileTypeByObjType(file.obj_type);
  if (!type) throw new RequestError(`暂不支持导出此文件类型（${file.obj_type}）`);
  const csrf = await getCookies('_csrf_token');
  if (!csrf) throw new RequestError('未取得登录校验信息，请登录后刷新飞书页面');
  const requestId = uuidv4();
  const params = new URLSearchParams({ synced_block_host_token: file.token, synced_block_host_type: type });
  const result = await request<JsonResponse>(endpoint(`/space/api/export/create/?${params}`), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-csrftoken': csrf, 'request-id': requestId, 'x-request-id': requestId },
    body: JSON.stringify({ token: file.token, type, file_extension: getFileExtensionByObjType(file.obj_type), event_source: 1, need_comment: false })
  });
  if (!result.data?.ticket) throw new RequestError('飞书未返回导出任务编号');
  return result.data.ticket;
}

export function fetchExportResult(ticket: string, token: string, objType: number) {
  const type = getFileTypeByObjType(objType);
  const params = new URLSearchParams({ token, type, synced_block_host_token: token, synced_block_host_type: type });
  return getJson(endpoint(`/space/api/export/result/${encodeURIComponent(ticket)}?${params}`));
}

export async function waitForExportResult(ticket: string, token: string, objType: number): Promise<{ url: string; type: string }> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetchExportResult(ticket, token, objType);
    const result = response.data?.result;
    if (result?.file_token) {
      const params = new URLSearchParams({ synced_block_host_token: token, synced_block_host_type: getFileTypeByObjType(objType) });
      return {
        url: `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/all/${encodeURIComponent(result.file_token)}/?${params}`,
        type: result.file_extension || getFileExtensionByObjType(objType)
      };
    }
    if (attempt < 29) await sleep(2000);
  }
  throw new RequestError('等待导出结果超时，可稍后仅重试失败文件');
}

export function download(url: string, _type?: string): Promise<Blob> {
  return request<Blob>(url, { method: 'GET' }, 'blob');
}
