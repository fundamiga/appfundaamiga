import React from 'react';
import { Settings } from 'lucide-react';
import Link from 'next/link';

export const BotonAccesoAdmin: React.FC = () => {
  return (
    <Link href="/admin">
      <button className="fixed bottom-8 left-8 group z-50 flex items-center print:hidden">
  {/* Tooltip flotante con estilo de marca */}
  <span className="absolute left-16 px-4 py-2 bg-white/90 backdrop-blur-md border border-emerald-100 text-emerald-800 text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0 pointer-events-none">
    Panel Administrativo
  </span>

  {/* Botón Principal */}
  <div className="relative">
    {/* Efecto de pulso sutil de fondo */}
    <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20 group-hover:opacity-40"></div>
    
    <div className="relative bg-emerald-600 text-white p-4 rounded-2xl shadow-[0_10px_25px_rgba(16,185,129,0.3)] group-hover:shadow-[0_15px_35px_rgba(250,204,21,0.4)] group-hover:bg-yellow-400 group-hover:text-yellow-950 transition-all duration-500 hover:scale-110 active:scale-95 border-2 border-white/20">
      <Settings 
        size={26} 
        strokeWidth={2.5}
        className="group-hover:rotate-180 transition-transform duration-700 ease-in-out" 
      />
    </div>
    
    {/* Punto de notificación decorativo */}
    <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full border-2 border-white shadow-sm"></div>
  </div>
</button>
    </Link>
  );
};