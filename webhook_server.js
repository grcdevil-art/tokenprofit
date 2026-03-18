/**
 * TokenSales Webhook Server
 * 
 * 功能：接收 Formspark Webhook，自动创建用户并发送欢迎邮件
 * 作者：TokenProfit-Master
 * 日期：2026-03-18
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// SendGrid 邮件服务 - 可选依赖
let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
  console.log('✅ SendGrid module loaded successfully');
} catch (err) {
  console.warn('⚠️  @sendgrid/mail not installed. Email sending disabled.');
  console.warn('   Run: npm install @sendgrid/mail');
}

const app = express();
app.use(express.json());

// 从环境变量读取 SendGrid API Key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@tokensales.ai';

// 初始化 SendGrid（如果模块和 API Key 都配置了）
if (sgMail && SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('✅ SendGrid initialized successfully');
} else if (!sgMail) {
  console.warn('⚠️  SendGrid module not available. Emails will be logged but not sent.');
} else {
  console.warn('⚠️  SENDGRID_API_KEY not set. Emails will be logged but not sent.');
}

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

/**
 * 生成欢迎邮件的 HTML 内容
 * @param {string} email - 用户邮箱
 * @param {string} apiKey - 用户的 API Key
 * @returns {string} HTML 邮件内容
 */
function generateWelcomeEmailHTML(email, apiKey) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to TokenSales</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .api-key { background: #1a1a1a; color: #00ff00; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 20px 0; }
    .code-block { background: #f4f4f4; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 13px; overflow-x: auto; border-left: 4px solid #667eea; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
    .highlight { color: #667eea; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎉 Welcome to TokenSales Beta!</h1>
    <p>Your $10 free credits are ready</p>
  </div>
  
  <div class="content">
    <p>Hi there,</p>
    
    <p>Thanks for joining TokenSales beta! You're now part of an exclusive group of developers getting <span class="highlight">80-98% cheaper AI API access</span>.</p>
    
    <h3>🔑 Your API Key</h3>
    <div class="api-key">${apiKey}</div>
    <p><strong>Free Credits:</strong> $10 (valid for 30 days)<br>
    <strong>Supported Models:</strong> DeepSeek V3.2, MiniMax M2.5, Kimi K2.5, GLM-5</p>
    
    <h3>🚀 Quick Start (Python)</h3>
    <div class="code-block">from openai import OpenAI

client = OpenAI(
    base_url="https://api.tokensales.ai/v1",
    api_key="${apiKey}"
)

response = client.chat.completions.create(
    model="deepseek-v3.2",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)</div>
    
    <h3>📚 Resources</h3>
    <ul>
      <li><a href="#">API Documentation</a></li>
      <li><a href="#">Model Comparison</a></li>
      <li><a href="#">Join Discord Community</a></li>
    </ul>
    
    <h3>🎁 Founding Member Benefits</h3>
    <p>As one of the first 20 beta users, you get:</p>
    <ul>
      <li>✅ <strong>Lifetime 30% discount</strong> - Lock in 30% off forever</li>
      <li>✅ <strong>Priority Support</strong> - Direct access to founder</li>
      <li>✅ <strong>Feature Voting</strong> - Vote on new models</li>
    </ul>
    
    <center>
      <a href="https://tokensales.ai/dashboard" class="cta-button">Go to Dashboard</a>
    </center>
    
    <p>Questions? Just reply to this email or join our <a href="#">Discord</a>.</p>
    
    <p>Happy building!<br>
    <strong>The TokenSales Team</strong></p>
  </div>
  
  <div class="footer">
    <p>© 2026 TokenSales. All rights reserved.</p>
    <p>You're receiving this because you signed up for TokenSales beta.</p>
  </div>
</body>
</html>
  `;
}

/**
 * 发送欢迎邮件
 * @param {string} email - 收件人邮箱
 * @param {string} apiKey - 用户的 API Key
 * @returns {Promise<boolean>} 是否发送成功
 */
async function sendWelcomeEmail(email, apiKey) {
  // 如果没有配置 SendGrid 或模块未加载，只记录日志
  if (!sgMail || !SENDGRID_API_KEY) {
    console.log(`[EMAIL MOCK] Would send welcome email to: ${email}`);
    console.log(`[EMAIL MOCK] API Key: ${apiKey}`);
    console.log(`[EMAIL MOCK] FROM_EMAIL: ${FROM_EMAIL}`);
    if (!sgMail) {
      console.log(`[EMAIL MOCK] Reason: @sendgrid/mail module not installed`);
    } else if (!SENDGRID_API_KEY) {
      console.log(`[EMAIL MOCK] Reason: SENDGRID_API_KEY not configured`);
    }
    return true; // 返回 true 表示"已处理"，不阻塞流程
  }
  
  const msg = {
    to: email,
    from: FROM_EMAIL,
    subject: '🎉 Welcome to TokenSales Beta! Your $10 Credits are Ready',
    html: generateWelcomeEmailHTML(email, apiKey),
  };
  
  try {
    await sgMail.send(msg);
    console.log(`✅ Welcome email sent to: ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error.message);
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
    }
    return false;
  }
}

/**
 * 保存用户到数据库
 * @param {string} email - 用户邮箱
 * @param {string} apiKey - 用户的 API Key
 * @returns {Promise<Object|null>} 用户对象或 null（如果用户已存在）
 */
async function saveUser(email, apiKey) {
  const dbPath = path.join(CONFIG.DATA_DIR, 'users.json');
  
  let users = [];
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    users = JSON.parse(data);
  } catch (err) {
    // File doesn't exist yet, start with empty array
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
    source: 'formspark',
    email_sent: false // 标记邮件是否发送成功
  };
  
  users.push(user);
  await fs.writeFile(dbPath, JSON.stringify(users, null, 2));
  
  // 同时保存到新用户文件（方便手动查看）
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
    
    // 发送欢迎邮件（异步，不阻塞响应）
    sendWelcomeEmail(email, apiKey).then(emailSent => {
      if (emailSent) {
        console.log(`✅ Welcome email sent to ${email}`);
        // 更新用户记录，标记邮件已发送
        updateUserEmailStatus(email, true);
      } else {
        console.error(`❌ Failed to send welcome email to ${email}`);
      }
    });
    
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

/**
 * 更新用户邮件发送状态
 * @param {string} email - 用户邮箱
 * @param {boolean} emailSent - 是否发送成功
 */
async function updateUserEmailStatus(email, emailSent) {
  const dbPath = path.join(CONFIG.DATA_DIR, 'users.json');
  
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    let users = JSON.parse(data);
    
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex !== -1) {
      users[userIndex].email_sent = emailSent;
      users[userIndex].email_sent_at = new Date().toISOString();
      await fs.writeFile(dbPath, JSON.stringify(users, null, 2));
    }
  } catch (err) {
    console.error('Failed to update email status:', err);
  }
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取用户列表（用于调试）
app.get('/users', async (req, res) => {
  const dbPath = path.join(CONFIG.DATA_DIR, 'users.json');
  
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    const users = JSON.parse(data);
    res.json({ count: users.length, users });
  } catch (err) {
    res.json({ count: 0, users: [], error: 'No users yet' });
  }
});

// 启动服务
async function start() {
  await ensureDataDir();
  
  app.listen(CONFIG.PORT, () => {
    console.log(`Webhook server running on port ${CONFIG.PORT}`);
    console.log(`Webhook URL: http://your-domain.com:${CONFIG.PORT}/webhook/formspark`);
    console.log(`Data directory: ${CONFIG.DATA_DIR}`);
  });
}

start();
