import React from 'react';
import type { ExportReport } from '../services/export-runner';

export interface DownloadArtifact { url: string; filename: string; }

/** Keep the result and real download anchors visible after asynchronous work. */
export function ExportResult({ report, archive, summary, error }: {
  report?: ExportReport;
  archive?: DownloadArtifact;
  summary?: DownloadArtifact;
  error?: string;
}) {
  if (!report && !error) return null;
  return <section aria-label="导出结果" style={{ padding: 12, marginBottom: 12, background: '#f6f8fa', borderRadius: 6 }}>
    <strong>导出结果</strong>
    {report && <p role="status">已处理 {report.total} 个文件，成功 {report.succeeded} 个，失败 {report.failed} 个。</p>}
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {archive && <a href={archive.url} download={archive.filename} style={{ marginRight: 16 }}>下载 ZIP</a>}
    {summary && <a href={summary.url} download={summary.filename}>下载结果清单</a>}
    {archive && <p style={{ marginTop: 8, marginBottom: 0 }}>文件已生成，请点击下载并保存到本地。</p>}
    {report && report.failed > 0 && <ul>{report.items.filter(item => item.status === 'failed').slice(0, 5).map(item => <li key={item.token}>{item.name}：{item.error}</li>)}</ul>}
  </section>;
}
