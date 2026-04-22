'use client';
import React from 'react';
import { TrendingUp, Users, MapPin, Car } from 'lucide-react';
import { RegistroDiario } from '@/types';

interface ResumenDiaProps {
  registros: RegistroDiario[];
  registroActual: RegistroDiario;
}

export const ResumenDia: React.FC<ResumenDiaProps> = ({ registros, registroActual }) => {
  const totalDonaciones = registros.reduce((s, r) => s + r.donaciones.valor, 0);
  const totalDonantes = registros.reduce((s, r) => s + r.donaciones.cantidadDonantes, 0);
  const totalFacturas = registros.reduce((s, r) => s + (r.facturaElectronica?.valor || 0), 0);
  const totalGeneral = totalDonaciones + totalFacturas;

  // Preview del registro actual (aún no agregado)
  const previewValor = registroActual.donaciones.valor || 0;
  const previewDonantes = registroActual.donaciones.cantidadDonantes || 0;
  const hayPreview = previewValor > 0 && previewDonantes > 0 && registroActual.ubicacion;

  if (registros.length === 0 && !hayPreview) return null;

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-50 flex items-center gap-3">
        <div className="p-2.5 bg-emerald-50 rounded-xl">
          <TrendingUp size={18} className="text-emerald-600" />
        </div>
        <div>
          <h3 className="font-black text-slate-800 text-base">Resumen del Día</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {registros.length} registro{registros.length !== 1 ? 's' : ''} guardado{registros.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-50">
        <div className="px-6 py-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Donaciones</p>
          <p className="text-2xl font-black text-slate-900">${totalDonaciones.toLocaleString('es-CO')}</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Facturas</p>
          <p className="text-2xl font-black text-slate-900">${totalFacturas.toLocaleString('es-CO')}</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total General</p>
          <p className="text-2xl font-black text-emerald-600">${totalGeneral.toLocaleString('es-CO')}</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Donantes</p>
          <p className="text-2xl font-black text-slate-900 flex items-end gap-1">
            {totalDonantes}
            <span className="text-xs font-bold text-slate-400 mb-1">personas</span>
          </p>
        </div>
      </div>

      {/* Lista de registros del día */}
      {registros.length > 0 && (
        <div className="px-6 pb-5 space-y-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2 pb-1">Desglose por ubicación</p>
          {registros.map((reg, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 px-4 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <MapPin size={13} />
                  <span className="text-xs font-bold text-slate-700">{reg.ubicacion}</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <Car size={12} />
                  <span className="text-[10px] font-bold uppercase">{reg.tipoParqueadero}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-slate-500">
                  <Users size={12} />
                  <span className="text-[11px] font-bold">{reg.donaciones.cantidadDonantes}</span>
                </div>
                <span className="text-sm font-black text-slate-800">${reg.donaciones.valor.toLocaleString('es-CO')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview del registro en progreso */}
      {hayPreview && (
        <div className="mx-6 mb-5 flex items-center justify-between py-2.5 px-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs font-bold text-yellow-800">En progreso: {registroActual.ubicacion}</span>
          </div>
          <span className="text-sm font-black text-yellow-700">${previewValor.toLocaleString('es-CO')}</span>
        </div>
      )}
    </div>
  );
};
