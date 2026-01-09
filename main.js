const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');

const execAsync = util.promisify(exec);

let mainWindow;
const pendingRequests = new Map();
const agentProcesses = new Map(); // 存储每个设备的 phone-agent 进程

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    minWidth: 900,
    minHeight: 600
  });

  mainWindow.loadFile('index.html');

  // 打开开发者工具
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    // 关闭所有 phone-agent 进程
    for (const [deviceId, proc] of agentProcesses.entries()) {
      proc.kill();
    }
    agentProcesses.clear();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 通信处理

// 连接设备并启动 phone-agent
ipcMain.on('connect-device', async (event, deviceId) => {
  try {
    // 如果该设备已有运行的进程，先关闭
    if (agentProcesses.has(deviceId)) {
      agentProcesses.get(deviceId).kill();
      agentProcesses.delete(deviceId);
    }

    // 获取 API key
    const apiKey = await getApiKey();

    // 启动 phone-agent 进程（交互模式）
    const exePath = path.join(__dirname, 'libs', 'phone-agent.exe');
    const args = [
      '--base-url', 'https://open.bigmodel.cn/api/paas/v4',
      '--model', 'autoglm-phone',
      '--device-id', deviceId,
      '--apikey', apiKey,
      '--lang', 'cn'
    ];

    console.log('启动 phone-agent:', exePath, args.join(' '));

    const agentProc = spawn(exePath, args);
    agentProcesses.set(deviceId, agentProc);

    // 监听 agent 输出
    agentProc.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[${deviceId}] stdout:`, output);
      
      // 发送输出到渲染进程
      event.reply('agent-output', { deviceId, output });
    });

    agentProc.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`[${deviceId}] stderr:`, output);
      
      // 发送输出到渲染进程
      event.reply('agent-output', { deviceId, output });
    });

    agentProc.on('close', (code) => {
      console.log(`[${deviceId}] 进程退出，代码:`, code);
      agentProcesses.delete(deviceId);
      event.reply('agent-closed', { deviceId, code });
    });

    event.reply('device-connected', { success: true, deviceId });
  } catch (error) {
    console.error(`连接设备失败:`, error);
    event.reply('device-connected', { success: false, error: error.message });
  }
});

// 发送消息到 phone-agent
ipcMain.on('send-message', async (event, { phoneId, message }) => {
  const agentProc = agentProcesses.get(phoneId);
  if (!agentProc) {
    event.reply('agent-error', { phoneId, error: '设备未连接' });
    return;
  }

  try {
    // 发送消息到 phone-agent 标准输入
    agentProc.stdin.write(message + '\n');
    console.log(`发送消息到 ${phoneId}:`, message);
  } catch (error) {
    console.error(`发送消息失败:`, error);
    event.reply('agent-error', { phoneId, error: error.message });
  }
});

// 取消发送请求（通过发送 Ctrl+C 到 phone-agent）
ipcMain.on('cancel-message', (event, { phoneId }) => {
  const agentProc = agentProcesses.get(phoneId);
  if (!agentProc) return;

  try {
    // 发送 Ctrl+C 中断
    agentProc.stdin.write('\x03');
    console.log(`已发送中断信号到 ${phoneId}`);
  } catch (error) {
    console.error(`发送中断信号失败:`, error);
  }
});

// 获取 ADB 设备列表
ipcMain.on('get-devices', async (event) => {
  try {
    // 执行 adb devices 命令
    const { stdout } = await execAsync('adb devices -l');
    const lines = stdout.trim().split('\n');

    const deviceInfoList = [];

    // 跳过第一行（标题行）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(/\s+/);
      const deviceId = parts[0];
      const status = parts[1];

      // 只处理在线设备
      if (status !== 'device') continue;

      try {
        // 获取设备信息
        const manufacturer = await getAdbProperty(deviceId, 'ro.product.manufacturer');
        const model = await getAdbProperty(deviceId, 'ro.product.model');
        const androidVersion = await getAdbProperty(deviceId, 'ro.build.version.release');

        deviceInfoList.push({
          id: deviceId,
          name: `${manufacturer} ${model}`.trim() || deviceId,
          number: deviceId,
          status: 'online',
          androidVersion: androidVersion || 'Unknown',
          messages: []
        });
      } catch (err) {
        console.error(`获取设备 ${deviceId} 信息失败:`, err);
        // 即使获取详细信息失败，也添加基本信息
        deviceInfoList.push({
          id: deviceId,
          name: deviceId,
          number: deviceId,
          status: 'online',
          androidVersion: 'Unknown',
          messages: []
        });
      }
    }

    event.reply('devices-list', deviceInfoList);
  } catch (error) {
    console.error('获取设备列表失败:', error);
    event.reply('devices-list', []);
  }
});

// 获取设备属性
async function getAdbProperty(deviceId, property) {
  try {
    const { stdout } = await execAsync(`adb -s ${deviceId} shell getprop ${property}`);
    return stdout.trim();
  } catch (err) {
    return '';
  }
}

// 获取 API Key
function getApiKey() {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.apiKey || '';
    }
  } catch (error) {
    console.error('读取 API Key 失败:', error);
  }
  return '';
}

// 保存 API Key
ipcMain.on('save-api-key', (event, apiKey) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    const config = { apiKey };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('API Key 已保存');
    event.reply('api-key-saved', { success: true });
  } catch (error) {
    console.error('保存 API Key 失败:', error);
    event.reply('api-key-saved', { success: false, error: error.message });
  }
});

// 获取 API Key
ipcMain.on('get-api-key', (event) => {
  const apiKey = getApiKey();
  event.reply('api-key', { apiKey });
});
