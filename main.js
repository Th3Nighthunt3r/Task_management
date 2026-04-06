const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { app: serverApp, PORT } = require('./server');

let server;

function startServer() {
  return new Promise((resolve, reject) => {
    server = serverApp.listen(PORT, '127.0.0.1', () => {
      console.log(`[Server] Ready on http://localhost:${PORT}`);
      resolve();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port already in use — another instance is running, just connect to it
        console.log(`[Server] Port ${PORT} already in use, connecting to existing instance`);
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Task Management',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    backgroundColor: '#0f0f1a'
  });

  win.loadURL(`http://localhost:${PORT}`);

  win.once('ready-to-show', () => { win.show(); });

  Menu.setApplicationMenu(buildMenu(win));

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in system browser
    if (url.startsWith('http') && !url.startsWith(`http://localhost:${PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

function buildMenu(win) {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});
