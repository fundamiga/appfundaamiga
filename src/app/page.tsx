'use client';
import Image from 'next/image';
import React, { useState } from 'react';
import { CheckCircle, Calculator, ShieldCheck } from 'lucide-react';
import { LiquidacionPersonal } from '@/components/LiquidacionPersonal';
import ControlARL from '@/components/ControlARL';
import { BotonAccesoAdmin } from '@/components/BotonAccesoAdmin';

export default function SistemaControlDonaciones() {
  const [tabActiva, setTabActiva] = useState<'liquidacion' | 'arl'>('liquidacion');

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">

      {/* Luces de fondo */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-emerald-100/30 blur-[120px] rounded-full -z-10 -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-yellow-100/20 blur-[100px] rounded-full -z-10 translate-x-1/4 -translate-y-1/4"></div>

      {/* Navbar */}
      <nav className="bg-white/60 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative w-12 h-12 p-1 bg-white rounded-2xl shadow-sm border border-gray-100">
              <Image src="/LOGO.png" alt="Fundamiga Logo" fill className="object-contain p-1" priority />
            </div>
            <div>
              <span className="text-xl font-black text-slate-800 tracking-tight block leading-none">
                Fundamiga
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">
                  Gestión Operativa
                </p>
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-emerald-100 shadow-sm">
            <CheckCircle size={14} className="text-emerald-600" />
            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-tighter">
              Sistema Operativo
            </span>
          </div>
        </div>
      </nav>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-6 py-10 relative">

        {/* Título y Selectores de Tabs */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">
              Panel de <span className="text-emerald-600">Herramientas</span>
            </h1>
            <p className="text-slate-500 font-medium mt-2 text-md border-l-4 border-yellow-400 pl-4">
              Selecciona el módulo en el que quieres trabajar hoy.
            </p>
          </div>

          <div className="flex bg-white border border-gray-200 p-1.5 rounded-2xl shadow-sm">
             <button 
               onClick={() => setTabActiva('liquidacion')}
               className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${tabActiva === 'liquidacion' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
             >
                <Calculator size={18} /> Liquidación
             </button>
             <button 
               onClick={() => setTabActiva('arl')}
               className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${tabActiva === 'arl' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
             >
                <ShieldCheck size={18} /> Control ARL
             </button>
          </div>
        </div>

        {/* RENDERIZADO DEL MÓDULO */}
        <div className="flex justify-center items-start min-h-[70vh]">
          <div className="w-full max-w-5xl">
            {tabActiva === 'liquidacion' ? (
               <LiquidacionPersonal />
            ) : (
               <ControlARL />
            )}
          </div>
        </div>

      </main>

      {/* Acceso admin */}
      <BotonAccesoAdmin />
    </div>
  );
}