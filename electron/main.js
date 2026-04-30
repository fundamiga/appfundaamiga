const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const url = require('url');

let mainWindow;
let server;

// ─── Static file server (sirve la carpeta /out de Next.js) ───────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
};

function getOutDir() {
  // En producción, si usamos "files" en package.json, está en resources/app/out
  // En desarrollo, está en la raíz del proyecto
  // Ambos casos suelen resolverse subiendo un nivel desde la carpeta electron/
  const possiblePath = path.join(__dirname, '..', 'out');
  if (fs.existsSync(possiblePath)) {
    return possiblePath;
  }
  
  // Fallback para cuando se usa extraResources (estaría en resources/out)
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'out');
  }
  
  return possiblePath;
}

function startServer(port) {
  const outDir = getOutDir();

  server = http.createServer((req, res) => {
    let reqPath = url.parse(req.url).pathname;

    // Normalizar la ruta
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    let filePath = path.join(outDir, reqPath);

    // Si no existe, intentar agregar .html (rutas de Next.js: /admin → /admin.html)
    if (!fs.existsSync(filePath)) {
      filePath = path.join(outDir, reqPath + '.html');
    }

    // Si tampoco existe, buscar index.html en ese directorio
    if (!fs.existsSync(filePath)) {
      filePath = path.join(outDir, reqPath, 'index.html');
    }

    // Fallback al index principal (SPA fallback)
    if (!fs.existsSync(filePath)) {
      filePath = path.join(outDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Archivo no encontrado: ' + reqPath);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Servidor local iniciado en http://127.0.0.1:${port}`);
    createWindow(port);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Puerto ocupado, intentar con el siguiente
      startServer(port + 1);
    } else {
      console.error('Error del servidor:', err);
    }
  });
}

// ─── Ventana principal ────────────────────────────────────────────────────────
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Fundamiga',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // Ocultar hasta que esté listo
    backgroundColor: '#0f172a',
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Mostrar ventana cuando el contenido esté listo
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  // Abrir links externos en el navegador del sistema, no en Electron
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.startsWith('http://127.0.0.1')) return { action: 'allow' };
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });

  // Quitar menú nativo
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Ciclo de vida de la app ──────────────────────────────────────────────────
app.whenReady().then(() => {
  startServer(3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startServer(3000);
    }
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});
