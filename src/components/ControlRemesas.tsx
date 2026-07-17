'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Calendar, ShieldAlert, CheckCircle, Shield, RefreshCw, X, AlertCircle, Trash2, Edit2, Save, XCircle, History, User, ArrowRight, Package, FileText, MapPin, Users, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabaseRemesas as supabase } from '@/lib/supabaseRemesas';
import { supabase as supabasePrincipal } from '@/lib/supabase';
import { calcularDiasRemesas } from '@/utils/remesas';
import { calcularDescuentoARLPila } from '@/utils/calcularDescuentoARL';

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

const getLocalYYYYMMDD = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
};

interface Persona {
  cedula: string;
  nombre: string;
  cargo: string;
  valor_turno?: number;
  valor_hora_adicional?: number;
}

interface RegistroRemesa {
  id: string;
  cedula_trabajador: string;
  tipo: 'ingreso' | 'retiro' | 're-ingreso';
  fecha: string;
  creado_at?: string;
}

// ── Tipos para agrupación ─────────────────────────────────────────────────────
interface GrupoPunto {
  nombre: string;
  trabajadores: Persona[];
}

const PUNTOS_DEFAULT = [
  'Belalcázar Guabinas',
  'Belalcázar Principal',
  'Guabinas Centro',
  'Bolívar',
  'Remesas Central',
];

// ─────────────────────────────────────────────────────────────────────────────

const RegistroEditable: React.FC<{
  registro: RegistroRemesa;
  onEditar: (r: RegistroRemesa) => void;
  onEliminar: () => void;
  procesando: boolean;
}> = ({ registro, onEditar, onEliminar, procesando }) => {
  const [editando, setEditando] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState(registro.fecha);
  const [nuevoTipo, setNuevoTipo] = useState(registro.tipo);

  const guardar = () => {
    onEditar({ ...registro, fecha: nuevaFecha, tipo: nuevoTipo });
    setEditando(false);
  };

  const cancelar = () => {
    setNuevaFecha(registro.fecha);
    setNuevoTipo(registro.tipo);
    setEditando(false);
  };

  if (editando) {
    return (
      <div className="flex items-center gap-2 p-3 bg-amber-50/50 border border-amber-200 rounded-2xl flex-wrap">
        <select
          value={nuevoTipo}
          onChange={e => setNuevoTipo(e.target.value as any)}
          className="px-3 py-1.5 border border-white rounded-xl shadow-sm text-xs font-bold outline-none bg-white text-amber-900"
        >
          <option value="ingreso">Ingreso</option>
          <option value="retiro">Retiro</option>
          <option value="re-ingreso">Re-ingreso</option>
        </select>
        <input
          type="date"
          value={nuevaFecha}
          onChange={e => setNuevaFecha(e.target.value)}
          className="px-3 py-1.5 border border-white rounded-xl shadow-sm text-xs font-bold outline-none"
        />
        <div className="flex gap-2 ml-auto">
          <button onClick={guardar} disabled={procesando} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-xl text-[10px] font-black hover:bg-amber-700 transition-all shadow-sm">
            <Save size={12} /> Guardar
          </button>
          <button onClick={cancelar} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-500 border border-slate-100 rounded-xl text-[10px] font-black hover:bg-slate-50 transition-all shadow-sm">
            <XCircle size={12} /> Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between p-3 bg-white border border-gray-100 rounded-2xl hover:border-amber-200 hover:shadow-sm transition-all">
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-xl ${registro.tipo === 'retiro' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
          <ShieldAlert size={15} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded
              ${registro.tipo === 'ingreso' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : registro.tipo === 'retiro' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
              {registro.tipo}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Efectivo el:</span>
          </div>
          <span className="text-xs text-slate-600 font-black flex items-center gap-1.5">
            <Calendar size={12} className="text-slate-300" />
            {new Date(registro.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditando(true)} disabled={procesando} title="Editar" className="p-2 text-slate-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-all">
          <Edit2 size={14} />
        </button>
        <button onClick={onEliminar} disabled={procesando} title="Eliminar" className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

const FilaTrabajadorRemesa: React.FC<{
  persona: Persona;
  mes: number;
  year: number;
  refreshTrigger: number;
  registrosPersona: RegistroRemesa[];
  onRegistrar: (cedula: string, tipo?: 'ingreso' | 'retiro' | 're-ingreso', fecha?: string) => void;
  onReiniciar: (cedula: string, nombre: string) => void;
  onEditarRegistro: (registro: RegistroRemesa) => void;
  onEliminarRegistro: (id: string, nombre: string) => void;
  onClick: () => void;
  procesando: boolean;
  globalFecha: string;
  seleccionado: boolean;
  onToggleSeleccion: () => void;
  puntosAsignados: string[];   // nombres de puntos donde está este trabajador
}> = ({ persona, mes, year, refreshTrigger, registrosPersona, onRegistrar, onReiniciar, onEditarRegistro, onEliminarRegistro, onClick, procesando, globalFecha, seleccionado, onToggleSeleccion, puntosAsignados }) => {
  const [dias, setDias] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<'ingreso' | 'retiro' | null>(null);
  const [fechaTemp, setFechaTemp] = useState(globalFecha);

  useEffect(() => {
    setFechaTemp(globalFecha);
  }, [globalFecha]);

  useEffect(() => {
    calcularDiasRemesas(persona.cedula, mes, year).then(setDias);
  }, [persona.cedula, mes, year, refreshTrigger]);

  const descuentoReal = dias !== null ? calcularDescuentoARLPila(dias) : 0;
  const regReciente = registrosPersona.length > 0 ? registrosPersona[0] : null;
  const ultimoEstado = regReciente ? regReciente.tipo : null;
  const esActivo = (ultimoEstado === 'ingreso' || ultimoEstado === 're-ingreso' || ultimoEstado === null);

  return (
    <tr
      className={`group border-b border-gray-100 transition-all cursor-pointer relative overflow-hidden ${seleccionado ? 'bg-amber-50/60' : 'hover:bg-amber-50/40'}`}
      onClick={onClick}
    >
      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <input
            type="checkbox"
            checked={seleccionado}
            onChange={onToggleSeleccion}
            className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 transition-all cursor-pointer"
          />
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${seleccionado ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 group-hover:bg-amber-100 group-hover:text-amber-600'}`}>
              <User size={18} />
            </div>
            <div>
              <p className={`font-black text-sm leading-tight transition-colors ${seleccionado ? 'text-amber-700' : 'text-slate-800 group-hover:text-amber-700'}`}>{persona.nombre}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{persona.cargo} · {persona.cedula}</p>
              {puntosAsignados.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {puntosAsignados.map(p => (
                    <span key={p} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-lg text-[9px] font-black">
                      <MapPin size={8} /> {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-center">
        {ultimoEstado === null ? (
          <div className="flex flex-col items-center">
            <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 w-max">
              <Shield size={10} /> Activo (Auto)
            </span>
          </div>
        ) : esActivo ? (
          <div className="flex flex-col items-center">
            <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 w-max">
              <Shield size={10} /> Activo
            </span>
            <span className="text-[9px] text-slate-400 mt-1 font-bold">{regReciente?.fecha}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="bg-rose-50 text-rose-600 border border-rose-200 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 w-max">
              <X size={10} /> Retirado
            </span>
            <span className="text-[9px] text-slate-400 mt-1 font-bold">{regReciente?.fecha}</span>
          </div>
        )}
      </td>
      <td className="px-5 py-4 text-center">
        {dias === null ? (
          <span className="animate-pulse text-slate-300 font-black">...</span>
        ) : (
          <div className="inline-flex flex-col items-center">
            <span className={`px-3 py-1 rounded-xl text-xs font-black flex items-center justify-center gap-1 w-max
              ${dias === 30 ? 'bg-emerald-100 text-emerald-700' : dias === 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
              {dias} {dias === 1 ? 'Día' : 'Días'}
            </span>
          </div>
        )}
      </td>
      <td className="px-5 py-4 text-center font-black text-slate-600 text-sm">
        {dias === null ? '...' : fmt(descuentoReal)}
      </td>
      <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex gap-2 justify-end items-center">
          {confirmando ? (
            <div className="flex items-center gap-2 bg-amber-50 p-1.5 rounded-2xl border border-amber-100 animate-in slide-in-from-right-2 duration-200">
              <input
                type="date"
                value={fechaTemp}
                onChange={e => setFechaTemp(e.target.value)}
                className="bg-white border border-amber-200 rounded-xl px-2 py-1 text-[10px] font-black outline-none text-amber-900 shadow-sm"
              />
              <button
                onClick={() => {
                  onRegistrar(persona.cedula, confirmando === 'ingreso' ? (ultimoEstado === 'retiro' ? 're-ingreso' : 'ingreso') : 'retiro', fechaTemp);
                  setConfirmando(null);
                }}
                className="p-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all shadow-sm"
              >
                <CheckCircle size={14} />
              </button>
              <button onClick={() => setConfirmando(null)} className="p-1.5 bg-white text-slate-400 rounded-lg hover:bg-slate-100 transition-all border border-slate-100">
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <button
                disabled={procesando || esActivo}
                onClick={() => { setConfirmando('ingreso'); setFechaTemp(globalFecha); }}
                className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider bg-emerald-600/10 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100 disabled:opacity-20"
              >
                In
              </button>
              <button
                disabled={procesando || (!esActivo && ultimoEstado !== null)}
                onClick={() => { setConfirmando('retiro'); setFechaTemp(globalFecha); }}
                className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all border border-rose-100 disabled:opacity-20"
              >
                Out
              </button>
              <button onClick={onClick} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm border border-slate-100">
                <Edit2 size={15} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

const ModalUI: React.FC<{ titulo: string, onClose: () => void, children: React.ReactNode }> = ({ titulo, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative border border-white/20 animate-in zoom-in-95 duration-200">
      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white">
        <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase">{titulo}</h3>
        <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl transition-all">
          <X size={20} className="text-slate-400" />
        </button>
      </div>
      <div className="p-8 overflow-y-auto bg-slate-50/30">{children}</div>
    </div>
  </div>
);

// ── Drawer lateral de Agrupación por Puntos ──────────────────────────────────
const DrawerAgrupacion: React.FC<{
  visible: boolean;
  onClose: () => void;
  seleccionados: string[];
  grupos: Record<string, Persona[]>;
  puntos: string[];
  onAsignar: (punto: string) => void;
  onQuitarDePunto: (punto: string, cedula: string) => void;
  onVaciarPunto: (punto: string) => void;
  onAgregarPunto: (nombre: string) => void;
  onImprimir: (puntosAMostrar?: string[]) => void;
  onLimpiarSel: () => void;
}> = ({ visible, onClose, seleccionados, grupos, puntos, onAsignar, onQuitarDePunto, onVaciarPunto, onAgregarPunto, onImprimir, onLimpiarSel }) => {
  const [puntoActivo, setPuntoActivo] = useState<string | null>(null);
  const [nuevoPunto, setNuevoPunto] = useState('');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const toggleAbrir = (p: string) => setAbiertos(prev => ({ ...prev, [p]: !prev[p] }));

  const agregarPunto = () => {
    const nombre = nuevoPunto.trim();
    if (!nombre || puntos.includes(nombre)) return;
    onAgregarPunto(nombre);
    setNuevoPunto('');
    setPuntoActivo(nombre);
  };

  const puntosConDatos = puntos.filter(p => grupos[p] && grupos[p].length > 0);

  if (!visible) return null;

  return (
    <>
      {/* Overlay oscuro */}
      <div
        className="fixed inset-0 z-[50] bg-slate-900/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-[380px] max-w-[95vw] z-[51] bg-white shadow-2xl flex flex-col border-l border-indigo-100 overflow-hidden">
        {/* Header drawer */}
        <div className="flex items-center justify-between px-5 py-4 bg-indigo-600 text-white shrink-0">
          <div className="flex items-center gap-2">
            <MapPin size={18} />
            <div>
              <div className="font-black text-base leading-none">Clasificar por Puntos</div>
              <div className="text-indigo-200 text-[10px] font-bold mt-0.5">
                {seleccionados.length > 0 ? `${seleccionados.length} trabajador(es) marcados` : 'Marca trabajadores con ☑ en la tabla'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-indigo-700 rounded-xl transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Selección actual */}
          {seleccionados.length > 0 && (
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-indigo-500" />
                <span className="text-sm font-black text-indigo-800">{seleccionados.length} trabajador(es) seleccionado(s)</span>
              </div>
              <button onClick={onLimpiarSel} className="text-xs text-rose-400 hover:text-rose-600 font-black flex items-center gap-1">
                <X size={12} /> Limpiar
              </button>
            </div>
          )}

          {/* PASO 1: Elegir punto */}
          <div>
            <p className="text-[11px] font-black text-indigo-700 uppercase tracking-wider mb-2">① Elige un punto de trabajo:</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {puntos.map(p => (
                <button
                  key={p}
                  onClick={() => setPuntoActivo(prev => prev === p ? null : p)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-black transition-all ${
                    puntoActivo === p
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                      : 'bg-slate-50 text-indigo-700 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'
                  }`}
                >
                  <MapPin size={10} /> {p}
                  {grupos[p] && grupos[p].length > 0 && (
                    <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                      puntoActivo === p ? 'bg-white/25 text-white' : 'bg-indigo-100 text-indigo-600'
                    }`}>{grupos[p].length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={nuevoPunto}
                onChange={e => setNuevoPunto(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarPunto()}
                placeholder="+ Nuevo punto…"
                maxLength={40}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:border-indigo-400 text-slate-800"
              />
              <button
                onClick={agregarPunto}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-lg font-black hover:bg-indigo-700 transition-all leading-none"
              >+</button>
            </div>
          </div>

          {/* PASO 2: Asignar */}
          <div>
            <p className="text-[11px] font-black text-indigo-700 uppercase tracking-wider mb-2">② Asigna al punto seleccionado:</p>
            <button
              disabled={seleccionados.length === 0 || !puntoActivo}
              onClick={() => { if (puntoActivo) onAsignar(puntoActivo); setPuntoActivo(null); }}
              className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Users size={16} />
              {puntoActivo
                ? `Asignar ${seleccionados.length} → "${puntoActivo}"`
                : 'Selecciona un punto arriba ↑'}
            </button>
          </div>

          {/* Grupos formados */}
          {puntosConDatos.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-black text-indigo-700 uppercase tracking-wider">Grupos formados:</p>
                <button
                  onClick={() => onImprimir(puntosConDatos)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 transition-all"
                >
                  <Printer size={11} /> Imprimir todo
                </button>
              </div>
              <div className="space-y-2">
                {puntosConDatos.map(p => (
                  <div key={p} className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-indigo-50 transition-colors"
                      onClick={() => toggleAbrir(p)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {abiertos[p] ? <ChevronDown size={14} className="text-indigo-400 shrink-0" /> : <ChevronRight size={14} className="text-indigo-400 shrink-0" />}
                        <MapPin size={12} className="text-indigo-500 shrink-0" />
                        <span className="text-sm font-black text-slate-800 truncate">{p}</span>
                        <span className="bg-indigo-100 text-indigo-600 text-[9px] font-black px-2 py-0.5 rounded-full shrink-0">{grupos[p].length}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={e => { e.stopPropagation(); onImprimir([p]); }} title="Ver lista" className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all">
                          <Printer size={12} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); if (confirm(`¿Vaciar "${p}"?`)) onVaciarPunto(p); }} title="Vaciar" className="p-1.5 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    {abiertos[p] && (
                      <div className="px-3 pb-3 space-y-1.5 border-t border-slate-200">
                        {grupos[p].map((t, i) => (
                          <div key={t.cedula} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-black text-indigo-300 w-4 shrink-0">{i + 1}.</span>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-700 truncate">{t.nombre}</p>
                                <p className="text-[9px] text-slate-400 font-bold">{t.cedula}</p>
                              </div>
                            </div>
                            <button onClick={() => onQuitarDePunto(p, t.cedula)} className="p-1 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all shrink-0 ml-2">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {puntosConDatos.length === 0 && seleccionados.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">📍</div>
              <p className="text-slate-500 font-bold text-sm">Usa los checkboxes de la tabla para seleccionar trabajadores, luego elige un punto y asígnalos.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── Componente Planilla Turnos Interactivo ───────────────────────────────────────
const formatCurrency = (amount: number) => '$ ' + amount.toLocaleString('es-CO');

const FilaPlanilla: React.FC<{
  t: Persona;
  dates: string[];
  globalStart: string;
  globalEnd: string;
  onTotalChange: (cedula: string, total: number) => void;
  exportSelected: boolean;
  onToggleExport: (cedula: string) => void;
}> = ({ t, dates, globalStart, globalEnd, onTotalChange, exportSelected, onToggleExport }) => {
  const [ingreso, setIngreso] = useState(globalStart);
  const [retiro, setRetiro] = useState(globalEnd);
  const [valorTurno, setValorTurno] = useState(t.valor_turno || 58363);
  const [states, setStates] = useState<Record<string, 'present'|'absent'|'na'>>({});

  // Sync when global dates change, if we haven't touched them
  useEffect(() => { setIngreso(globalStart); }, [globalStart]);
  useEffect(() => { setRetiro(globalEnd); }, [globalEnd]);

  useEffect(() => {
    setStates(prev => {
      const startD = ingreso ? new Date(ingreso + 'T12:00:00') : null;
      const endD = retiro ? new Date(retiro + 'T12:00:00') : null;
      const newSt = { ...prev };
      dates.forEach(d => {
        const curr = new Date(d + 'T12:00:00');
        const outOfBounds = (startD && curr < startD) || (endD && curr > endD);
        if (outOfBounds) {
          newSt[d] = 'na';
        } else {
          if (newSt[d] === 'na' || newSt[d] === undefined) newSt[d] = 'present';
        }
      });
      return newSt;
    });
  }, [dates, ingreso, retiro]);

  const toggleDay = (d: string) => {
    const startD = ingreso ? new Date(ingreso + 'T12:00:00') : null;
    const endD = retiro ? new Date(retiro + 'T12:00:00') : null;
    const curr = new Date(d + 'T12:00:00');
    if ((startD && curr < startD) || (endD && curr > endD)) return;

    setStates(prev => {
      const old = prev[d];
      let nx: 'present'|'absent'|'na' = 'present';
      if (old === 'present') nx = 'absent';
      else if (old === 'absent') nx = 'na';
      else nx = 'present';
      return { ...prev, [d]: nx };
    });
  };

  const daysWorked = dates.filter(d => states[d] === 'present').length;
  const total = daysWorked * valorTurno;

  useEffect(() => {
    onTotalChange(t.cedula, total);
  }, [total, t.cedula, onTotalChange]);

  return (
    <tr className="bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors planilla-row">
      <td className="px-2 py-2 text-center" style={{ width: '30px' }}>
        <input 
          type="checkbox" 
          checked={exportSelected} 
          onChange={() => onToggleExport(t.cedula)} 
          className="export-checkbox cursor-pointer accent-indigo-600 rounded-sm" 
          title="Incluir en PDF"
        />
      </td>
      <td className="px-3 py-2 text-xs font-bold text-slate-800 name-col">{t.nombre}</td>
      <td className="px-1 py-1"><input type="date" value={ingreso} onChange={e => setIngreso(e.target.value)} className="w-[100px] text-[10px] p-1 border border-slate-200 rounded font-mono outline-none input-ingreso" /></td>
      <td className="px-1 py-1"><input type="date" value={retiro} onChange={e => setRetiro(e.target.value)} className="w-[100px] text-[10px] p-1 border border-slate-200 rounded font-mono outline-none input-retiro" /></td>
      {dates.map(d => {
        const st = states[d];
        const outOfBounds = (ingreso && new Date(d+'T12:00:00') < new Date(ingreso+'T12:00:00')) || (retiro && new Date(d+'T12:00:00') > new Date(retiro+'T12:00:00'));
        let cellCls = "cursor-pointer text-center font-black text-[10px] min-w-[28px] border-r border-slate-50 day-cell ";
        let txt = "";
        let finalSt = st;
        if (outOfBounds || st === 'na') { cellCls += "text-slate-300 bg-slate-50"; txt = "-"; finalSt = 'na'; }
        else if (st === 'present') { cellCls += "text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100"; txt = "✓"; }
        else if (st === 'absent') { cellCls += "text-rose-600 bg-rose-50 hover:bg-rose-100"; txt = "NO"; }
        return <td key={d} data-state={finalSt} className={cellCls} onClick={() => toggleDay(d)}>{txt}</td>
      })}
      <td className="px-3 py-2 text-center font-black text-slate-700 val-days">{daysWorked}</td>
      <td className="px-3 py-2 text-center font-black text-slate-400 val-arl">{daysWorked}</td>
      <td className="px-2 py-1"><input type="number" value={valorTurno} onChange={e => setValorTurno(parseInt(e.target.value)||0)} className="w-20 text-right text-[11px] font-bold p-1 border border-slate-200 rounded outline-none input-turno" /></td>
      <td className="px-3 py-2 text-right font-black text-emerald-600 val-total" data-raw={total}>{formatCurrency(total)}</td>
    </tr>
  );
};

const PlanillaTurnos: React.FC<{ punto: string, trabajadores: Persona[] }> = ({ punto, trabajadores }) => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [totales, setTotales] = useState<Record<string, number>>({});
  const [exportSeleccionados, setExportSeleccionados] = useState<string[]>(trabajadores.map(t => t.cedula));

  const toggleAllExport = () => {
    if (exportSeleccionados.length === trabajadores.length) {
      setExportSeleccionados([]);
    } else {
      setExportSeleccionados(trabajadores.map(t => t.cedula));
    }
  };

  const toggleExportP = (cedula: string) => {
    setExportSeleccionados(prev => prev.includes(cedula) ? prev.filter(c => c !== cedula) : [...prev, cedula]);
  };

  const handleTotalChange = useCallback((cedula: string, total: number) => {
    setTotales(prev => ({ ...prev, [cedula]: total }));
  }, []);

  const dates = React.useMemo(() => {
    if (!startDate || !endDate) return [];
    let start = new Date(startDate + 'T12:00:00');
    let end = new Date(endDate + 'T12:00:00');
    if (start > end) return [];
    const out = [];
    while (start <= end) {
      out.push(start.toISOString().split('T')[0]);
      start.setDate(start.getDate() + 1);
    }
    return out;
  }, [startDate, endDate]);

  const grandTotal = Object.values(totales).reduce((a, b) => a + b, 0);

  const exportPdf = () => {
    // Generamos el HTML plano y abrimos window.print() como en la app original
    const container = document.getElementById(`planilla-${punto.replace(/\s+/g,'-')}`);
    if (!container) return;

    if (exportSeleccionados.length === 0) {
      alert("Debes seleccionar al menos un trabajador para exportar al PDF.");
      return;
    }

    let rowsHTML = '';
    let pdfTotal = 0;
    const trs = container.querySelectorAll('.planilla-row');
    trs.forEach(tr => {
      const cb = tr.querySelector('.export-checkbox') as HTMLInputElement;
      if (cb && !cb.checked) return; // Saltar si no está seleccionado

      const nombre = tr.querySelector('.name-col')?.textContent || '';
      const inVal = (tr.querySelector('.input-ingreso') as HTMLInputElement)?.value || '-';
      const outVal = (tr.querySelector('.input-retiro') as HTMLInputElement)?.value || '-';
      
      const inFmt = inVal !== '-' ? new Date(inVal+'T12:00:00').toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'}) : '-';
      const outFmt = outVal !== '-' ? new Date(outVal+'T12:00:00').toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'}) : '-';

      let daysHTML = '';
      tr.querySelectorAll('.day-cell').forEach(td => {
        const st = td.getAttribute('data-state');
        let cls = st === 'present' ? 'color:#059669;font-weight:bold;' : st === 'absent' ? 'color:#dc2626;font-weight:bold;' : 'color:#94a3b8;background:#f1f5f9;';
        daysHTML += `<td style="border: 1px solid #cbd5e1; padding: 4px; text-align: center; font-size: 10px; ${cls}">${td.textContent}</td>`;
      });

      const wrk = tr.querySelector('.val-days')?.textContent || '0';
      const arl = tr.querySelector('.val-arl')?.textContent || '0';
      const turn = formatCurrency(parseFloat((tr.querySelector('.input-turno') as HTMLInputElement)?.value || '0'));
      const totElem = tr.querySelector('.val-total');
      const totNum = parseInt(totElem?.getAttribute('data-raw') || '0');
      const totStr = totElem?.textContent || '$0';

      pdfTotal += totNum;

      rowsHTML += `<tr>
        <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 10px; text-align: left; font-weight: 600;">${nombre}</td>
        <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 10px; text-align: center;">${inFmt}</td>
        <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 10px; text-align: center;">${outFmt}</td>
        ${daysHTML}
        <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 10px; text-align: center;">${wrk}</td>
        <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 10px; text-align: center;">${arl}</td>
        <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 10px; text-align: right;">${turn}</td>
        <td style="border: 1px solid #cbd5e1; padding: 4px; font-size: 10px; text-align: right; font-weight:bold; color:#059669;">${totStr}</td>
      </tr>`;
    });

    let headersHTML = '';
    dates.forEach(d => {
      const dd = new Date(d+'T12:00:00');
      const mes = dd.toLocaleString('es-ES', { month: 'short' });
      const dia = dd.getDate();
      headersHTML += `<th style="border: 1px solid #cbd5e1; padding: 4px; font-size: 9px; text-align: center;"><span style="display:block;color:#4f46e5;font-size:7px;text-transform:uppercase;">${mes}</span>${dia}</th>`;
    });

    const fIn = new Date(startDate+'T12:00:00').toLocaleDateString('es-ES');
    const fOut = new Date(endDate+'T12:00:00').toLocaleDateString('es-ES');
    const hoy = new Date().toLocaleDateString('es-ES');

    const printWin = window.open('', '_blank');
    if(!printWin) return;
    printWin.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Planilla - ${punto}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; }
  h1 { font-size: 18px; border-bottom: 3px solid #4f46e5; padding-bottom: 6px; margin-bottom: 10px; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 15px; color: #475569; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f8fafc; border: 1px solid #cbd5e1; padding: 5px 4px; font-size: 10px; text-align: center; }
  @media print {
    @page { size: landscape; margin: 10mm; }
  }
</style>
</head>
<body>
<h1>Planilla de Trabajo: ${punto}</h1>
<div class="meta">
  <span><strong>Período:</strong> ${fIn} — ${fOut}</span>
  <span><strong>Generado:</strong> ${hoy}</span>
</div>
<table>
  <thead>
    <tr>
      <th style="text-align:left;min-width:120px;">Nombre</th>
      <th>Ingreso</th>
      <th>Retiro</th>
      ${headersHTML}
      <th>Días</th>
      <th>ARL</th>
      <th style="min-width:60px;">V. Turno</th>
      <th style="min-width:70px;">Total</th>
    </tr>
  </thead>
  <tbody>${rowsHTML}</tbody>
</table>
<div style="margin-top:20px; text-align:right; font-size:14px; font-weight:bold;">
  Total a Pagar (Seleccionados): <span style="color:#059669;">${formatCurrency(pdfTotal)}</span>
</div>
<div style="display:flex;gap:80px;margin-top:40px;">
  <div style="width:180px;border-top:1px solid #000;text-align:center;padding-top:4px;font-size:11px;">Coordinación</div>
  <div style="width:180px;border-top:1px solid #000;text-align:center;padding-top:4px;font-size:11px;">Aprobación</div>
</div>
<script>
  window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
</script>
</body>
</html>`);
    printWin.document.close();
  };

  return (
    <div className="mb-10 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden" id={`planilla-${punto.replace(/\s+/g,'-')}`}>
      <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <MapPin size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-black text-indigo-900 leading-tight">{punto}</h3>
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{trabajadores.length} Trabajadores</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm">
            <span className="text-[10px] font-black text-indigo-400 uppercase">Inicio</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-xs font-bold outline-none text-slate-700 bg-transparent" />
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm">
            <span className="text-[10px] font-black text-indigo-400 uppercase">Fin</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-xs font-bold outline-none text-slate-700 bg-transparent" />
          </div>
          <button onClick={exportPdf} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">
            <Printer size={14} /> Exportar PDF
          </button>
        </div>
      </div>
      
      {dates.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-2 py-3 text-center sticky left-0 bg-slate-50 z-20 w-[30px] border-r border-slate-200">
                  <input 
                    type="checkbox" 
                    checked={trabajadores.length > 0 && exportSeleccionados.length === trabajadores.length}
                    onChange={toggleAllExport}
                    className="cursor-pointer accent-indigo-600 rounded-sm"
                    title="Seleccionar todos"
                  />
                </th>
                <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider sticky left-[30px] bg-slate-50 z-10 w-[180px]">Trabajador</th>
                <th className="px-1 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider w-[110px]">Ingreso</th>
                <th className="px-1 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider w-[110px]">Retiro</th>
                {dates.map(d => {
                  const curr = new Date(d+'T12:00:00');
                  return (
                    <th key={d} className="px-1 py-2 text-center border-r border-slate-100 min-w-[28px]">
                      <span className="block text-[8px] font-black text-indigo-500 uppercase leading-none mb-1">{curr.toLocaleString('es-ES', { month: 'short' })}</span>
                      <span className="block text-xs font-bold text-slate-700 leading-none">{curr.getDate()}</span>
                    </th>
                  )
                })}
                <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">Días</th>
                <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">ARL</th>
                <th className="px-2 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right w-24">V. Turno</th>
                <th className="px-3 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {trabajadores.map(t => (
                <FilaPlanilla 
                  key={t.cedula} t={t} dates={dates} globalStart={startDate} globalEnd={endDate} onTotalChange={handleTotalChange} 
                  exportSelected={exportSeleccionados.includes(t.cedula)}
                  onToggleExport={toggleExportP}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-400 font-bold text-sm">Fechas inválidas o rango vacío.</div>
      )}

      <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-4 border-t border-slate-200">
        <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Total a Pagar {punto}:</span>
        <span className="text-2xl font-black text-emerald-600">{formatCurrency(grandTotal)}</span>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────

const ControlRemesas: React.FC = () => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [registros, setRegistros] = useState<RegistroRemesa[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(getLocalYYYYMMDD());
  const [procesando, setProcesando] = useState(false);
  const [errorMSG, setErrorMSG] = useState<string | null>(null);
  const [personaSeleccionada, setPersonaSeleccionada] = useState<Persona | null>(null);
  const [showGlobalHistory, setShowGlobalHistory] = useState(false);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'retirados' | 'sin-actualizar' | 'actualizados'>('todos');
  const [mesACalcular, setMesACalcular] = useState(new Date().getMonth() + 1);
  const [yearACalcular, setYearACalcular] = useState(new Date().getFullYear());
  const [showGestionPersonal, setShowGestionPersonal] = useState(false);
  const [nuevoTrabajador, setNuevoTrabajador] = useState<Omit<Persona, 'id'> & { valor_turno: number, valor_hora_adicional: number }>({
    nombre: '', cedula: '', cargo: 'REMESAS', valor_turno: 0, valor_hora_adicional: 0
  });
  const [busquedaPrincipal, setBusquedaPrincipal] = useState('');
  const [resultadosPrincipal, setResultadosPrincipal] = useState<any[]>([]);
  const [buscandoPrincipal, setBuscandoPrincipal] = useState(false);

  // ── Estado agrupación ──────────────────────────────────────────────────────
  const [mostrarAgrupacion, setMostrarAgrupacion] = useState(false);
  const [puntos, setPuntos] = useState<string[]>(PUNTOS_DEFAULT);
  const [grupos, setGrupos] = useState<Record<string, Persona[]>>({});
  const [modalGrupoPuntos, setModalGrupoPuntos] = useState<string[] | null>(null);

  // ─────────────────────────────────────────────────────────────────────────

  const getRegistrosPersona = (cedula: string) =>
    registros.filter(r => r.cedula_trabajador === cedula).sort((a, b) => {
      const v = new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
      if (v === 0 && b.creado_at && a.creado_at) return new Date(b.creado_at).getTime() - new Date(a.creado_at).getTime();
      return v;
    });

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: pData }, { data: rData }] = await Promise.all([
        supabase.from('trabajadores').select('*').order('nombre'),
        supabase.from('registros_remesas').select('*').order('fecha', { ascending: false })
      ]);
      if (pData) setPersonas(pData);
      if (rData) setRegistros(rData);
    } catch (e: any) {
      setErrorMSG('Error al cargar datos de Remesas: ' + e.message + '. Asegúrate de que la tabla "registros_remesas" exista en Supabase.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const buscarEnBasePrincipal = async (term: string) => {
    setBusquedaPrincipal(term);
    if (term.length < 1) { setResultadosPrincipal([]); return; }
    setBuscandoPrincipal(true);
    try {
      const { data, error } = await supabasePrincipal
        .from('trabajadores')
        .select('*')
        .or(`nombre.ilike.%${term}%,cedula.ilike.%${term}%`)
        .limit(10);
      if (error) { setErrorMSG("Error al conectar con la base principal: " + error.message); }
      else { setResultadosPrincipal(data || []); }
    } catch (e: any) { setErrorMSG("Error de conexión: " + e.message); }
    setBuscandoPrincipal(false);
  };

  const seleccionarDePrincipal = (p: any) => {
    setNuevoTrabajador({ nombre: p.nombre, cedula: p.cedula, cargo: 'REMESAS', valor_turno: p.valor_turno || 0, valor_hora_adicional: p.valor_hora_adicional || 0 });
    setResultadosPrincipal([]);
    setBusquedaPrincipal('');
  };

  const agregarTrabajador = async () => {
    if (!nuevoTrabajador.nombre || !nuevoTrabajador.cedula) return alert('Nombre y Cédula son obligatorios');
    setProcesando(true);
    try {
      const { error } = await supabase.from('trabajadores').insert([{ ...nuevoTrabajador, id: Date.now().toString() }]);
      if (error) throw error;
      setNuevoTrabajador({ nombre: '', cedula: '', cargo: 'REMESAS', valor_turno: 0, valor_hora_adicional: 0 });
      await cargarDatos();
      alert('Trabajador agregado correctamente');
    } catch (e: any) { alert('Error: ' + e.message); }
    setProcesando(false);
  };

  const eliminarTrabajador = async (cedula: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar definitivamente a ${nombre}? Esto borrará también su historial.`)) return;
    setProcesando(true);
    try {
      const { error } = await supabase.from('trabajadores').delete().eq('cedula', cedula);
      if (error) throw error;
      await cargarDatos();
    } catch (e: any) { alert('Error: ' + e.message); }
    setProcesando(false);
  };

  const personasPreFiltradas = personas.filter(p => {
    const term = busqueda.toLowerCase();
    const matchesBusqueda = p.nombre.toLowerCase().includes(term) || p.cedula.includes(term);
    if (!matchesBusqueda) return false;
    if (filtroEstado === 'todos') return true;
    
    const reg = getRegistrosPersona(p.cedula);
    
    // El límite es 2 meses hacia atrás desde el mes seleccionado (Ej: Si es Julio, abarca Julio y Junio)
    const limiteReciente = new Date(yearACalcular, mesACalcular - 2, 1);

    if (filtroEstado === 'sin-actualizar') {
      if (reg.length === 0) return true;
      const latestFecha = new Date(reg[0].fecha + 'T12:00:00');
      return latestFecha < limiteReciente;
    }

    if (filtroEstado === 'actualizados') {
      if (reg.length === 0) return false;
      const latestFecha = new Date(reg[0].fecha + 'T12:00:00');
      return latestFecha >= limiteReciente;
    }

    const ultimo = reg.length > 0 ? reg[0].tipo : null;
    const esActivo = ultimo === 'ingreso' || ultimo === 're-ingreso' || ultimo === null;
    return filtroEstado === 'activos' ? esActivo : !esActivo;
  });

  const registrarEvento = async (cedula: string, tipoForzado?: 'ingreso' | 'retiro' | 're-ingreso', fechaForzada?: string) => {
    setProcesando(true);
    try {
      const regPersona = getRegistrosPersona(cedula);
      const ultimoEvento = regPersona.length > 0 ? regPersona[0].tipo : null;
      const nuevoTipo = tipoForzado || (!ultimoEvento ? 'ingreso' : (ultimoEvento === 'retiro' ? 're-ingreso' : 'retiro'));
      const { error } = await supabase.from('registros_remesas').insert({ cedula_trabajador: cedula, tipo: nuevoTipo, fecha: fechaForzada || fechaSeleccionada });
      if (error) throw error;
      await cargarDatos();
    } catch (e: any) { setErrorMSG('Error al registrar: ' + e.message); }
    setProcesando(false);
  };

  const editarRegistro = async (registro: RegistroRemesa) => {
    setProcesando(true);
    try {
      const { error } = await supabase.from('registros_remesas').update({ tipo: registro.tipo, fecha: registro.fecha }).eq('id', registro.id);
      if (error) throw error;
      await cargarDatos();
    } catch (e: any) { setErrorMSG('Error al editar: ' + e.message); }
    setProcesando(false);
  };

  const eliminarRegistro = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar este registro de ${nombre}?`)) return;
    setProcesando(true);
    try {
      const { error } = await supabase.from('registros_remesas').delete().eq('id', id);
      if (error) throw error;
      await cargarDatos();
    } catch (e: any) { setErrorMSG('Error al eliminar: ' + e.message); }
    setProcesando(false);
  };

  // ── Agrupación: helpers ────────────────────────────────────────────────────
  const getPuntosDePersona = (cedula: string): string[] =>
    Object.entries(grupos)
      .filter(([, arr]) => arr.some(t => t.cedula === cedula))
      .map(([p]) => p);

  const handleAsignar = (punto: string) => {
    if (seleccionados.length === 0) return;
    const personasASel = personas.filter(p => seleccionados.includes(p.cedula));
    setGrupos(prev => {
      const arrActual = prev[punto] || [];
      const nuevos = personasASel.filter(p => !arrActual.some(x => x.cedula === p.cedula));
      return { ...prev, [punto]: [...arrActual, ...nuevos] };
    });
    setSeleccionados([]);
  };

  const handleQuitarDePunto = (punto: string, cedula: string) => {
    setGrupos(prev => ({ ...prev, [punto]: (prev[punto] || []).filter(t => t.cedula !== cedula) }));
  };

  const handleVaciarPunto = (punto: string) => {
    setGrupos(prev => ({ ...prev, [punto]: [] }));
  };

  const handleAgregarPunto = (nombre: string) => {
    setPuntos(prev => [...prev, nombre]);
  };

  // ─────────────────────────────────────────────────────────────────────────

  const generarPDFRemesas = async () => {
    const listaAExportar = seleccionados.length > 0
      ? personasPreFiltradas.filter(p => seleccionados.includes(p.cedula))
      : personasPreFiltradas;

    if (listaAExportar.length === 0) return;
    setProcesando(true);
    try {
      const doc = new jsPDF();
      const mesNombre = new Date(yearACalcular, mesACalcular - 1).toLocaleString('es', { month: 'long' }).toUpperCase();
      doc.setFontSize(18);
      doc.setTextColor(217, 119, 6);
      doc.text("FUNDAMIGA - CONTROL DE REMESAS (ARL)", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`REPORTE DE AFILIACIONES Y NOVEDADES - REMESAS`, 14, 29);
      doc.text(`PERIODO: ${mesNombre} ${yearACalcular}`, 14, 36);
      doc.text(`GENERADO: ${new Date().toLocaleString('es-CO')}`, 14, 43);
      if (seleccionados.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(79, 70, 229);
        doc.text(`* Mostrando ${listaAExportar.length} trabajadores seleccionados`, 14, 48);
      }
      doc.setDrawColor(217, 119, 6);
      doc.line(14, 50, 196, 50);
      const rows = await Promise.all(listaAExportar.map(async (p) => {
        const dias = await calcularDiasRemesas(p.cedula, mesACalcular, yearACalcular);
        const valor = calcularDescuentoARLPila(dias);
        const regs = getRegistrosPersona(p.cedula);
        const ultimo = regs.length > 0 ? regs[0].tipo : 'activo';
        const estadoStr = (ultimo === 'ingreso' || ultimo === 're-ingreso' || ultimo === 'activo') ? 'ACTIVO' : 'RETIRADO';
        return [p.nombre, p.cedula, "REMESAS", estadoStr, dias, `$${valor.toLocaleString('es-CO')}`];
      }));
      autoTable(doc, {
        startY: 55,
        head: [['NOMBRE', 'CÉDULA', 'CARGO', 'ESTADO', 'DÍAS', 'DESCUENTO']],
        body: rows,
        headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [254, 252, 232] },
        styles: { fontSize: 8, cellPadding: 3, textColor: 50 },
        columnStyles: { 4: { halign: 'center' }, 5: { halign: 'right' } },
        didDrawPage: (data) => {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text("Página " + (doc as any).internal.getNumberOfPages(), data.settings.margin.left, doc.internal.pageSize.height - 10);
        }
      });
      const totalARL = rows.reduce((acc, r) => acc + parseInt(String(r[5]).replace(/[^0-9]/g, '')), 0);
      const finalY = (doc as any).lastAutoTable.finalY || 150;
      if (finalY + 20 > doc.internal.pageSize.height) doc.addPage();
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(`TOTAL ESTIMADO ARL REMESAS: $${totalARL.toLocaleString('es-CO')}`, 196, (doc as any).lastAutoTable.finalY + 12, { align: 'right' });
      doc.save(`Informe_Remesas_ARL_${mesNombre}_${yearACalcular}.pdf`);
    } catch (error) { console.error("Error PDF:", error); alert("Hubo un error al generar el informe PDF de remesas."); }
    setProcesando(false);
  };

  return (
    <div className="w-full bg-white rounded-3xl border border-gray-200 shadow-sm p-8">
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-8 bg-amber-500 rounded-full" />
            <div className="h-2 w-3 bg-orange-400 rounded-full" />
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Control <span className="text-amber-600">REMESAS</span></h2>
          <p className="text-slate-500 font-medium text-sm mt-1">Gestión exclusiva para trabajadores de Remesas.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-gray-200 flex items-center gap-2">
            <Calendar size={15} className="text-amber-500" />
            <input type="date" value={fechaSeleccionada} onChange={e => setFechaSeleccionada(e.target.value)} className="bg-transparent border-none outline-none text-sm font-bold text-slate-800" />
          </div>
          <button onClick={() => setShowGlobalHistory(true)} className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-200">
            <History size={16} /> Historial
          </button>
          <button
            onClick={generarPDFRemesas}
            disabled={procesando || personasPreFiltradas.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
          >
            <FileText size={16} /> Generar PDF
          </button>
          {/* ── Botón Clasificar por Puntos ── */}
          <button
            onClick={() => { setMostrarAgrupacion(p => !p); if (!mostrarAgrupacion) setSeleccionados([]); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${
              mostrarAgrupacion
                ? 'bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700'
                : 'bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100'
            }`}
          >
            <MapPin size={16} /> {mostrarAgrupacion ? 'Ocultar Puntos' : 'Clasificar por Puntos'}
          </button>
          <button onClick={() => setShowGestionPersonal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-slate-200">
            <User size={16} /> Gestionar Personal
          </button>
          <button onClick={cargarDatos} className="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-slate-500 hover:text-amber-600 transition-all">
            <RefreshCw size={18} className={loading ? 'animate-spin text-amber-600' : ''} />
          </button>
        </div>
      </div>

      {errorMSG && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3 text-red-700">
          <AlertCircle className="shrink-0 mt-0.5" size={18} />
          <p className="text-sm font-semibold">{errorMSG}</p>
        </div>
      )}

      {/* Banner informativo cuando modo clasificación está activo */}
      {mostrarAgrupacion && (
        <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center gap-3 text-indigo-700 text-sm font-bold">
          <MapPin size={16} className="shrink-0 text-indigo-500" />
          Modo clasificación activo: usa los checkboxes para seleccionar trabajadores y asignarlos a un punto de trabajo.
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-gray-100">
          <button onClick={() => setFiltroEstado('todos')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'todos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>Todos</button>
          <button onClick={() => setFiltroEstado('activos')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'activos' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>Activos</button>
          <button onClick={() => setFiltroEstado('retirados')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'retirados' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}>Retirados</button>
          <button onClick={() => setFiltroEstado('actualizados')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'actualizados' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Actualizados</button>
          <button onClick={() => setFiltroEstado('sin-actualizar')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'sin-actualizar' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}>Sin Actualizar</button>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5">
          <select value={mesACalcular} onChange={e => setMesACalcular(Number(e.target.value))} className="px-3 py-1.5 bg-white border border-amber-200 rounded-xl text-sm font-bold text-amber-900 outline-none">
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={m}>{new Date(2000, m-1).toLocaleString('es', { month: 'long' }).toUpperCase()}</option>
            ))}
          </select>
          <select value={yearACalcular} onChange={e => setYearACalcular(Number(e.target.value))} className="px-3 py-1.5 bg-white border border-amber-200 rounded-xl text-sm font-bold text-amber-900 outline-none">
            {[yearACalcular - 1, yearACalcular, yearACalcular + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-gray-200">
          <Search size={15} className="text-slate-400" />
          <input placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="bg-transparent border-none outline-none text-sm font-semibold text-slate-700 w-48" />
        </div>
        {seleccionados.length > 0 && (
          <div className="flex items-center gap-2 bg-indigo-100 px-4 py-2.5 rounded-xl border border-indigo-200">
            <Users size={14} className="text-indigo-600" />
            <span className="text-indigo-700 font-black text-sm">{seleccionados.length} seleccionados</span>
            <button onClick={() => setSeleccionados([])} className="text-indigo-400 hover:text-indigo-600 ml-1">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-gray-200">
            <tr>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trabajador</th>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado</th>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Días Remesas</th>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Total Estimado</th>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-16 text-center text-slate-400 font-bold animate-pulse">Cargando...</td></tr>
            ) : personasPreFiltradas.length === 0 ? (
              <tr><td colSpan={5} className="py-16 text-center text-slate-400 font-bold">Sin trabajadores de Remesas encontrados</td></tr>
            ) : (
              personasPreFiltradas.map((p, idx) => (
                <FilaTrabajadorRemesa
                  key={`${p.cedula}-${idx}`}
                  persona={p}
                  mes={mesACalcular}
                  year={yearACalcular}
                  refreshTrigger={registros.length}
                  registrosPersona={getRegistrosPersona(p.cedula)}
                  onRegistrar={registrarEvento}
                  onReiniciar={() => {}}
                  onEditarRegistro={editarRegistro}
                  onEliminarRegistro={eliminarRegistro}
                  onClick={() => setPersonaSeleccionada(p)}
                  procesando={procesando}
                  globalFecha={fechaSeleccionada}
                  seleccionado={seleccionados.includes(p.cedula)}
                  onToggleSeleccion={() => setSeleccionados(prev => prev.includes(p.cedula) ? prev.filter(c => c !== p.cedula) : [...prev, p.cedula])}
                  puntosAsignados={getPuntosDePersona(p.cedula)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Drawer lateral de clasificación por puntos ── */}
      <DrawerAgrupacion
        visible={mostrarAgrupacion}
        onClose={() => setMostrarAgrupacion(false)}
        seleccionados={seleccionados}
        grupos={grupos}
        puntos={puntos}
        onAsignar={handleAsignar}
        onQuitarDePunto={handleQuitarDePunto}
        onVaciarPunto={handleVaciarPunto}
        onAgregarPunto={handleAgregarPunto}
        onImprimir={(pts) => setModalGrupoPuntos(pts || puntos.filter(p => grupos[p] && grupos[p].length > 0))}
        onLimpiarSel={() => setSeleccionados([])}
      />

      {/* Modales */}
      {personaSeleccionada && (
        <ModalUI titulo={`Gestionar Remesas: ${personaSeleccionada.nombre}`} onClose={() => setPersonaSeleccionada(null)}>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => registrarEvento(personaSeleccionada.cedula, 'ingreso')} className="p-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Registrar Ingreso</button>
              <button onClick={() => registrarEvento(personaSeleccionada.cedula, 'retiro')} className="p-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Registrar Retiro</button>
            </div>
            <div className="space-y-2">
              <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">Historial Remesas</h4>
              {getRegistrosPersona(personaSeleccionada.cedula).map(r => (
                <RegistroEditable key={r.id} registro={r} onEditar={editarRegistro} onEliminar={() => eliminarRegistro(r.id, personaSeleccionada.nombre)} procesando={procesando} />
              ))}
            </div>
          </div>
        </ModalUI>
      )}

      {showGestionPersonal && (
        <ModalUI titulo="Gestión de Personal de Remesas" onClose={() => setShowGestionPersonal(false)}>
          <div className="space-y-6">
            <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
              <h4 className="font-black text-amber-900 text-xs uppercase tracking-widest mb-4">Agregar Nuevo Trabajador</h4>
              <div className="mb-6">
                <label className="text-[10px] font-black text-amber-700 uppercase ml-2 mb-1 block">Buscar en Base Principal (ARL)</label>
                <div className="relative">
                  <input
                    placeholder="Escribe nombre o cédula para buscar..."
                    value={busquedaPrincipal}
                    onChange={e => buscarEnBasePrincipal(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none bg-white/50 focus:bg-white transition-all"
                  />
                  {buscandoPrincipal && <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-amber-400" />}
                </div>
                {resultadosPrincipal.length > 0 && (
                  <div className="mt-2 bg-white border border-amber-100 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-50">
                    {resultadosPrincipal.map(p => (
                      <button key={p.cedula} onClick={() => seleccionarDePrincipal(p)} className="w-full px-4 py-3 text-left hover:bg-amber-50 flex items-center justify-between group transition-colors">
                        <div>
                          <p className="text-sm font-black text-slate-800">{p.nombre}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{p.cedula} · {p.cargo}</p>
                        </div>
                        <div className="bg-amber-100 text-amber-600 px-2 py-1 rounded-lg text-[9px] font-black opacity-0 group-hover:opacity-100 transition-opacity">SELECCIONAR</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="h-[1px] bg-amber-200/50 mb-6" />
              <div className="grid grid-cols-2 gap-4 mb-4">
                <input placeholder="Nombre Completo" value={nuevoTrabajador.nombre} onChange={e => setNuevoTrabajador({...nuevoTrabajador, nombre: e.target.value})} className="px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500" />
                <input placeholder="Cédula" value={nuevoTrabajador.cedula} onChange={e => setNuevoTrabajador({...nuevoTrabajador, cedula: e.target.value})} className="px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-black text-amber-700 uppercase ml-2">Valor Turno</label>
                  <input type="number" value={nuevoTrabajador.valor_turno || ''} onChange={e => setNuevoTrabajador({...nuevoTrabajador, valor_turno: Number(e.target.value), valor_hora_adicional: Math.round(Number(e.target.value)/8)})} className="w-full px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-amber-700 uppercase ml-2">Valor Hora</label>
                  <input type="number" value={nuevoTrabajador.valor_hora_adicional || ''} onChange={e => setNuevoTrabajador({...nuevoTrabajador, valor_hora_adicional: Number(e.target.value)})} className="w-full px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
              <button onClick={agregarTrabajador} disabled={procesando} className="w-full py-3 bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-700 shadow-lg shadow-amber-200">
                {procesando ? 'Guardando...' : 'Guardar en Base de Datos'}
              </button>
            </div>
            <div className="space-y-2">
              <h4 className="font-black text-slate-800 text-xs uppercase tracking-widest px-2">Trabajadores en esta cuenta</h4>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {personas.map(p => (
                  <div key={p.cedula} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl">
                    <div>
                      <p className="font-black text-slate-800 text-sm">{p.nombre}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{p.cedula} · {fmt(p.valor_turno || 0)}</p>
                    </div>
                    <button onClick={() => eliminarTrabajador(p.cedula, p.nombre)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ModalUI>
      )}

      {showGlobalHistory && (
        <ModalUI titulo="Historial Global Remesas" onClose={() => setShowGlobalHistory(false)}>
          <div className="space-y-3">
            {registros.slice(0, 50).map(r => (
              <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-black text-slate-800 text-sm">{personas.find(p => p.cedula === r.cedula_trabajador)?.nombre || r.cedula_trabajador}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{r.tipo} · {r.fecha}</p>
                </div>
                <div className={`p-2 rounded-xl ${r.tipo === 'retiro' ? 'bg-rose-100 text-rose-500' : 'bg-emerald-100 text-emerald-500'}`}><Package size={16} /></div>
              </div>
            ))}
          </div>
        </ModalUI>
      )}

      {/* Modal interactivo de Planillas */}
      {modalGrupoPuntos && (
        <div className="fixed inset-0 z-[70] flex p-4 lg:p-8 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="relative w-full max-w-[1400px] mx-auto bg-[#f8fafc] rounded-[2rem] shadow-2xl flex flex-col my-auto border border-white/20">
            <div className="sticky top-0 z-20 flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200 rounded-t-[2rem]">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight">Gestor de Turnos y Pagos</h2>
                <p className="text-sm font-bold text-slate-400 mt-0.5">Control de asistencia y liquidación detallada</p>
              </div>
              <button onClick={() => setModalGrupoPuntos(null)} className="p-3 hover:bg-slate-100 rounded-2xl transition-all">
                <X size={24} className="text-slate-500" />
              </button>
            </div>
            
            <div className="p-8 space-y-8">
              {modalGrupoPuntos.filter(p => grupos[p] && grupos[p].length > 0).map(p => (
                <PlanillaTurnos key={p} punto={p} trabajadores={grupos[p]} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlRemesas;
