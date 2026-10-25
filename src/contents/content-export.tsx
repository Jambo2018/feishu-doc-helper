import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Tooltip, Modal, Tree, notification, Progress } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShareFromSquare } from '@fortawesome/free-regular-svg-icons';
import { faRefresh } from '@fortawesome/free-solid-svg-icons';
import type { PlasmoCSConfig } from 'plasmo';
import JSZip from 'jszip';
import { ExportResult, type DownloadArtifact } from '../components/export-result';
import { getTreeData, loadAllFileList } from '../services/export-service';
import { CACHE_MAX_AGE, getCacheScope, getDocumentIndex } from '../services/document-cache';
import { runExportQueue, type ExportReport } from '../services/export-runner';
import * as backend from '../api/feishu-api';
import type { TreeDataNode } from '../types/feishu';
import { getCurrentTimestamp } from '../utils/common';
import { createMenuContainer } from '../utils/menu-container';
import '../styles/content-menu.css';

export const config: PlasmoCSConfig = { matches: ['https://*.feishu.cn/drive/*', 'https://*.feishu.cn/wiki/*'], run_at: 'document_idle' };
export const getRootContainer = () => createMenuContainer('export');

const Menu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<TreeDataNode[]>([]);
  const [checked, setChecked] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [failedTokens, setFailedTokens] = useState<string[]>([]);
  const failedScope = useRef('');
  const exportingNow = useRef(false);
  const [lastReport, setLastReport] = useState<ExportReport>();
  const [archiveLink, setArchiveLink] = useState<DownloadArtifact>();
  const [summaryLink, setSummaryLink] = useState<DownloadArtifact>();
  const [resultError, setResultError] = useState('');
  const objectUrls = useRef<string[]>([]);
  const [api, contextHolder] = notification.useNotification();
  const errorText = (error: unknown) => (error as Error)?.message || '操作失败，请稍后重试';
  useEffect(() => () => objectUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  function clearDownloads() {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setArchiveLink(undefined);
    setSummaryLink(undefined);
  }
  function makeLink(content: Blob, filename: string): DownloadArtifact {
    const url = URL.createObjectURL(content);
    objectUrls.current.push(url);
    return { url, filename };
  }

  async function showModal(force = false) {
    if (loading || exporting) return;
    setLoading(true);
    try {
      const scope = await getCacheScope();
      let index = await getDocumentIndex(scope);
      if (force || !index || Date.now() - index.loadedAt > CACHE_MAX_AGE) index = await loadAllFileList();
      const data = await getTreeData(scope);
      if (await getCacheScope() !== scope) throw new Error('登录会话已变化，请重新打开导出窗口');
      if (failedScope.current && failedScope.current !== scope) {
        clearDownloads(); setLastReport(undefined); setFailedTokens([]); setResultError('');
        failedScope.current = '';
        api.destroy('export-progress');
      }
      setTree(data);
      setWarnings(index.warnings);
      setChecked([]);
      setOpen(true);
    } catch (error) {
      api.error({ message: '文件列表加载失败', description: errorText(error), duration: 8 });
    } finally { setLoading(false); }
  }

  async function onExportDocs(tokens: string[], retry = false) {
    if (exportingNow.current) return;
    exportingNow.current = true;
    setExporting(true);
    let report: ExportReport | undefined;
    try {
      const scope = await getCacheScope();
      if (retry && failedScope.current !== scope) throw new Error('登录会话已变化，请重新选择文件');
      const index = await getDocumentIndex(scope);
      if (!index) throw new Error('当前会话没有文档列表，请刷新列表');
      const wanted = new Set(tokens);
      const files = index.files.filter(file => wanted.has(file.obj_token));
      if (!files.length) throw new Error('请至少选择一个文档');
      if (files.length !== wanted.size) throw new Error('部分所选文件已不在列表中，请刷新后重新选择');
      clearDownloads(); setLastReport(undefined); setResultError('');
      setOpen(false);
      const zip = new JSZip();
      api.info({ key: 'export-progress', message: '正在准备导出', description: `共 ${files.length} 个文件`, duration: 0 });
      const assertScope = async () => {
        if (await getCacheScope() !== scope) throw new Error('登录会话已变化，本文件已停止导出');
      };
      report = await runExportQueue(files, {
        createExportTask: async file => { await assertScope(); return backend.createExportTask(file); },
        waitForExportResult: async (ticket, token, type) => { await assertScope(); return backend.waitForExportResult(ticket, token, type); },
        download: async (url, type) => { await assertScope(); return backend.download(url, type); }
      }, zip, progress => api.info({
        key: 'export-progress', message: `已处理 ${progress.completed}/${progress.total}，成功 ${progress.succeeded}，失败 ${progress.failed}`,
        description: <><div>{progress.name}</div><Progress percent={Math.round(progress.completed / progress.total * 100)} /></>, duration: 0
      }));
      setLastReport(report);
      failedScope.current = scope;
      const failed = report.items.filter(item => item.status === 'failed').map(item => item.token);
      setFailedTokens(failed);
      let archive: DownloadArtifact | undefined;
      if (report.succeeded) {
        zip.file('_导出结果.json', JSON.stringify({ exportedAt: new Date().toISOString(), listWarnings: index.warnings, ...report }, null, 2));
        const content = await zip.generateAsync({ type: 'blob' });
        archive = makeLink(content, `飞书文档导出-${getCurrentTimestamp()}.zip`);
        setArchiveLink(archive);
      }
      setSummaryLink(makeLink(new Blob([JSON.stringify({ ...report, archiveGenerated: Boolean(archive), listWarnings: index.warnings }, null, 2)], { type: 'application/json' }), `飞书导出结果-${getCurrentTimestamp()}.json`));
      setChecked([]);
      setOpen(true);
      const description = <>
        <div>成功 {report.succeeded} 个，失败 {report.failed} 个。</div>
        {archive && <a href={archive.url} download={archive.filename}>下载 ZIP</a>}
        {failed.length > 0 && <Button onClick={() => onExportDocs(failed, true)}>仅重试失败文件</Button>}
        {report.failed > 0 && <div>{report.items.filter(item => item.status === 'failed').slice(0, 3).map(item => <div key={item.token}>{item.name}：{item.error}</div>)}</div>}
      </>;
      if (!report.succeeded) api.error({ key: 'export-progress', message: '没有文件导出成功', description, duration: 0 });
      else if (report.failed) api.warning({ key: 'export-progress', message: '部分文件导出成功', description, duration: 0 });
      else api.success({ key: 'export-progress', message: '文件已生成，请点击下载', description, duration: 0 });
    } catch (error) {
      const message = errorText(error);
      setResultError(message);
      if (report) setSummaryLink(makeLink(new Blob([JSON.stringify({ ...report, archiveGenerated: false, archiveError: message }, null, 2)], { type: 'application/json' }), `飞书导出结果-${getCurrentTimestamp()}.json`));
      setOpen(true);
      api.error({ key: 'export-progress', message: '导出失败', description: message, duration: 0 });
    } finally { exportingNow.current = false; setExporting(false); }
  }

  return <>
    {contextHolder}
    <Tooltip title="批量导出"><Button aria-label="批量导出" className="feishu-helper-menu-button" type="text" loading={loading || exporting} disabled={loading || exporting} onClick={() => showModal()} icon={<FontAwesomeIcon icon={faShareFromSquare} />} /></Tooltip>
    <Modal title={<div>选择要导出的文件 <Button aria-label="刷新文件列表" type="text" icon={<FontAwesomeIcon icon={faRefresh} />} loading={loading} disabled={exporting} onClick={() => showModal(true)} /></div>}
      open={open} width={650} onCancel={() => { setOpen(false); setChecked([]); }} okText="开始导出" cancelText="取消"
      okButtonProps={{ disabled: loading || exporting || !checked.some(key => String(key).startsWith('file:')) }}
      onOk={() => onExportDocs(checked.map(String).filter(key => key.startsWith('file:')).map(key => key.slice(5)))}>
      {warnings.length > 0 && <Alert type="warning" showIcon message="部分目录读取失败，当前列表可能不完整" description={<div>{warnings.slice(0, 5).map((warning, i) => <div key={i}>{warning}</div>)}</div>} />}
      <ExportResult report={lastReport} archive={archiveLink} summary={summaryLink} error={resultError} />
      {failedTokens.length > 0 && <div style={{ margin: '12px 0' }}><Button disabled={exporting} onClick={() => onExportDocs(failedTokens, true)}>重试 {failedTokens.length} 个失败文件</Button></div>}
      <Tree checkable selectable={false} treeData={tree} checkedKeys={checked} onCheck={keys => setChecked(Array.isArray(keys) ? keys : keys.checked)} height={380} blockNode disabled={loading || exporting} />
    </Modal>
  </>;
};

export default Menu;
