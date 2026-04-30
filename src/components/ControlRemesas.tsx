'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Calendar, ShieldAlert, CheckCircle, Shield, RefreshCw, X, AlertCircle, Trash2, Edit2, Save, XCircle, History, User, ArrowRight, Package } from 'lucide-react';
import { supabaseRemesas as supabase } from '@/lib/supabaseRemesas';
import { supabase as supabasePrincipal } from '@/lib/supabase';
import { calcularDiasRemesas } from '@/utils/remesas';

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
}> = ({ persona, mes, year, refreshTrigger, registrosPersona, onRegistrar, onReiniciar, onEditarRegistro, onEliminarRegistro, onClick, procesando, globalFecha, seleccionado, onToggleSeleccion }) => {
  const [dias, setDias] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<'ingreso' | 'retiro' | null>(null);
  const [fechaTemp, setFechaTemp] = useState(globalFecha);

  useEffect(() => {
    setFechaTemp(globalFecha);
  }, [globalFecha]);

  useEffect(() => {
    calcularDiasRemesas(persona.cedula, mes, year).then(setDias);
  }, [persona.cedula, mes, year, refreshTrigger]);

  const descStd = 76200; // Ajustar si el valor base de remesas es diferente
  const descuentoReal = dias !== null ? (descStd / 30) * dias : 0;
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
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'retirados'>('todos');
  const [mesACalcular, setMesACalcular] = useState(new Date().getMonth() + 1);
  const [yearACalcular, setYearACalcular] = useState(new Date().getFullYear());
  const [showGestionPersonal, setShowGestionPersonal] = useState(false);
  const [nuevoTrabajador, setNuevoTrabajador] = useState<Omit<Persona, 'id'> & { valor_turno: number, valor_hora_adicional: number }>({
    nombre: '', cedula: '', cargo: 'REMESAS', valor_turno: 0, valor_hora_adicional: 0
  });
  const [busquedaPrincipal, setBusquedaPrincipal] = useState('');
  const [resultadosPrincipal, setResultadosPrincipal] = useState<any[]>([]);
  const [buscandoPrincipal, setBuscandoPrincipal] = useState(false);

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
    if (term.length < 1) {
      setResultadosPrincipal([]);
      return;
    }
    setBuscandoPrincipal(true);
    try {
      const { data, error } = await supabasePrincipal
        .from('trabajadores')
        .select('*')
        .or(`nombre.ilike.%${term}%,cedula.ilike.%${term}%`)
        .limit(10);
      
      if (error) {
        console.error("Error buscando:", error);
        setErrorMSG("Error al conectar con la base principal: " + error.message);
      } else {
        setResultadosPrincipal(data || []);
      }
    } catch (e: any) { 
      console.error(e);
      setErrorMSG("Error de conexión: " + e.message);
    }
    setBuscandoPrincipal(false);
  };

  const seleccionarDePrincipal = (p: any) => {
    setNuevoTrabajador({
      nombre: p.nombre,
      cedula: p.cedula,
      cargo: 'REMESAS',
      valor_turno: p.valor_turno || 0,
      valor_hora_adicional: p.valor_hora_adicional || 0
    });
    setResultadosPrincipal([]);
    setBusquedaPrincipal('');
  };

  const agregarTrabajador = async () => {
    if (!nuevoTrabajador.nombre || !nuevoTrabajador.cedula) return alert('Nombre y Cédula son obligatorios');
    setProcesando(true);
    try {
      const { error } = await supabase.from('trabajadores').insert([{
        ...nuevoTrabajador,
        id: Date.now().toString()
      }]);
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

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-gray-100">
          <button onClick={() => setFiltroEstado('todos')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'todos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}>Todos</button>
          <button onClick={() => setFiltroEstado('activos')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'activos' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>Activos</button>
          <button onClick={() => setFiltroEstado('retirados')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'retirados' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}>Retirados</button>
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
                  key={p.cedula}
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
                />
              ))
            )}
          </tbody>
        </table>
      </div>

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
              
              {/* Buscador en Base Principal */}
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
                      <button 
                        key={p.cedula}
                        onClick={() => seleccionarDePrincipal(p)}
                        className="w-full px-4 py-3 text-left hover:bg-amber-50 flex items-center justify-between group transition-colors"
                      >
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
                <input 
                  placeholder="Nombre Completo" 
                  value={nuevoTrabajador.nombre}
                  onChange={e => setNuevoTrabajador({...nuevoTrabajador, nombre: e.target.value})}
                  className="px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input 
                  placeholder="Cédula" 
                  value={nuevoTrabajador.cedula}
                  onChange={e => setNuevoTrabajador({...nuevoTrabajador, cedula: e.target.value})}
                  className="px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-[10px] font-black text-amber-700 uppercase ml-2">Valor Turno</label>
                  <input 
                    type="number" 
                    value={nuevoTrabajador.valor_turno || ''}
                    onChange={e => setNuevoTrabajador({...nuevoTrabajador, valor_turno: Number(e.target.value), valor_hora_adicional: Math.round(Number(e.target.value)/8)})}
                    className="w-full px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-amber-700 uppercase ml-2">Valor Hora</label>
                  <input 
                    type="number" 
                    value={nuevoTrabajador.valor_hora_adicional || ''}
                    onChange={e => setNuevoTrabajador({...nuevoTrabajador, valor_hora_adicional: Number(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl border border-amber-200 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              <button 
                onClick={agregarTrabajador}
                disabled={procesando}
                className="w-full py-3 bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-amber-700 shadow-lg shadow-amber-200"
              >
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
    </div>
  );
};

export default ControlRemesas;
