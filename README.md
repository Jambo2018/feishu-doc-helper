<h2 align="center"><img src="assets/icon.png" height="128"><br></h2>
<p align="center"><strong>飞书文档助手，支持批量导出飞书云文档及飞书知识库，文档随机漫游等功能。</strong></p>

## 本地优化版 1.0.7

本版修复了知识库父页面漏导出、失败仍提示全部成功、漫游目录排除错误，并增加分页检测、按登录会话隔离缓存、请求超时和失败重试入口。成功下载的文件会按原目录打包，同时附带 `_导出结果.json`，记录实际成功、失败和列表加载警告。

异步导出结束后，窗口会保留处理结果。请点击“下载 ZIP”保存文件，也可单独下载结果清单。生成压缩包不等于浏览器已经将文件保存到磁盘；失败原因会持续显示，便于重试。

工具栏为导出和漫游各保留独立按钮空间，避免框架的绝对定位使入口重叠。如果 Edge 开启了每次下载询问保存位置，请在下载面板点击“保存”完成落盘。

飞书在页面内部切换时会替换工具栏，本版会把原插件入口移到新工具栏；没有工具栏时在文档页面显示浮动入口，避免导航后入口消失。

本轮构建验证的是 Edge 版本。其他浏览器目录中的历史压缩包仍为上游版本，使用前请按下面命令重新构建，并检查 `manifest.json` 中的版本号。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:edge
```

构建后加载 `build/edge-mv3-feishu-doc-helper` 目录，或解压同名 ZIP 后加载。首次加载新版时会重新扫描，旧版未按账号隔离的缓存和排除设置不会自动迁移。

知识库父页面的正文会保存在同名目录中的同名文档里，子页面继续放在该目录下。遇到无法识别的分页信息时，会提示“列表可能不完整”，不能把此类导出当作完整备份。已知限制和验证范围见 [1.0.4 变更说明](docs/CHANGELOG-1.0.4.md)、[1.0.5 变更说明](docs/CHANGELOG-1.0.5.md)和 [1.0.7 变更说明](docs/CHANGELOG-1.0.7.md)。

## 安装

[![Chrome](https://img.shields.io/badge/-Chrome-brightgreen?logo=GoogleChrome)](./build/chrome-mv3-feishu-doc-helper.zip)
[![Edge](https://img.shields.io/badge/-Edge-blue?logo=MicrosoftEdge)](./build/edge-mv3-feishu-doc-helper.zip)
[![Firefox](https://img.shields.io/badge/-Firefox-brightgreen?logo=FirefoxBrowser)](./build/firefox-mv2-feishu-doc-helper.zip)
[![Brave](https://img.shields.io/badge/-Brave-yellow?logo=Brave)](./build/brave-mv3-feishu-doc-helper.zip)
[![Opera](https://img.shields.io/badge/-Opera-red?logo=Opera)](./build/opera-mv3-feishu-doc-helper.zip)

1. 首先，点击上方图标，下载你需要的浏览器插件压缩包。下载好后解压到某个文件夹（比如 `feishu-doc-helper`）。
   ![image-20230603145959878](https://cdn.jsdelivr.net/gh/sancijun/images/pics/image-20240106180600650.png)
   [百度云下载地址（可能不是最新版）](https://pan.baidu.com/s/15V-Zd6IpqgJhOTV9FuH4mA?pwd=fnmv)
2. 接下来，进入 Chrome 在地址栏输入 `chrome://extensions/` 后回车，进入扩展管理页面。
3. 进入页面后，先打开 `开发者模式`，再点击 `加载已解压的扩展程序`，找到前面解压得到的文件夹 `feishu-doc-helper`，**单击**该文件夹，这时候文件夹被选中，点击 `选择文件夹` 即可。

## 功能

1. 批量导出飞书文档：批量（全量）导出飞书云文档，飞书云文档中的数据更加可控。
   ![image-20240113130329864](https://cdn.jsdelivr.net/gh/sancijun/images/pics/image-20240113130329864.png)
2. 文档随机漫游：随机打开一篇飞书云文档，用于复习云文档中的内容，可以进一步总结整理文档之间的关系，构建自己的知识图谱。
3. 更多功能开发中，你可以在插件关于页面，提出你的功能建议。

## FQA

1. 为什么导出选项看不到目录列表：首次点击导出或漫游时需要扫描目录。请等待加载完成，失败时会显示具体原因。
2. 为什么看不到最新的文档：打开导出窗口或执行漫游时会检查缓存，超过一小时会重新扫描。需要立即更新时，可在导出窗口手动刷新。

## 相关工具

如果你需要批量整理从飞书导出的文档文件名，可以试用 [RenamerX](https://renamerx.com/)——它使用本地优先的 AI 工作流按内容生成可审阅的文件名，支持 macOS 和 Windows。

## 更多内容

**来都来了，总得带点好东西走呀~**

[全网唯一支持导出图文的微信读书插件，还可以同步 Notion，惊艳](https://www.bilibili.com/video/BV1sM4y1Y74k "微信读书工具箱")

[我开发了一款 Obsidian 图床插件，全都进来薅羊毛！](https://www.bilibili.com/video/BV15P411a7C6)

[一张图进阶 RocketMQ 系列，妥妥的收藏级宝藏系列！](https://www.bilibili.com/video/BV1534y157RF)

## 联系作者

使用过程中有任何问题您可以通过以下方式联系 三此君。

![联系三此君](https://img2022.cnblogs.com/blog/2740513/202207/2740513-20220706204136402-778725152.webp)
