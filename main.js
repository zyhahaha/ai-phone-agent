const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

let mainWindow;

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
ipcMain.on('send-message', (event, { phoneId, message }) => {
  // 模拟 AI 响应
  setTimeout(() => {
    event.reply('receive-message', {
      phoneId,
      message: `AI 响应: ${message}`
    });
  }, 5000);
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

// 连接设备
ipcMain.on('connect-device', async (event, deviceId) => {
  try {
    // 执行 adb connect 命令
    const { stdout } = await execAsync(`adb connect ${deviceId}`);
    event.reply('device-connected', { success: true, deviceId, output: stdout });
  } catch (error) {
    event.reply('device-connected', { success: false, error: error.message });
  }
});
