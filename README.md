# 门店流量分析报告生成器

一键从门店截图生成专业流量分析报告的在线工具。

## 功能

- **AI 智能提取**：上传大众点评、美团、高德地图等任意来源截图，多模态 AI 自动识别并提取门店数据
- **8大分析模块**：门店基础信息、POI竞争密度、月度流量趋势、景区流量预测、消费人群画像、时段热力分布、核心发现与经营建议、竞品对比
- **可视化编辑**：AI 提取后所有字段均可手动修正，确保数据准确
- **高德卖点植入**：经营建议中自动植入高德地图搜索优化、导航闭环等话术
- **独立 HTML 报告**：生成的报告为独立 HTML 文件，零依赖，可直接浏览器打开
- **一键复制图片**：报告内置 html2canvas，支持一键复制为图片方便 IM 分享

## GitHub Pages 部署

1. 在 GitHub 创建新仓库（如 `store-report-tool`）
2. 将本项目所有文件推送到仓库：
   ```bash
   git init
   git add .
   git commit -m "init: 门店流量分析报告生成器"
   git remote add origin git@github.com:你的用户名/store-report-tool.git
   git push -u origin main
   ```
3. 进入仓库 Settings → Pages → Source 选择 `main` 分支 → Save
4. 等待部署完成，访问 `https://你的用户名.github.io/store-report-tool/`

## 本地使用

直接用浏览器打开 `index.html` 即可。

## 支持的 AI 服务商

| 服务商 | 模型 | 说明 |
|--------|------|------|
| 通义千问 | qwen-vl-max | 阿里云 DashScope，推荐 |
| Moonshot | moonshot-v1-128k-vision | 月之暗面 |
| 智谱 GLM | glm-4v-plus | 清华系 |
| DeepSeek | deepseek-chat | 深度求索 |
| OpenAI | gpt-4o | 需要海外 API Key |
| 自定义 | 任意 | 任何 OpenAI 兼容接口 |

所有 API 调用均在浏览器端完成，API Key 仅保存在用户本地浏览器 localStorage 中。
