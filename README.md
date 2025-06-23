# GET笔记自动同步到飞书多维表格

> 使用GitHub Action实现GET笔记到飞书多维表格的自动化同步

## 功能特性

- 🚀 **自动化同步**：每日北京时间21点自动执行
- 🔒 **安全配置**：使用GitHub Secrets管理敏感信息
- 📊 **智能去重**：只同步新增笔记，避免重复导入
- 🛠️ **零依赖**：仅使用Node.js内置模块
- 📱 **结果通知**：可选的飞书群聊通知功能
- 🧪 **配置测试**：提供配置验证工具

## 快速开始

### 1. Fork仓库
将本仓库Fork到你的GitHub账号下。

### 2. 配置GitHub Secrets
在你的仓库中，进入 `Settings` > `Secrets and variables` > `Actions`，添加以下Secrets：



   | Secret名称 | 说明 | 获取方式 |
   |-----------|------|----------|
   | `GET_NOTES_TOKEN` | GET笔记API访问令牌 | 从GET笔记应用中获取 |
   | `FEISHU_APP_ID` | 飞书应用ID | 飞书开放平台创建应用后获取 |
   | `FEISHU_APP_SECRET` | 飞书应用密钥 | 飞书开放平台应用管理页面获取 |
   | `FEISHU_APP_TOKEN` | 飞书多维表格App Token | 飞书多维表格设置中获取 |
   | `FEISHU_TABLE_ID` | 飞书多维表格ID | 飞书多维表格URL中获取 |
   | `FEISHU_WEBHOOK_URL` | 飞书群聊机器人Webhook（可选） | 用于接收同步结果通知 |

### 3. 启用GitHub Actions
确保你的仓库已启用GitHub Actions功能。

### 4. 测试运行
在 `Actions` 页面手动触发 "同步GET笔记到飞书多维表格" 工作流进行测试。

#### 获取配置信息

**GET笔记Token获取：**
- 登录GET笔记网页版
- 打开浏览器开发者工具
- 查看网络请求中的Authorization头部信息

**飞书配置获取：**
- 访问[飞书开放平台](https://open.feishu.cn/)
- 创建企业自建应用
- 获取App ID和App Secret
- 在多维表格中获取App Token和Table ID

#### 工作流说明

- **执行时间**：每日北京时间23:00（UTC 15:00）
- **执行内容**：自动获取GET笔记并同步到飞书多维表格
- **重复处理**：自动跳过已导入的笔记，只同步新增笔记
- **错误处理**：同步失败时会在Actions日志中显示详细错误信息
- **通知功能**：可选配置飞书群聊机器人接收同步结果通知

#### 手动执行

除了定时执行外，你也可以随时手动触发同步：

1. 进入仓库的 `Actions` 页面
2. 选择 "同步GET笔记到飞书多维表格" 工作流
3. 点击 "Run workflow" 按钮
4. 可选择是否为测试运行（测试运行不会实际导入数据）

## 本地测试

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑.env文件，填入你的配置信息
# 然后加载环境变量并测试
source .env

# 测试配置是否正确
node scripts/test-config.js

# 运行同步脚本
node scripts/sync-notes.js
```

## 注意事项

1. **数据安全**：请妥善保管你的API Token和应用密钥，不要在代码中硬编码
2. **同步频率**：默认每日23点执行一次，避免过于频繁的API调用
3. **网络环境**：GitHub Actions运行在海外服务器，请确保API接口可正常访问
4. **错误处理**：如遇同步失败，请查看Actions日志获取详细错误信息
5. **数据备份**：建议定期备份飞书多维表格数据

## 故障排除

### 常见问题

**Q: GitHub Action执行失败，提示Token无效**
A: 请检查GitHub Secrets中的Token是否正确设置，GET笔记Token可能已过期

**Q: 飞书API调用失败**
A: 请确认飞书应用权限配置正确，需要多维表格的读写权限

**Q: 同步的笔记数据不完整**
A: 请检查飞书多维表格的字段配置是否与脚本中的字段映射一致

**Q: 定时任务没有执行**
A: GitHub Actions的定时任务可能有延迟，也可能因为仓库不活跃而暂停

### 调试方法

1. 在Actions页面查看详细执行日志
2. 手动触发工作流进行测试
3. 本地运行同步脚本进行调试：
   ```bash
   # 复制环境变量模板
   cp .env.example .env

   # 编辑.env文件，填入你的配置信息
   # 然后加载环境变量并测试
   source .env

   # 测试配置是否正确
   npm run test-config

   # 运行同步脚本
   npm run sync-notes
   ```

## 许可证

MIT License



