'use client';
import React, { useState } from 'react';
import { History, ChevronDown, ChevronUp, Trash2, Eye, Calendar } from 'lucide-react';
import { EntradaHistorial } from '@/hooks/useHistorial';

interface HistorialDiasProps {
  historial: EntradaHistorial[];
  onVerInforme: (entrada: EntradaHistorial) => void;
  onEliminar: (id: string) => void;
}

export const HistorialDias: React.FC<HistorialDiasProps> = ({
  historial,
  onVerInforme,
  onEliminar,
}) => {
  const [abierto, setAbierto] = useState(false);

  if (historial.length === 0) return null;

  const formatFecha = (fecha: string) => {
    const [y, m, d] = fecha.split('-');
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('es-CO', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header colapsable */}
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-yellow-50 rounded-xl">
            <History size={18} className="text-yellow-600" />
          </div>
          <div className="text-left">
            <h3 className="font-black text-slate-800 text-base">Historial de Días Anteriores</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {historial.length} jornada{historial.length !== 1 ? 's' : ''} guardada{historial.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {abierto ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>

      {/* Lista */}
      {abierto && (
        <div className="px-6 pb-6 space-y-3">
          {historial.map((entrada) => (
            <div
              key={entrada.id}
              className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white rounded-xl border border-slate-100 shadow-sm">
                  <Calendar size={15} className="text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">{formatFecha(entrada.fecha)}</p>
                  <p className="text-[11px] font-bold text-slate-400">
                    {entrada.registros.length} registro{entrada.registros.length !== 1 ? 's' : ''} ·{' '}
                    {entrada.registros.reduce((s, r) => s + r.donaciones.cantidadDonantes, 0)} donantes
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-black text-emerald-600">${entrada.totalDonaciones.toLocaleString('es-CO')}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">total</p>
                </div>
                <button
                  onClick={() => onVerInforme(entrada)}
                  className="p-2 bg-slate-900 text-white rounded-xl hover:bg-emerald-600 transition-all"
                  title="Ver informe"
                >
                  <Eye size={15} />
                </button>
                <button
                  onClick={() => onEliminar(entrada.id)}
                  className="p-2 bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                  title="Eliminar"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
