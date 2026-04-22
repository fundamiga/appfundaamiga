'use client';

import React from 'react';
import { ArrowLeft, Shield, Plus, CheckCircle, Activity, FileCheck } from 'lucide-react';
import Link from 'next/link';
import { SubirFirma } from '@/components/admin/SubirFirma';
import { ListaFirmasAdmin } from '@/components/admin/ListaFirmasAdmin';
import { useFirmas } from '@/hooks/UseFirmas';
import Image from 'next/image';

export default function AdminPage() {
  const { firmas, loading, error, recargarFirmas } = useFirmas();

  const totalFirmas = (firmas?.trabajador?.length || 0) + 
                      (firmas?.supervisor?.length || 0) + 
                      (firmas?.responsable?.length || 0);

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Luces Ambientales (Branding Fundamiga) */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-emerald-100/30 blur-[120px] rounded-full -z-10 -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-yellow-100/20 blur-[100px] rounded-full -z-10 translate-x-1/4 translate-y-1/4"></div>

      {/* Navbar Minimalista */}
      <nav className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-40">
  <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
    
    {/* Contenedor de Marca (Logo + Texto) */}
    <div className="flex items-center gap-4">
      {/* Contenedor del Logo de Imagen */}
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <Image 
            src="/LOGO.png" 
            alt="Fundamiga Logo" 
            fill 
            className="object-contain p-1.5" 
            priority 
          />
        </div>
        
        {/* Textos de Identidad */}
        <div className="flex flex-col">
          <span className="text-xl font-black text-slate-800 tracking-tighter leading-none">
            Fundamiga
          </span>
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-[0.15em] mt-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>
            Panel de Control Admin
          </p>
        </div>
      </div>
    </div>

    {/* Botón de Salida */}
    <Link 
      href="/"
      className="group flex items-center gap-2 text-slate-500 hover:text-emerald-700 transition-all duration-300 px-5 py-2.5 rounded-2xl hover:bg-emerald-50 border border-transparent hover:border-emerald-100/50 shadow-sm hover:shadow-md"
    >
      <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
      <span className="text-sm font-black tracking-tight">Volver al Sistema</span>
    </Link>

  </div>
</nav>

      <div className="max-w-7xl mx-auto px-6 py-10 relative">
        {/* Page Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-1.5 w-12 bg-emerald-500 rounded-full"></div>
            <div className="h-1.5 w-4 bg-yellow-400 rounded-full"></div>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">
            Gestión de <span className="text-emerald-600">Firmas Autorizadas</span>
          </h1>
          <p className="text-slate-500 font-medium mt-3 text-lg border-l-4 border-yellow-400 pl-6">
            Configuración de validadores y responsables para los informes de donación.
          </p>
        </div>

        {/* Contenido Dinámico */}
        {loading ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-20 text-center shadow-sm">
            <div className="flex justify-center mb-6">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 bg-emerald-200 rounded-full blur-xl opacity-40 animate-pulse"></div>
                <div className="relative w-full h-full border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin"></div>
              </div>
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Sincronizando base de datos...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 rounded-3xl p-8 flex items-center gap-6 shadow-sm">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 flex-shrink-0">
              <Shield size={28} />
            </div>
            <div>
              <h3 className="font-black text-red-900 text-xl tracking-tight">Error de Conexión</h3>
              <p className="text-red-700/70 font-medium mt-1">{error}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Stats Cards - Emerald & Yellow */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: 'Firmas en Base de Datos', value: totalFirmas, icon: <FileCheck size={24}/>, color: 'emerald' },
                { label: 'Estado del Servidor', value: 'Óptimo', icon: <Activity size={24}/>, color: 'yellow' },
              ].map((stat, idx) => (
                <div 
                  key={idx}
                  className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-xl hover:shadow-emerald-50 transition-all duration-500 group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{stat.label}</p>
                      <p className={`text-4xl font-black ${stat.color === 'emerald' ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {stat.value}
                      </p>
                    </div>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                      stat.color === 'emerald' ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white' : 'bg-yellow-50 text-yellow-600 group-hover:bg-yellow-400 group-hover:text-yellow-950'
                    }`}>
                      {stat.icon}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Main Admin Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Card Subir Firma */}
              <div className="lg:col-span-1 sticky top-28">
                <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-emerald-50 transition-all duration-500">
                  <div className="bg-emerald-600 p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white/20 rounded-xl backdrop-blur-md">
                        <Plus size={24} className="text-white" strokeWidth={3} />
                      </div>
                      <h2 className="text-xl font-black text-white tracking-tight">Nueva Autorización</h2>
                    </div>
                  </div>
                  <div className="p-8">
                    <SubirFirma onFirmaSubida={recargarFirmas} />
                  </div>
                </div>
              </div>

              {/* Card Lista de Firmas */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm shadow-slate-200/50">
                  <div className="bg-slate-50 px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                      <h2 className="text-xl font-black text-slate-800 tracking-tight">Registros Existentes</h2>
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="overflow-x-auto">
                      <ListaFirmasAdmin 
                        firmas={firmas} 
                        onFirmaEliminada={recargarFirmas} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}