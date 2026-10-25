import type { FeishuFile } from '../types/feishu';
import { reserveArchivePath } from '../utils/archive-path';

export interface ExportBackend {
  createExportTask(file: { token: string; obj_type: number }): Promise<string | null>;
  waitForExportResult(ticket: string, token: string, type: number): Promise<{ url: string; type: string } | null>;
  download(url: string, type?: string): Promise<Blob | null>;
}
export interface ExportItemResult {
  token: string;
  name: string;
  status: 'success' | 'failed';
  path?: string;
  error?: string;
}
export interface ExportReport {
  total: number;
  succeeded: number;
  failed: number;
  items: ExportItemResult[];
}
export interface ExportProgress { total: number; completed: number; succeeded: number; failed: number; name: string; }

export async function runExportQueue(
  files: FeishuFile[], backend: ExportBackend, archive: { file(path: string, content: Uint8Array): unknown },
  onProgress: (value: ExportProgress) => void = () => {}, concurrency = 2
): Promise<ExportReport> {
  const unique = [...new Map(files.map(file => [file.obj_token, file])).values()];
  const items: ExportItemResult[] = new Array(unique.length);
  const usedPaths = new Set<string>();
  let next = 0, completed = 0, succeeded = 0, failed = 0;
  async function worker() {
    while (next < unique.length) {
      const index = next++;
      const file = unique[index];
      try {
        const ticket = await backend.createExportTask({ token: file.obj_token, obj_type: file.obj_type });
        if (!ticket) throw new Error('创建导出任务失败');
        const result = await backend.waitForExportResult(ticket, file.obj_token, file.obj_type);
        if (!result?.url) throw new Error('等待导出结果失败或超时');
        const content = await backend.download(result.url, result.type);
        if (!content || content.size === 0) throw new Error('文件下载失败或内容为空');
        const archivePath = reserveArchivePath(file.path, file.name, result.type, usedPaths);
        archive.file(archivePath, new Uint8Array(await content.arrayBuffer()));
        items[index] = { token: file.obj_token, name: file.name, status: 'success', path: archivePath };
        succeeded++;
      } catch (error) {
        items[index] = { token: file.obj_token, name: file.name, status: 'failed', error: (error as Error)?.message || '导出失败' };
        failed++;
      }
      completed++;
      onProgress({ total: unique.length, completed, succeeded, failed, name: file.name });
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), unique.length) }, () => worker()));
  return { total: unique.length, succeeded, failed, items };
}
