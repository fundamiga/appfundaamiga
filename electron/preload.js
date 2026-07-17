// preload.js - Puente seguro entre el renderer (Next.js) y el proceso principal (Electron)
const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer mediante contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
  /** Indica que la app está corriendo bajo Electron (no en el navegador) */
  isElectron: true,
});

window.addEventListener('DOMContentLoaded', () => {
  // La app de Next.js corre en un contexto web normal
  // Supabase y Cloudinary se conectan directamente por internet
});
