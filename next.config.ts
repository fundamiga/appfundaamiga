import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Export estático para empaquetar con Electron
  output: "export",
  // Deshabilitar optimización de imágenes (no compatible con export estático)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
