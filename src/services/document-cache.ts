import type { FeishuFile, FeishuFolder, TreeNode } from '../types/feishu';

export interface DocumentIndex {
  files: FeishuFile[];
  folders: FeishuFolder[];
  tree: TreeNode[];
  loadedAt: number;
  warnings: string[];
}

export const CACHE_MAX_AGE = 60 * 60 * 1000;

function cookie(name: string, url: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'getCookies', fieldName: name, url }, response => {
      const error = chrome.runtime.lastError;
      if (error || response?.error) reject(new Error(error?.message || response?.error));
      else resolve(response?.fieldValue || null);
    });
  });
}

export async function getCacheScope(): Promise<string> {
  let url = window.location.href;
  if (!/^https:\/\/[^/]+\.feishu\.cn\//.test(url)) {
    const tabs = await new Promise<chrome.tabs.Tab[]>(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
    url = tabs[0]?.url || '';
  }
  if (!/^https:\/\/[^/]+\.feishu\.cn\//.test(url)) throw new Error('请先切换到已登录的飞书页面');
  const session = await cookie('session', url);
  if (!session) throw new Error('未能识别飞书登录会话，请登录后刷新页面');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `feishu-helper:v2:${new URL(url).hostname}:${hash}`;
}

function read<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => chrome.storage.local.get([key], data => {
    const error = chrome.runtime.lastError;
    error ? reject(new Error(error.message)) : resolve(data[key]);
  }));
}

function write(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => chrome.storage.local.set({ [key]: value }, () => {
    const error = chrome.runtime.lastError;
    error ? reject(new Error(error.message)) : resolve();
  }));
}

export async function getDocumentIndex(scope?: string): Promise<DocumentIndex | undefined> {
  return read<DocumentIndex>(`${scope ?? await getCacheScope()}:index`);
}

export async function saveDocumentIndex(index: DocumentIndex, scope: string): Promise<void> {
  if (await getCacheScope() !== scope) throw new Error('飞书登录会话已变化，请重新加载列表');
  await write(`${scope}:index`, index);
}

export async function getExcludedFolders(scope?: string): Promise<string[]> {
  const value = await read<unknown>(`${scope ?? await getCacheScope()}:excluded`);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function setExcludedFolders(tokens: string[], expectedScope?: string): Promise<void> {
  const scope = await getCacheScope();
  if (expectedScope && expectedScope !== scope) throw new Error('登录会话已变化，请重新打开设置');
  await write(`${scope}:excluded`, [...new Set(tokens)]);
}
