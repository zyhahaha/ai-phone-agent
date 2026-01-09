const { ipcRenderer } = require('electron');

// 手机数据（从 ADB 获取）
let phones = [];

let currentPhoneId = null;
let isSending = false;
let sendTimeout = null;

// DOM 元素
const phoneList = document.getElementById('phoneList');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

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

  // 尝试连接设备
  // ipcRenderer.send('connect-device', phoneId);

  renderPhoneList();
  renderChat();
  updateInputState();
}

// 渲染聊天记录
function renderChat() {
  const phone = phones.find(p => p.id === currentPhoneId);
  
  if (!phone) {
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <p>欢迎使用 AI Phone Agent</p>
        <p>从左侧选择一个手机开始 AI 对话</p>
      </div>
    `;
    return;
  }

  if (phone.messages.length === 0) {
    chatMessages.innerHTML = `
      <div class="welcome-message">
        <p>与 ${phone.name} 的对话</p>
        <p>开始发送消息与 AI 进行对话</p>
      </div>
    `;
    return;
  }

  chatMessages.innerHTML = phone.messages.map(msg => `
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

  const phone = phones.find(p => p.id === currentPhoneId);
  if (!phone) return;

  // 添加用户消息
  const userMessage = {
    type: 'user',
    content: message,
    time: getCurrentTime()
  };
  phone.messages.push(userMessage);

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
  const phone = phones.find(p => p.id === currentPhoneId);
  if (!phone) return;

  const cancelMessage = {
    type: 'system',
    content: '当前操作已中止',
    time: getCurrentTime()
  };
  phone.messages.push(cancelMessage);

  if (currentPhoneId === phone.id) {
    renderChat();
  }
}

// 重置发送按钮
function resetSendButton() {
  isSending = false;
  sendBtn.textContent = '发送';
  sendBtn.classList.remove('sending');
}

// 接收 AI 响应
ipcRenderer.on('receive-message', (event, { phoneId, message }) => {
  const phone = phones.find(p => p.id === phoneId);
  if (!phone) return;

  const aiMessage = {
    type: 'ai',
    content: message,
    time: getCurrentTime()
  };
  phone.messages.push(aiMessage);

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
  } else {
    console.error(`设备连接失败:`, error);
  }
});

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

// 初始化 - 获取 ADB 设备列表
fetchDevices();

// 定时刷新设备列表（每30秒）
setInterval(fetchDevices, 30000);

// 初始化输入框状态
updateInputState();

// 初始化
renderPhoneList();
renderChat();
