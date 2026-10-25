import React, { useState, useEffect, useRef } from 'react';
import { Alert, Card, Typography, Button, Popover, Tree } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBilibili, faTiktok, faWeixin } from '@fortawesome/free-brands-svg-icons';
import { getTreeData } from '~services/export-service';
import type { TreeDataNode } from '~types/feishu';
import { getCacheScope, getExcludedFolders, setExcludedFolders } from './services/document-cache';
import { onlyFolders } from './services/roam-service';

import { analytics } from './utils/baidu-analytics';

const { Paragraph } = Typography;

/**
 * “关于”页面内容组件
 * @constructor
 */
const AboutPageContent = () => {
  const popoverContent = {
    bilibili: <img src={chrome.runtime.getURL("assets/qrcode/qrcode_bilibili.png")} alt="Bilibili" style={{ width: '150px', height: '150px' }} />,
    redbook: <img src={chrome.runtime.getURL("assets/qrcode/qrcode_xiaohongshu.png")} alt="小红书" style={{ width: '150px', height: '150px' }} />,
    tiktok: <img src={chrome.runtime.getURL("assets/qrcode/qrcode_douyin.png")} alt="抖音" style={{ width: '150px', height: '150px' }} />,
    gzh: <img src={chrome.runtime.getURL("assets/qrcode/qrcode_gzh.png")} alt="公众号" style={{ width: '150px', height: '150px' }} />,
    wechat: <img src={chrome.runtime.getURL("assets/qrcode/qrcode_weixin.png")} alt="微信号" style={{ width: '150px', height: '150px' }} />,
  };

  const openLink = (url) => {
    // 统计外部链接点击
    analytics.trackFeatureUsage('external_link').catch(console.warn);
    chrome.tabs.create({ url });
  };

  return (
    <div style={{ padding: '10px', width: '350px' }}>
      <Paragraph>
        我是三此君，6 年大厂程序员，独立开发者，AI 创业者，环国自驾中，在路上探索与创造。
      </Paragraph>
      <Paragraph>
        分享独立开发的产品，AI 创业实录，环国旅行见闻。
      </Paragraph>
      <Paragraph>
        访问我的<Button type="link" onClick={() => openLink("https://sancijun.com/")} style={{ padding: 0 }}> 个人网站 </Button>了解更多内容，获取<Button type="link" onClick={() => openLink("https://sancijun.com/create")} style={{ padding: 0 }}>更多资源</Button>~
      </Paragraph>

      <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <Button onClick={() => openLink("https://sancijun.com/create/feishu-doc-helper")}>
          使用说明
        </Button>
        <Button type="primary" ghost onClick={() => openLink("https://github.com/sancijun/feishu-doc-helper/issues/new?assignees=&labels=enhancement&projects=&template=---feature.md&title=%5BFeature%5D+")} style={{ marginRight: '8px' }}>
          功能建议
        </Button>
        <Button danger onClick={() => openLink("https://github.com/sancijun/feishu-doc-helper/issues/new?assignees=&labels=&projects=&template=---bug.md&title=%5BBug%5D+")}>
          缺陷反馈
        </Button>
      </div>

      <div style={{ display: 'flex', marginTop: '12px' }}>
        <Popover content={popoverContent.wechat} title="三此君个人微信">
          <Button type="text" style={{ padding: '5px', fontSize: '13px' }}>
            微信号
          </Button>
        </Popover>
        <Popover content={popoverContent.bilibili} title="三此君B站号">
          <Button type="text" icon={<FontAwesomeIcon icon={faBilibili} />} onClick={() => openLink("https://space.bilibili.com/96271327/")} style={{ padding: '5px', fontSize: '13px' }}>
            B站
          </Button>
        </Popover>
        <Popover content={popoverContent.redbook} title="三此君小红书号">
          <Button type="text" onClick={() => openLink("https://www.xiaohongshu.com/user/profile/5b81915b712ac00001e5ee82")} style={{ padding: '5px', fontSize: '13px' }}>
            小红书
          </Button>
        </Popover>
        <Popover content={popoverContent.tiktok} title="三此君抖音号">
          <Button type="text" icon={<FontAwesomeIcon icon={faTiktok} />} onClick={() => openLink("https://v.douyin.com/IrHMn1JB7S0/")} style={{ padding: '5px', fontSize: '13px' }}>
            抖音
          </Button>
        </Popover>
        <Popover content={popoverContent.gzh} title="三此君公众号">
          <Button type="text" icon={<FontAwesomeIcon icon={faWeixin} />} style={{ padding: '5px', fontSize: '13px' }}>
            公众号
          </Button>
        </Popover>
      </div>
    </div>
  );
}

/**
 * “设置”页面内容组件
 * @constructor
 */
function SettingsPageContent() {
  console.log('SettingsPageContent: 渲染“设置”页面');
  const [treeData, setTreeData] = useState<TreeDataNode[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [settingsError, setSettingsError] = useState('');
  const [saving, setSaving] = useState(false);
  const settingsScope = useRef('');

  useEffect(() => {
    /**
     * 加载数据
     */
    const loadData = async () => {
      console.log('SettingsPageContent.loadData: 开始加载数据');
      try {
        // 获取树形数据
        const scope = await getCacheScope();
        const [data, excluded] = await Promise.all([getTreeData(scope), getExcludedFolders(scope)]);
        if (await getCacheScope() !== scope) throw new Error('登录会话已变化，请重新打开设置');
        settingsScope.current = scope;
        setTreeData(onlyFolders(data));
        setCheckedKeys(excluded);
        setSettingsError('');
      } catch (error) {
        setSettingsError((error as Error)?.message || '设置加载失败');
      }
    };

    loadData();
  }, []);

  /**
   * Tree 组件 check 事件处理
   * @param checkedKeysValue
   */
  const handleTreeCheck = async (checkedKeysValue: React.Key[] | { checked: React.Key[]; halfChecked: React.Key[] }) => {
    setSaving(true);
    try {
      const keys = (Array.isArray(checkedKeysValue) ? checkedKeysValue : checkedKeysValue.checked).map(String);
      await setExcludedFolders(keys, settingsScope.current);
      setCheckedKeys(keys);
      setSettingsError('');
    } catch (error) {
      setSettingsError((error as Error)?.message || '设置保存失败');
    } finally { setSaving(false); }
  };

  return (
    <>
      <Paragraph style={{ fontSize: '15px', padding: '5px' }}>
        选择文档漫游需要排除的目录，文档漫游时，选中目录下的文档将不会被打开。
      </Paragraph>
      {settingsError && <Alert type="error" message={settingsError} />}
      <div style={{ 
        border: '1px solid #d9d9d9', 
        borderRadius: '6px', 
        padding: '8px', 
        marginTop: '10px', 
        marginBottom: '20px',
        maxHeight: '300px',
        overflowY: 'auto'
      }}>
        {treeData.length > 0 ? (
          <Tree
            checkable
            disabled={saving}
            treeData={treeData}
            checkedKeys={checkedKeys}
            onCheck={handleTreeCheck}
            style={{ width: '100%' }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
            暂无目录，请在飞书页面打开“批量导出”加载列表
          </div>
        )}
      </div>
    </>
  );
}

const tabList = [
  {
    key: 'tab1',
    tab: '关于',
  },
  {
    key: 'tab2',
    tab: '设置',
  },
];

const contentList: Record<string, React.ReactNode> = {
  tab1: <AboutPageContent />,
  tab2: <SettingsPageContent />,
};

/**
 * Popup 页面主组件
 * @constructor
 */
const PopupPage: React.FC = () => {
  console.log('PopupPage: 渲染 Popup 页面');
  const [activeTabKey, setActiveTabKey] = useState<string>('tab1');

  useEffect(() => {
    analytics.trackPageView('/popup', '插件弹窗');
  }, []);

  /**
   * Tab 切换事件处理
   * @param {string} key - 当前激活的 tab key
   */
  const onTabChange = (key: string) => {
    console.log(`onTabChange: 切换到 Tab: ${key}`);
    setActiveTabKey(key);
  };

  return (
    <Card
      style={{ width: '380px' }}
      tabList={tabList.map(tab => ({
        ...tab,
        key: tab.key,
        tab: <div style={{ width: '125px', display: 'flex', justifyContent: 'center' }}>{tab.tab}</div>, // 设置标签宽度
      }))}
      activeTabKey={activeTabKey}
      onTabChange={onTabChange}
    >
      {contentList[activeTabKey]}

    </Card>
  );
};

export default PopupPage;
