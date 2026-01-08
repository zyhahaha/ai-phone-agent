const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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
  }, 1000);
});
