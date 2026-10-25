import React, { useState } from 'react';
import { Button, Tooltip, message } from 'antd';
import type { PlasmoCSConfig } from 'plasmo';
import { CACHE_MAX_AGE, getCacheScope, getDocumentIndex, getExcludedFolders } from '../services/document-cache';
import { loadAllFileList } from '../services/export-service';
import { getRoamCandidates } from '../services/roam-service';
import { createMenuContainer } from '../utils/menu-container';
import '../styles/content-menu.css';

export const config: PlasmoCSConfig = { matches: ['https://*.feishu.cn/*'], run_at: 'document_start' };
export const getRootContainer = () => createMenuContainer('roam');

const Roam: React.FC = () => {
  const [loading, setLoading] = useState(false);
  async function onRoamAround() {
    if (loading) return;
    setLoading(true);
    try {
      const scope = await getCacheScope();
      let index = await getDocumentIndex(scope);
      if (!index || Date.now() - index.loadedAt > CACHE_MAX_AGE) index = await loadAllFileList();
      const excluded = await getExcludedFolders(scope);
      if (await getCacheScope() !== scope) throw new Error('登录会话已变化，请重新加载文档列表');
      const files = getRoamCandidates(index.files, index.folders, excluded);
      if (!files.length) { message.warning('当前没有可漫游的文档，请检查排除目录设置'); return; }
      if (index.warnings.length) message.warning('部分目录读取失败，本次从已加载的文档中选择');
      window.open(files[Math.floor(Math.random() * files.length)].url, '_self');
    } catch (error) { message.error((error as Error)?.message || '文档漫游失败，请稍后重试'); }
    finally { setLoading(false); }
  }
  return <Tooltip title="文档漫游"><Button aria-label="文档漫游" className="feishu-helper-menu-button" type="text" loading={loading} disabled={loading} onClick={onRoamAround}>
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="8" cy="8" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="16" cy="16" r="1.6" fill="currentColor" /></svg>
  </Button></Tooltip>;
};

export default Roam;
