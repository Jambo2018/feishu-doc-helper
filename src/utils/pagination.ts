type Page = { code?: number; data: Record<string, any> };

/** A missing or repeated cursor is an error, never a successful full scan. */
export async function collectPages<T extends Page>(initialUrl: string, read: (url: string) => Promise<T>): Promise<T[]> {
  let url = new URL(initialUrl);
  const seen = new Set<string>();
  const pages: T[] = [];
  for (let count = 0; count < 1000; count++) {
    const page = await read(url.href);
    if (!page?.data) throw new Error('列表接口未返回有效数据');
    pages.push(page);
    const data = page.data;
    if (!(data.has_more ?? data.hasMore)) return pages;
    const next = [
      ['last_label', data.last_label],
      ['page_token', data.next_page_token],
      ['cursor', data.next_cursor]
    ].find(([, value]) => value !== undefined && value !== null && String(value) !== '');
    if (!next) throw new Error('飞书列表仍有下一页，但未返回可识别的分页标记，列表可能不完整');
    const [key, value] = next;
    const cursor = `${key}:${value}`;
    if (seen.has(cursor)) throw new Error('飞书列表分页标记重复，已停止扫描以避免遗漏或死循环');
    seen.add(cursor);
    url = new URL(initialUrl);
    url.searchParams.set(String(key), String(value));
  }
  throw new Error('列表分页超过安全上限，请缩小导出范围');
}

export function mergeExplorerPages(pages: Page[]) {
  const nodeIds = new Set<string>();
  const nodes: Record<string, any> = {};
  for (const page of pages) {
    if (!Array.isArray(page.data.node_list) || !page.data.entities?.nodes) {
      throw new Error('文件列表结构发生变化，请更新插件后重试');
    }
    for (const id of page.data.node_list) nodeIds.add(id);
    Object.assign(nodes, page.data.entities.nodes);
  }
  return {
    ...pages[0],
    data: { ...pages[0].data, node_list: [...nodeIds], entities: { ...pages[0].data.entities, nodes }, has_more: false }
  };
}
