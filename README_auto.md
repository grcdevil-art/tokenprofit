# Formspark 自动化集成方案

## 调查结果

### Formspark 接口能力

**✅ Webhook 支持（推荐方案）**
- Formspark 支持 Webhook 功能
- 每当有新表单提交时，会自动向指定 URL 发送 POST 请求
- 无需轮询，实时接收数据
- 免费版即可使用

**⚠️ API 支持有限**
- Formspark 官方 API 主要面向企业用户
- 免费版没有直接的 "获取所有提交" API
- 需要通过 Webhook 或导出 CSV

**推荐方案：Webhook（实时 + 简单）**

---

## Webhook 配置步骤

### 1. 在 Formspark 中设置 Webhook

1. 登录 Formspark 控制台
2. 选择你的表单
3. 点击 "Integrations" 或 "Settings"
4. 找到 "Webhook" 选项
5. 添加 Webhook URL：
   ```
   https://your-server.com/webhook/formspark
   ```
   （本地测试可用 ngrok: `https://xxxx.ngrok.io/webhook/formspark`）

### 2. Webhook 数据格式

Formspark 发送的 POST 请求示例：
```json
{
  "form_id": "your-form-id",
  "submission_id": "sub_123456",
  "created_at": "2026-03-16T10:30:00Z",
  "data": {
    "email": "user@example.com",
    "name": "John Doe",
    "company": "Acme Inc"
  }
}
```

---

## 自动化脚本设计

由于 Webhook 是实时推送的，我们需要：
1. **Webhook 接收服务** - 实时接收新提交
2. **用户生成逻辑** - 生成 API Key、保存到数据库
3. **邮件发送** - 自动发送欢迎邮件

---

## 方案A：Webhook 实时处理（推荐）

创建 `webhook_server.js`：

```javascript
const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

// 配置
const CONFIG = {
  PORT: process.env.WEBHOOK_PORT || 3001,
  DATA_DIR: path.join(__dirname, 'data'),
  FREE_CREDITS: 10, // $10 free credits
};

// 确保数据目录存在
async function ensureDataDir() {
  try {
    await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

// 生成唯一 API Key
function generateApiKey() {
  const prefix = 'sk-ts';
  const random = crypto.randomBytes(24).toString('hex');
  return `${prefix}-${random}`;
}

// 保存用户到数据库
async function saveUser(email, apiKey) {
  const dbPath = path.join(CONFIG.DATA_DIR, 'users.json');
  
  let users = [];
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    users = JSON.parse(data);
  } catch (err) {
    // File doesn't exist yet
  }
  
  // 检查是否已存在
  if (users.find(u => u.email === email)) {
    console.log(`User ${email} already exists, skipping...`);
    return null;
  }
  
  const user = {
    id: crypto.randomUUID(),
    email,
    api_key: apiKey,
    credits: CONFIG.FREE_CREDITS,
    used_credits: 0,
    created_at: new Date().toISOString(),
    status: 'active',
    source: 'formspark'
  };
  
  users.push(user);
  await fs.writeFile(dbPath, JSON.stringify(users, null, 2));
  
  // 同时保存到新用户文件（方便手动发送）
  const newUsersPath = path.join(CONFIG.DATA_DIR, 'new_users_today.txt');
  const line = `${new Date().toISOString()} | ${email} | ${apiKey}\n`;
  await fs.appendFile(newUsersPath, line);
  
  return user;
}

// Webhook 接收端点
app.post('/webhook/formspark', async (req, res) => {
  try {
    console.log('Received webhook:', req.body);
    
    // 提取邮箱
    const email = req.body.data?.email || req.body.email;
    
    if (!email) {
      console.error('No email found in webhook data');
      return res.status(400).json({ error: 'No email provided' });
    }
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error('Invalid email format:', email);
      return res.status(400).json({ error: 'Invalid email' });
    }
    
    // 生成 API Key
    const apiKey = generateApiKey();
    
    // 保存用户
    const user = await saveUser(email, apiKey);
    
    if (!user) {
      return res.status(200).json({ message: 'User already exists' });
    }
    
    console.log(`Created user: ${email} with API Key: ${apiKey}`);
    
    res.status(200).json({
      success: true,
      message: 'User created',
      user: {
        email: user.email,
        api_key: user.api_key,
        credits: user.credits
      }
    });
    
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 启动服务
async function start() {
  await ensureDataDir();
  
  app.listen(CONFIG.PORT, () => {
    console.log(`Webhook server running on port ${CONFIG.PORT}`);
    console.log(`Webhook URL: http://your-domain.com:${CONFIG.PORT}/webhook/formspark`);
  });
}

start();
```

---

## README_auto.md

### 安装依赖

```bash
npm init -y
npm install express
```

### 配置 Formspark Webhook

1. 登录 Formspark 控制台
2. 进入你的表单设置
3. 找到 Webhook 选项
4. 添加 URL: `http://your-server:3001/webhook/formspark`

### 运行脚本

```bash
node webhook_server.js
```

### 定时任务（Windows）

使用任务计划程序每天运行一次备份脚本。

---

*脚本生成者：TokenProfit-Master (@token销售)*
