export class RequestError extends Error {
  constructor(message: string, public retryable = false, public status?: number) {
    super(message);
    this.name = 'RequestError';
  }
}

export interface RequestOptions {
  attempts?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  pause?: (ms: number) => Promise<void>;
}

/** Only idempotent reads retry automatically; export creation is sent once. */
export async function request<T>(url: string, init: RequestInit = {}, kind: 'json' | 'blob' = 'json', options: RequestOptions = {}): Promise<T> {
  const attempts = options.attempts ?? ((init.method || 'GET').toUpperCase() === 'GET' ? 3 : 1);
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
    try {
      const response = await (options.fetcher ?? fetch)(url, { credentials: 'include', ...init, signal: controller.signal });
      if (!response.ok) {
        throw new RequestError(`请求失败（HTTP ${response.status}）`, response.status === 429 || response.status >= 500, response.status);
      }
      if (kind === 'json') {
        const data = await response.json();
        if (!data || typeof data !== 'object') throw new RequestError('接口未返回有效数据');
        if (typeof data.code === 'number' && data.code !== 0) {
          throw new RequestError(data.msg || data.message || `飞书接口返回错误 ${data.code}`);
        }
        return data as T;
      }
      const contentType = response.headers.get('content-type') || '';
      if (/application\/json|text\/html/i.test(contentType)) {
        throw new RequestError('下载接口未返回文件，请检查登录状态和导出权限');
      }
      const blob = await response.blob();
      if (!blob.size) throw new RequestError('下载结果为空', true);
      return blob as T;
    } catch (error) {
      const failure = error instanceof RequestError ? error : new RequestError(
        (error as Error)?.name === 'AbortError' ? '请求超时，请稍后重试' : (error as Error)?.message || '网络请求失败',
        error instanceof TypeError || (error as Error)?.name === 'AbortError'
      );
      if (!failure.retryable || attempt + 1 >= attempts) throw failure;
    } finally {
      clearTimeout(timer);
    }
    await pause(500 * 2 ** attempt);
  }
  throw new RequestError('请求未执行');
}
