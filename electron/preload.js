// preload.js - Script de seguridad de Electron
// Por seguridad, no exponemos APIs de Node.js al renderer
window.addEventListener('DOMContentLoaded', () => {
  // La app de Next.js corre en un contexto web normal
  // Supabase y Cloudinary se conectan directamente por internet
});
