const { ipcRenderer } = require('electron');

// 示例手机数据
let phones = [
  {
    id: 1,
    name: 'iPhone 15 Pro',
    number: '+86 138-0000-0001',
    status: 'online',
    messages: []
  },
  {
    id: 2,
    name: 'Samsung Galaxy S24',
    number: '+86 138-0000-0002',
    status: 'online',
    messages: []
  },
  {
    id: 3,
    name: 'Pixel 8 Pro',
    number: '+86 138-0000-0003',
    status: 'offline',
    messages: []
  },
  {
    id: 4,
    name: 'Xiaomi 14',
    number: '+86 138-0000-0004',
    status: 'online',
    messages: []
  }
];

let currentPhoneId = null;

// DOM 元素
const phoneList = document.getElementById('phoneList');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// 渲染手机列表
function renderPhoneList() {
  phoneList.innerHTML = phones.map(phone => `
    <div class="phone-item ${currentPhoneId === phone.id ? 'active' : ''}"
         onclick="selectPhone(${phone.id})">
      <div class="phone-info">
        <div class="phone-name">${phone.name}</div>
        <div class="phone-number">${phone.number}</div>
      </div>
      <div class="phone-status ${phone.status}"></div>
    </div>
  `).join('');
}

// 选择手机
function selectPhone(phoneId) {
  currentPhoneId = phoneId;
  renderPhoneList();
  renderChat();
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

  // 发送到主进程
  ipcRenderer.send('send-message', {
    phoneId: currentPhoneId,
    message: message
  });
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

  if (currentPhoneId === phoneId) {
    renderChat();
  }
});

// 获取当前时间
function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// 输入框自动调整高度
messageInput.addEventListener('input', function() {
  this.style.height = '50px';
  this.style.height = Math.min(this.scrollHeight, 150) + 'px';
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

// 初始化
renderPhoneList();
renderChat();
