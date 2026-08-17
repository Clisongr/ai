# 智析 · AI 数据自由分析台（Demo）

> 让数据分析自由化：不写代码、不问 SQL，用一句日常语言就能完成统计、解读与可视化。

这是一个基于数据分析的 **AI 自由化应用 Demo**。核心主张是：把"分析师能力"下放给每个人——
用户上传数据后，可以完全自由地用自然语言提问（中英文均可），AI 自动识别意图、执行真实统计计算、
生成结论并匹配最合适的图表；同时自动产出一份"数据体检报告"，主动给出值得深挖的洞察。

![欢迎页](docs/screenshot-welcome.png)

## 快速开始

环境要求：Node.js 18+（开发环境为 Node 24）。

```bash
cd ai-data-freedom-demo
npm install        # 安装依赖（express / multer / echarts）
npm run generate-sample   # 生成内置样例数据（1075 行零售订单）
npm start          # 启动服务
```

浏览器打开 <http://localhost:3000> 即可使用。服务启动时会自动加载内置样例数据，
也可以直接点击页面上方的「上传 CSV」加载自己的数据。
若本机存在 `.env` 并配置了大模型密钥，页面右上角会显示「🤖 已接入 deepseek-chat」，
每次回答末尾会追加一段 AI「自由解读」。

![对比排行](docs/screenshot-ranking.png)

## 功能清单

| 能力 | 说明 |
| --- | --- |
| 💬 自由提问 | 中文/英文自然语言提问，无需懂任何分析语法 |
| 📈 趋势分析 | 按时间聚合销售额/销量/利润等指标，识别峰谷与整体涨跌 |
| 🏆 对比排行 | 各地区/品类/渠道等维度的 TOP 排行与头部集中度 |
| 🥧 占比分布 | 维度占比构成，评估结构是否均衡 |
| 🔗 相关性分析 | 任意两个数值指标的 Pearson 相关与散点拟合 |
| 🔮 预测外推 | 基于线性回归对未来 3 期做参考性预测 |
| ⚠️ 异常检测 | 按周期做 z-score 离群点检测，标注异常月份 |
| 📊 整体分析 | 核心指标卡 + 头部贡献 + 趋势判断 |
| 🤖 自动洞察 | 数据加载后自动扫描，输出数据规模/核心指标/TOP/关联/趋势等体检报告 |
| ⬆ 上传 CSV | 支持任意结构的 CSV（自动推断数值列与维度列），GBK/UTF-8 均可 |

## 试试这些提问

- 哪个地区的销售额最高？
- 各品类销售额占比如何？
- 销售额的月度趋势怎么样？
- 预测未来三个月的销售额
- 销售额和利润的相关性如何？
- 销售额有哪些异常月份？
- 帮我做一个整体分析
- Show monthly sales trend（英文也可以）

## 技术架构

```
浏览器（Vanilla JS + ECharts 6）
        │  fetch / JSON
        ▼
Express 服务端
  ├─ lib/csv.js       CSV 解析（引号/分隔符/类型推断/GBK 兜底）
  ├─ lib/stats.js     统计库（描述统计/聚合/Pearson/线性回归/z-score）
  ├─ lib/nlp.js       NL 分析引擎（意图识别→字段解析→计算→结论生成）
  ├─ lib/insights.js  自动洞察生成器
  └─ lib/llm.js       可选大模型接入（默认离线，规则引擎即可完整运行）
```

## 接入真实大模型（DeepSeek，可选）

内置的规则引擎保证 Demo **离线即可完整运行**；若想体验大模型"自由解读"，
在项目根目录创建 `.env`（**该文件已被 .gitignore 排除，不会上传 GitHub**）：

```ini
LLM_API_KEY=sk-你的密钥
LLM_BASE_URL=https://api.deepseek.com   # 任意 OpenAI 兼容服务均可
LLM_MODEL=deepseek-chat
```

配置后，每次回答会在统计结论之外追加一段 AI「自由解读」。调用失败时自动回退到内置引擎，不影响使用。

> ⚠️ 安全提示：`.env` 中的密钥请勿提交到 GitHub。`.gitignore` 已包含 `.env`，
> 提交前可用 `git status` 确认没有出现该文件；若密钥曾在聊天/日志中明文出现过，
> 建议在 DeepSeek 控制台重置后再投入使用。

## 目录结构

```
ai-data-freedom-demo/
├─ server.js               # Express 服务与 API
├─ lib/                    # 后端分析引擎
├─ public/                 # 前端（index.html / css / js）
├─ scripts/                # 样例数据生成、浏览器 QA、截图脚本
├─ data/sample.csv         # 内置样例数据（由脚本生成）
└─ docs/                   # 演示截图
```

## 验证方式

项目内置了无头浏览器端到端检查（需要本机装有 Chrome）：

```bash
npm run qa
```

覆盖 18 项断言：界面渲染、意图识别、图表真实绘制像素、无控制台错误等。

## 部署到 GitHub Pages（纯浏览器版）

项目内附带一个**无后端静态版**（位于 `docs/`），所有统计与意图识别都在浏览器本地完成，
可直接部署到 GitHub Pages，得到一个可分享的在线演示链接。

本地预览：

```bash
npm run preview:pages   # -> http://localhost:8080
```

部署步骤：

1. 把项目推送到 GitHub（`docs/` 已在仓库内）
2. 仓库页面：**Settings → Pages → Build and deployment → Source** 选
   **Deploy from a branch**，Branch 选 `main`，目录选 **`/docs`**，保存
3. 等待 1-2 分钟，访问 `https://<你的用户名>.github.io/ai/`（仓库名为 `ai`）

> 说明：
> - GitHub Pages 免费版要求仓库为 Public
> - 静态版为纯浏览器计算，**不会**调用云端大模型（密钥不能放进网页），
>   因此也没有"AI 自由解读"段落；规则引擎的完整分析能力不受影响
> - 上传的 CSV 只在本机浏览器内处理，不会上传到任何服务器

## 后续可扩展方向

- 接入真实 LLM 后支持更开放的追问与多轮上下文
- 增加 Excel/JSON/数据库直连等更多数据源
- 支持自然语言生成分析报告（Word/PPT 导出）
- 图表交互下钻（点击柱子继续追问）
