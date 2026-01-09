const { ipcRenderer } = require('electron');

// 手机数据（从 ADB 获取）
let phones = [];
let phoneMessages = new Map(); // 存储每个设备的历史消息

let currentPhoneId = null;
let isSending = false;
let sendTimeout = null;

// DOM 元素
const phoneList = document.getElementById('phoneList');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModalBtn = document.getElementById('closeModal');
const cancelModalBtn = document.getElementById('cancelModal');
const saveModalBtn = document.getElementById('saveModal');
const apiKeyInput = document.getElementById('apiKeyInput');

// 渲染手机列表
function renderPhoneList() {
  if (phones.length === 0) {
    phoneList.innerHTML = `
      <div class="no-devices">
        <p>未检测到设备</p>
        <p>请确保已连接设备并开启 USB 调试</p>
      </div>
    `;
    return;
  }

  phoneList.innerHTML = phones.map(phone => `
    <div class="phone-item ${currentPhoneId === phone.id ? 'active' : ''}"
         onclick="selectPhone('${phone.id}')">
      <div class="phone-info">
        <div class="phone-name">${phone.name}</div>
        <div class="phone-number">${phone.number}</div>
        ${phone.androidVersion ? `<div class="phone-version">Android ${phone.androidVersion}</div>` : ''}
      </div>
      <div class="phone-status ${phone.status}"></div>
    </div>
  `).join('');
}

// 选择手机
function selectPhone(phoneId) {
  currentPhoneId = phoneId;

  // 初始化消息历史（如果不存在）
  if (!phoneMessages.has(phoneId)) {
    phoneMessages.set(phoneId, []);
  }

  // 连接设备并启动 phone-agent
  ipcRenderer.send('connect-device', phoneId);

  renderPhoneList();
  renderChat();
  updateInputState();
}

// 渲染聊天记录
function renderChat() {
  if (!currentPhoneId) {
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <p>欢迎使用 AI Phone Agent</p>
        <p>从左侧选择一个手机开始 AI 对话</p>
      </div>
    `;
    return;
  }

  const phone = phones.find(p => p.id === currentPhoneId);
  const messages = phoneMessages.get(currentPhoneId) || [];

  if (!messages || messages.length === 0) {
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <p>与 ${phone?.name || '设备'} 的对话</p>
        <p>开始发送消息与 AI 进行对话</p>
      </div>
    `;
    return;
  }

  chatMessages.innerHTML = messages.map(msg => `
    <div class="message ${msg.type}">
      <div class="message-content">
        ${msg.content}
        <div class="message-time">${msg.time}</div>
      </div>
    </div>
  `).join('');

  // 滚动到底部
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 发送消息
function sendMessage() {
  const message = messageInput.value.trim();

  // 如果正在发送中，则中止
  if (isSending) {
    cancelSend();
    return;
  }
  if (!message || !currentPhoneId) return;

  // 获取或创建消息列表
  if (!phoneMessages.has(currentPhoneId)) {
    phoneMessages.set(currentPhoneId, []);
  }
  const messages = phoneMessages.get(currentPhoneId);

  // 添加用户消息
  const userMessage = {
    type: 'user',
    content: message,
    time: getCurrentTime()
  };
  messages.push(userMessage);

  // 清空输入框
  messageInput.value = '';
  messageInput.style.height = '50px';
  renderChat();

  // 设置发送状态
  isSending = true;
  sendBtn.textContent = '中止';
  sendBtn.classList.add('sending');

  // 发送到主进程
  ipcRenderer.send('send-message', {
    phoneId: currentPhoneId,
    message: message
  });

  // 5秒后自动恢复
  sendTimeout = setTimeout(() => {
    resetSendButton();
  }, 5000);
}

// 更新输入框和发送按钮状态
function updateInputState() {
  const hasSelectedPhone = currentPhoneId !== null;

  messageInput.disabled = !hasSelectedPhone;
  sendBtn.disabled = !hasSelectedPhone;

  if (!hasSelectedPhone) {
    messageInput.placeholder = '请先选择一个手机';
  } else {
    messageInput.placeholder = '输入消息...';
  }
}

// 中止发送
function cancelSend() {
  if (sendTimeout) {
    clearTimeout(sendTimeout);
    sendTimeout = null;
  }
  resetSendButton();

  // 通知主进程取消请求
  ipcRenderer.send('cancel-message', {
    phoneId: currentPhoneId
  });

  // 显示中止提示
  showCancelMessage();
}

// 显示中止提示
function showCancelMessage() {
  if (!currentPhoneId) return;

  // 获取或创建消息列表
  if (!phoneMessages.has(currentPhoneId)) {
    phoneMessages.set(currentPhoneId, []);
  }
  const messages = phoneMessages.get(currentPhoneId);

  const cancelMessage = {
    type: 'system',
    content: '当前操作已中止',
    time: getCurrentTime()
  };
  messages.push(cancelMessage);

  renderChat();
}

// 重置发送按钮
function resetSendButton() {
  isSending = false;
  sendBtn.textContent = '发送';
  sendBtn.classList.remove('sending');
}

// 接收 AI 响应
ipcRenderer.on('receive-message', (event, { phoneId, message }) => {
  // 获取或创建消息列表
  if (!phoneMessages.has(phoneId)) {
    phoneMessages.set(phoneId, []);
  }
  const messages = phoneMessages.get(phoneId);

  const aiMessage = {
    type: 'ai',
    content: message,
    time: getCurrentTime()
  };
  messages.push(aiMessage);

  // 收到响应后重置按钮
  resetSendButton();

  if (currentPhoneId === phoneId) {
    renderChat();
  }
});

// 获取当前时间
function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 从 ADB 获取设备列表
function fetchDevices() {
  ipcRenderer.send('get-devices');
}

// 监听 ADB 设备列表
ipcRenderer.on('devices-list', (event, devices) => {
  phones = devices;
  renderPhoneList();
});

// 监听设备连接结果
ipcRenderer.on('device-connected', (event, { success, deviceId, error }) => {
  if (success) {
    console.log(`设备 ${deviceId} 连接成功`);
    addSystemMessage(deviceId, '设备已连接');
  } else {
    console.error(`设备连接失败:`, error);
    addSystemMessage(deviceId, `连接失败: ${error}`);
  }
});

// 监听主进程请求 API Key
ipcRenderer.on('get-api-key-request', () => {
  const apiKey = localStorage.getItem('ai-api-key') || '';
  ipcRenderer.send('api-key-response', { apiKey });
});

// 监听 agent 输出
ipcRenderer.on('agent-output', (event, { deviceId, output }) => {
  // 获取或创建消息列表
  if (!phoneMessages.has(deviceId)) {
    phoneMessages.set(deviceId, []);
  }
  const messages = phoneMessages.get(deviceId);

  // 过滤掉空行和提示符
  const trimmed = output.trim();
  if (!trimmed || trimmed.startsWith('>')) return;

  // 添加 AI 消息
  const aiMessage = {
    type: 'ai',
    content: trimmed,
    time: getCurrentTime()
  };
  messages.push(aiMessage);

  if (currentPhoneId === deviceId) {
    renderChat();
    // 收到 AI 响应后重置按钮
    resetSendButton();
  }
});

// 监听 agent 错误
ipcRenderer.on('agent-error', (event, { phoneId, error }) => {
  console.error(`Agent 错误:`, error);
  addSystemMessage(phoneId, `错误: ${error}`);
});

// 监听 agent 关闭
ipcRenderer.on('agent-closed', (event, { deviceId, code }) => {
  console.log(`设备 ${deviceId} agent 已关闭，退出代码:`, code);
  addSystemMessage(deviceId, '设备已断开');
});

// 添加系统消息
function addSystemMessage(deviceId, content) {
  // 获取或创建消息列表
  if (!phoneMessages.has(deviceId)) {
    phoneMessages.set(deviceId, []);
  }
  const messages = phoneMessages.get(deviceId);

  const message = {
    type: 'system',
    content: content,
    time: getCurrentTime()
  };
  messages.push(message);

  if (currentPhoneId === deviceId) {
    renderChat();
  }
}

// 输入框自动调整高度
messageInput.addEventListener('input', function() {
  const newHeight = Math.max(this.scrollHeight, 50);
  this.style.height = newHeight + 'px';
});

// 监听键盘事件
messageInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// 按钮事件
sendBtn.addEventListener('click', sendMessage);
settingsBtn.addEventListener('click', openSettings);
closeModalBtn.addEventListener('click', closeSettings);
cancelModalBtn.addEventListener('click', closeSettings);
saveModalBtn.addEventListener('click', saveSettings);

// 打开设置
function openSettings() {
  // 从 localStorage 获取 API Key
  const savedApiKey = localStorage.getItem('ai-api-key') || '';
  apiKeyInput.value = savedApiKey;
  settingsModal.style.display = 'flex';
}

// 关闭设置
function closeSettings() {
  settingsModal.style.display = 'none';
  apiKeyInput.value = '';
}

// 保存设置
function saveSettings() {
  const apiKey = apiKeyInput.value.trim();
  if (apiKey) {
    // 保存到 localStorage
    localStorage.setItem('ai-api-key', apiKey);
    console.log('API Key 已保存');
  }
  closeSettings();
}

// 初始化 - 获取 ADB 设备列表
fetchDevices();

// 定时刷新设备列表（每30秒）
setInterval(fetchDevices, 30000);

// 初始化输入框状态
updateInputState();

// 初始化
renderPhoneList();
renderChat();
