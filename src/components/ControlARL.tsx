'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Calendar, ShieldAlert, CheckCircle, Shield, RefreshCw, X, AlertCircle, Trash2, Edit2, Save, XCircle, History, User, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { calcularDiasARL } from '@/utils/arl';

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
}

interface RegistroARL {
  id: string;
  cedula_trabajador: string;
  tipo: 'ingreso' | 'retiro' | 're-ingreso';
  fecha: string;
  creado_at?: string;
}

// Fila editable individual de historial
const RegistroEditable: React.FC<{
  registro: RegistroARL;
  onEditar: (r: RegistroARL) => void;
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
      <div className="flex items-center gap-2 p-3 bg-blue-50/50 border border-blue-200 rounded-2xl flex-wrap">
        <select
          value={nuevoTipo}
          onChange={e => setNuevoTipo(e.target.value as any)}
          className="px-3 py-1.5 border border-white rounded-xl shadow-sm text-xs font-bold outline-none bg-white text-blue-900"
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
          <button onClick={guardar} disabled={procesando} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all shadow-sm">
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
    <div className="group flex items-center justify-between p-3 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 hover:shadow-sm transition-all">
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-xl ${registro.tipo === 'retiro' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
          <ShieldAlert size={15} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded
              ${registro.tipo === 'ingreso' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : registro.tipo === 'retiro' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
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
        <button onClick={() => setEditando(true)} disabled={procesando} title="Editar" className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all">
          <Edit2 size={14} />
        </button>
        <button onClick={onEliminar} disabled={procesando} title="Eliminar" className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

// Fila principal de la tabla
const FilaTrabajadorARL: React.FC<{
  persona: Persona;
  mes: number;
  year: number;
  refreshTrigger: number;
  registrosPersona: RegistroARL[];
  onRegistrar: (cedula: string, tipo?: 'ingreso' | 'retiro' | 're-ingreso', fecha?: string) => void;
  onReiniciar: (cedula: string, nombre: string) => void;
  onEditarRegistro: (registro: RegistroARL) => void;
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
    calcularDiasARL(persona.cedula, mes, year).then(setDias);
  }, [persona.cedula, mes, year, refreshTrigger]);

  const descStd = 76200;
  const descuentoReal = dias !== null ? (descStd / 30) * dias : 0;
  const regReciente = registrosPersona.length > 0 ? registrosPersona[0] : null;
  const ultimoEstado = regReciente ? regReciente.tipo : null;
  // Si no hay registro (null), lo tratamos como Activo por defecto
  const esActivo = (ultimoEstado === 'ingreso' || ultimoEstado === 're-ingreso' || ultimoEstado === null);

  // Cálculo de días totales históricos (aproximado por periodos)
  const totalDiasHistoricos = React.useMemo(() => {
    if (registrosPersona.length === 0) return 0;
    let total = 0;
    const regsSorted = [...registrosPersona].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    
    let inicioPeriodo: Date | null = null;
    
    regsSorted.forEach(r => {
      const fecha = new Date(r.fecha + 'T12:00:00');
      if (r.tipo === 'ingreso' || r.tipo === 're-ingreso') {
        if (!inicioPeriodo) inicioPeriodo = fecha;
      } else if (r.tipo === 'retiro') {
        if (inicioPeriodo) {
          const diffTime = Math.abs(fecha.getTime() - inicioPeriodo.getTime());
          total += Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          inicioPeriodo = null;
        }
      }
    });
    
    // Si sigue activo hoy
    if (inicioPeriodo && esActivo) {
      const hoy = new Date();
      const diffTime = Math.abs(hoy.getTime() - inicioPeriodo.getTime());
      total += Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
    
    return total;
  }, [registrosPersona, esActivo]);

  return (
    <tr 
      className={`group border-b border-gray-100 transition-all cursor-pointer relative overflow-hidden ${seleccionado ? 'bg-blue-50/60' : 'hover:bg-blue-50/40'}`} 
      onClick={onClick}
    >
      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <input 
            type="checkbox" 
            checked={seleccionado} 
            onChange={onToggleSeleccion}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
          />
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${seleccionado ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600'}`}>
              <User size={18} />
            </div>
            <div>
              <p className={`font-black text-sm leading-tight transition-colors ${seleccionado ? 'text-blue-700' : 'text-slate-800 group-hover:text-blue-700'}`}>{persona.nombre}</p>
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
            <span className="text-[8px] text-slate-400 mt-1 font-bold italic">Sin registro previo</span>
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
            {totalDiasHistoricos > 0 && (
              <span className="text-[8px] text-rose-400 mt-1 font-black uppercase tracking-tighter bg-rose-50 px-1.5 py-0.5 rounded-lg border border-rose-100">
                Vinculado {totalDiasHistoricos} días
              </span>
            )}
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
            {dias === 30 && <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Completo</span>}
          </div>
        )}
      </td>
      <td className="px-5 py-4 text-center font-black text-slate-600 text-sm">
        {dias === null ? '...' : fmt(descuentoReal)}
      </td>
      <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
        <div className="flex gap-2 justify-end items-center">
          {confirmando ? (
            <div className="flex items-center gap-2 bg-blue-50 p-1.5 rounded-2xl border border-blue-100 animate-in slide-in-from-right-2 duration-200">
              <input
                type="date"
                value={fechaTemp}
                onChange={e => setFechaTemp(e.target.value)}
                className="bg-white border border-blue-200 rounded-xl px-2 py-1 text-[10px] font-black outline-none text-blue-900 shadow-sm"
              />
              <button
                onClick={() => {
                  onRegistrar(persona.cedula, confirmando === 'ingreso' ? (ultimoEstado === 'retiro' ? 're-ingreso' : 'ingreso') : 'retiro', fechaTemp);
                  setConfirmando(null);
                }}
                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm"
                title="Confirmar"
              >
                <CheckCircle size={14} />
              </button>
              <button
                onClick={() => setConfirmando(null)}
                className="p-1.5 bg-white text-slate-400 rounded-lg hover:bg-slate-100 transition-all border border-slate-100"
                title="Cancelar"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <button
                disabled={procesando || esActivo}
                onClick={() => {
                  setConfirmando('ingreso');
                  setFechaTemp(globalFecha);
                }}
                className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider bg-emerald-600/10 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100 disabled:opacity-20"
                title={ultimoEstado === 'retiro' ? 'Re-ingreso' : 'Ingreso'}
              >
                {ultimoEstado === 'retiro' ? 'Re' : 'In'}
              </button>
              <button
                disabled={procesando || (!esActivo && ultimoEstado !== null)}
                onClick={() => {
                  setConfirmando('retiro');
                  setFechaTemp(globalFecha);
                }}
                className="px-3 py-1.5 text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all border border-rose-100 disabled:opacity-20"
                title="Retiro"
              >
                Out
              </button>
              <button
                onClick={() => onClick()}
                className="p-2.5 bg-slate-50 text-slate-400 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm border border-slate-100"
                title="Ver detalles"
              >
                <Edit2 size={15} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

// ─── COMPONENTES AUXILIARES ───────────────────────────────────────────────────

const ModalUI: React.FC<{ titulo: string, onClose: () => void, children: React.ReactNode }> = ({ titulo, onClose, children }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative border border-white/20 animate-in zoom-in-95 duration-200">
      <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white">
        <div>
          <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase">
            {titulo}
          </h3>
        </div>
        <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl transition-all">
          <X size={20} className="text-slate-400" />
        </button>
      </div>
      <div className="p-8 overflow-y-auto bg-slate-50/30">
        {children}
      </div>
    </div>
  </div>
);

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
const ControlARL: React.FC = () => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [registros, setRegistros] = useState<RegistroARL[]>([]);
  
  const getRegistrosPersona = (cedula: string) =>
    registros.filter(r => r.cedula_trabajador === cedula).sort((a, b) => {
      const v = new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
      if (v === 0 && b.creado_at && a.creado_at) return new Date(b.creado_at).getTime() - new Date(a.creado_at).getTime();
      return v;
    });

  const [busqueda, setBusqueda] = useState('');
  const [fechaSeleccionada, setFechaSeleccionada] = useState(getLocalYYYYMMDD());
  const [procesando, setProcesando] = useState(false);
  const [errorMSG, setErrorMSG] = useState<string | null>(null);

  // Estados para Modales y Selección
  const [personaSeleccionada, setPersonaSeleccionada] = useState<Persona | null>(null);
  const [showGlobalHistory, setShowGlobalHistory] = useState(false);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activos' | 'retirados'>('todos');
  const [fechaMasiva, setFechaMasiva] = useState(getLocalYYYYMMDD());
  
  // Estado para arrastrar la barra
  const [posBarra, setPosBarra] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const [mesACalcular, setMesACalcular] = useState(currentMonth);
  const [yearACalcular, setYearACalcular] = useState(currentYear);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: pData }, { data: rData }] = await Promise.all([
        supabase.from('trabajadores').select('cedula, nombre, cargo').order('nombre'),
        supabase.from('registros_arl').select('*').order('fecha', { ascending: false })
      ]);
      if (pData) setPersonas(pData);
      if (rData) setRegistros(rData);
    } catch (e: any) {
      setErrorMSG('Las tablas de ARL pueden no estar configuradas. ' + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const personasPreFiltradas = personas.filter(p => {
    const term = busqueda.toLowerCase();
    const matchesBusqueda = p.nombre.toLowerCase().includes(term) || p.cedula.includes(term);
    if (!matchesBusqueda) return false;

    if (filtroEstado === 'todos') return true;
    const reg = getRegistrosPersona(p.cedula);
    const ultimo = reg.length > 0 ? reg[0].tipo : null;
    const esActivo = ultimo === 'ingreso' || ultimo === 're-ingreso';
    
    if (filtroEstado === 'activos') return esActivo;
    if (filtroEstado === 'retirados') return !esActivo && ultimo !== null;
    return true;
  });

  const toggleSeleccion = (cedula: string) => {
    setSeleccionados(prev => {
      const next = prev.includes(cedula) ? prev.filter(c => c !== cedula) : [...prev, cedula];
      if (next.length > 0 && prev.length === 0) setFechaMasiva(fechaSeleccionada);
      return next;
    });
  };

  const seleccionarTodosVisibles = () => {
    if (seleccionados.length === personasPreFiltradas.length) {
      setSeleccionados([]);
    } else {
      setSeleccionados(personasPreFiltradas.map(p => p.cedula));
      setFechaMasiva(fechaSeleccionada);
    }
  };

  const registrarMasivo = async (tipoBase: 'ingreso' | 'retiro') => {
    if (seleccionados.length === 0) return;
    const count = seleccionados.length;
    if (!window.confirm(`¿Registrar ${tipoBase} masivo para ${count} trabajadores con la fecha ${fechaMasiva}?`)) return;

    setProcesando(true);
    setErrorMSG(null);
    try {
      const inserts = seleccionados.map(cedula => {
        const h = getRegistrosPersona(cedula);
        const ultimo = h.length > 0 ? h[0].tipo : null;
        const tipoFinal = tipoBase === 'retiro' ? 'retiro' : (ultimo === 'retiro' ? 're-ingreso' : 'ingreso');
        return { 
          cedula_trabajador: cedula, 
          tipo: tipoFinal, 
          fecha: fechaMasiva 
        };
      });

      const { error } = await supabase.from('registros_arl').insert(inserts);
      if (error) throw error;
      
      setSeleccionados([]);
      await cargarDatos();
    } catch (e: any) {
      setErrorMSG('Error en proceso masivo: ' + e.message);
    }
    setProcesando(false);
  };
  
  const activarNuevosMasivo = async () => {
    const sinRegistro = personas.filter(p => getRegistrosPersona(p.cedula).length === 0);
    if (sinRegistro.length === 0) {
      alert('Todos los trabajadores ya tienen al menos un registro en el sistema.');
      return;
    }
    
    if (!window.confirm(`¿Registrar ingreso automático para ${sinRegistro.length} trabajadores sin historial? Se usará el 1ro del mes actual (${mesACalcular}/${yearACalcular}).`)) return;
    
    setProcesando(true);
    setErrorMSG(null);
    try {
      const fechaInicio = `${yearACalcular}-${String(mesACalcular).padStart(2, '0')}-01`;
      const inserts = sinRegistro.map(p => ({
        cedula_trabajador: p.cedula,
        tipo: 'ingreso' as const,
        fecha: fechaInicio
      }));
      
      const { error } = await supabase.from('registros_arl').insert(inserts);
      if (error) throw error;
      
      await cargarDatos();
      alert(`Se activaron ${sinRegistro.length} trabajadores correctamente.`);
    } catch (e: any) {
      setErrorMSG('Error en activación masiva: ' + e.message);
    }
    setProcesando(false);
  };

  const reiniciarTodoARL = async () => {
    if (!window.confirm('¿ESTÁS SEGURO? Esta acción ELIMINARÁ TODO el historial de ingresos y retiros de TODOS los trabajadores.')) return;
    if (!window.confirm('¿CONFIRMAS EL REINICIO TOTAL? No se podrá deshacer.')) return;
    
    setProcesando(true);
    setErrorMSG(null);
    try {
      // Usamos una condición que siempre sea verdadera para borrar todo
      const { error } = await supabase.from('registros_arl').delete().neq('cedula_trabajador', '0'); 
      if (error) throw error;
      await cargarDatos();
      alert('Sistema de ARL reiniciado correctamente. Todos los trabajadores están ahora en estado base.');
    } catch (e: any) {
      setErrorMSG('Error al reiniciar sistema: ' + e.message);
    }
    setProcesando(false);
  };


  const registrarEvento = async (cedula: string, tipoForzado?: 'ingreso' | 'retiro' | 're-ingreso', fechaForzada?: string) => {
    setProcesando(true);
    setErrorMSG(null);
    const regPersona = getRegistrosPersona(cedula);
    const ultimoEvento = regPersona.length > 0 ? regPersona[0].tipo : null;
    const nuevoTipo: 'ingreso' | 'retiro' | 're-ingreso' = tipoForzado || (
      !ultimoEvento ? 'ingreso' :
      (ultimoEvento === 'ingreso' || ultimoEvento === 're-ingreso') ? 'retiro' : 're-ingreso'
    );
    const fechaFinal = fechaForzada || fechaSeleccionada;
    try {
      const { error } = await supabase.from('registros_arl').insert({ cedula_trabajador: cedula, tipo: nuevoTipo, fecha: fechaFinal });
      if (error) throw error;
      await cargarDatos();
    } catch (e: any) { setErrorMSG('Error al registrar: ' + e.message); }
    setProcesando(false);
  };

  const editarRegistro = async (registro: RegistroARL) => {
    setProcesando(true);
    setErrorMSG(null);
    try {
      const { error } = await supabase.from('registros_arl').update({ tipo: registro.tipo, fecha: registro.fecha }).eq('id', registro.id);
      if (error) throw error;
      await cargarDatos();
    } catch (e: any) { setErrorMSG('Error al editar: ' + e.message); }
    setProcesando(false);
  };

  const eliminarRegistro = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar este registro de ${nombre}?`)) return;
    setProcesando(true);
    setErrorMSG(null);
    try {
      const { error } = await supabase.from('registros_arl').delete().eq('id', id);
      if (error) throw error;
      await cargarDatos();
    } catch (e: any) { setErrorMSG('Error al eliminar: ' + e.message); }
    setProcesando(false);
  };

  const reiniciarPersonaARL = async (cedula: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar TODO el historial de ARL de ${nombre}? Quedará "Sin Registro" y contará 30 días.`)) return;
    setProcesando(true);
    setErrorMSG(null);
    try {
      const { error } = await supabase.from('registros_arl').delete().eq('cedula_trabajador', cedula);
      if (error) throw error;
      await cargarDatos();
    } catch (e: any) { setErrorMSG('Error al reiniciar: ' + e.message); }
    setProcesando(false);
  };

  return (
    <div className="w-full bg-white rounded-3xl border border-gray-200 shadow-sm p-8">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-8 bg-blue-500 rounded-full" />
            <div className="h-2 w-3 bg-teal-400 rounded-full" />
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Control <span className="text-blue-600">ARL</span></h2>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Todos los trabajadores cuentan <strong>30 días</strong> por defecto. Solo descuenta si hay retiro registrado.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-slate-50 px-4 py-2.5 rounded-xl border border-gray-200 flex items-center gap-2">
            <Calendar size={15} className="text-blue-500" />
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Fecha novedad:</span>
            <input
              type="date"
              value={fechaSeleccionada}
              onChange={e => setFechaSeleccionada(e.target.value)}
              className="bg-transparent border-none outline-none text-sm font-bold text-slate-800"
            />
          </div>
          <button 
            onClick={() => setShowGlobalHistory(true)} 
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            <History size={16} /> Historial Global
          </button>
          <button 
            onClick={activarNuevosMasivo}
            disabled={procesando}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
            title="Activar trabajadores sin registro"
          >
            <CheckCircle size={16} /> Activar Nuevos
          </button>
          <button 
            onClick={reiniciarTodoARL}
            disabled={procesando}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-rose-500 border border-rose-100 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm disabled:opacity-50"
            title="Borrar todo el historial de ARL"
          >
            <Trash2 size={16} /> Reiniciar Todo
          </button>
          <button onClick={cargarDatos} className="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-slate-500 hover:text-blue-600 transition-all">
            <RefreshCw size={18} className={loading ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>
      </div>

      {errorMSG && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3 text-red-700">
          <AlertCircle className="shrink-0 mt-0.5" size={18} />
          <p className="text-sm font-semibold">{errorMSG}</p>
        </div>
      )}

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-gray-100 shadow-inner">
          <button 
            onClick={() => setFiltroEstado('todos')}
            className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'todos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Todos
          </button>
          <button 
            onClick={() => setFiltroEstado('activos')}
            className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'activos' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-emerald-500'}`}
          >
            Activos
          </button>
          <button 
            onClick={() => setFiltroEstado('retirados')}
            className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroEstado === 'retirados' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-rose-500'}`}
          >
            Retirados
          </button>
        </div>

        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5">
          <Calendar size={15} className="text-blue-500" />
          <span className="text-xs font-black text-blue-800 uppercase tracking-widest">Periodo:</span>
          <select value={mesACalcular} onChange={e => setMesACalcular(Number(e.target.value))} className="px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-sm font-bold text-blue-900 outline-none">
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={m}>{new Date(2000, m-1).toLocaleString('es', { month: 'long' }).toUpperCase()}</option>
            ))}
          </select>
          <select value={yearACalcular} onChange={e => setYearACalcular(Number(e.target.value))} className="px-3 py-1.5 bg-white border border-blue-200 rounded-xl text-sm font-bold text-blue-900 outline-none">
            {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-gray-200 focus-within:border-blue-400 transition-all">
          <Search size={15} className="text-slate-400" />
          <input
            placeholder="Nombre o Cédula..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="bg-transparent border-none outline-none text-sm font-semibold text-slate-700 w-48"
          />
        </div>

        <span className="text-xs text-slate-400 font-semibold ml-auto flex items-center gap-2">
          {personasPreFiltradas.length} total
          {seleccionados.length > 0 && (
            <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[9px] blink">
              {seleccionados.length} seleccionados
            </span>
          )}
          {procesando && <span className="text-blue-500 animate-pulse">· Guardando...</span>}
        </span>
      </div>

      {/* Tabla — TODOS sin límite */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-gray-200">
            <tr>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <div className="flex items-center gap-4">
                  <input 
                    type="checkbox" 
                    checked={personasPreFiltradas.length > 0 && seleccionados.length === personasPreFiltradas.length}
                    onChange={seleccionarTodosVisibles}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                  />
                  Trabajador
                </div>
              </th>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado y Última Fecha</th>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Días ARL</th>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Descuento Est.</th>
              <th className="px-5 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Detalles</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-16 text-center text-slate-400 font-bold animate-pulse">Cargando...</td></tr>
            ) : personasPreFiltradas.length === 0 ? (
              <tr><td colSpan={5} className="py-16 text-center text-slate-400 font-bold">Sin resultados</td></tr>
            ) : (
              personasPreFiltradas.map((p, idx) => (
                <FilaTrabajadorARL
                  key={`${p.cedula}-${idx}`}
                  persona={p}
                  mes={mesACalcular}
                  year={yearACalcular}
                  refreshTrigger={registros.length}
                  registrosPersona={getRegistrosPersona(p.cedula)}
                  onRegistrar={registrarEvento}
                  onReiniciar={reiniciarPersonaARL}
                  onEditarRegistro={editarRegistro}
                  onEliminarRegistro={eliminarRegistro}
                  onClick={() => setPersonaSeleccionada(p)}
                  procesando={procesando}
                  globalFecha={fechaSeleccionada}
                  seleccionado={seleccionados.includes(p.cedula)}
                  onToggleSeleccion={() => toggleSeleccion(p.cedula)}
                />
              ))
            )}
          </tbody>
        </table>
        <div className="px-6 py-4 bg-slate-50/50 border-t border-gray-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <CheckCircle size={13} className="text-emerald-500" />
          Puedes marcar varios trabajadores y aplicar acciones masivas desde la barra inferior.
        </div>
      </div>

      {/* Barra de Acciones Masivas Arrastrable */}
      {seleccionados.length > 0 && (
        <div 
          onPointerMove={(e) => {
            if (arrastrando) {
              setPosBarra(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
            }
          }}
          onPointerUp={() => setArrastrando(false)}
          onPointerLeave={() => setArrastrando(false)}
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] touch-none"
          style={{ transform: `translate(calc(-50% + ${posBarra.x}px), ${posBarra.y}px)` }}
        >
          <div className="bg-slate-900 border border-white/10 text-white px-8 py-5 rounded-[2.5rem] shadow-2xl flex items-center gap-8 backdrop-blur-md relative animate-in slide-in-from-bottom-5 duration-300">
            {/* Grab Handle */}
            <div 
              onPointerDown={(e) => {
                (e.target as any).releasePointerCapture(e.pointerId);
                setArrastrando(true);
              }}
              className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 p-1.5 rounded-full cursor-grab active:cursor-grabbing hover:scale-110 transition-transform shadow-lg border-2 border-slate-900"
              title="Arrastra para mover"
            >
              <div className="w-6 h-1 bg-white/40 rounded-full mb-0.5" />
              <div className="w-6 h-1 bg-white/40 rounded-full" />
            </div>

            <div className="flex flex-col">
              <span className="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-0.5">Selección activa</span>
              <span className="text-lg font-black">{seleccionados.length} personas</span>
            </div>
            
            <div className="h-10 w-[1px] bg-white/10" />
            
            <div className="flex items-center gap-4">
              <button 
                onClick={() => registrarMasivo('ingreso')}
                disabled={procesando}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/40 flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle size={14} /> Registrar Ingreso
              </button>
              <button 
                onClick={() => registrarMasivo('retiro')}
                disabled={procesando}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-900/40 flex items-center gap-2 disabled:opacity-50"
              >
                <XCircle size={14} /> Registrar Retiro
              </button>
              <button 
                onClick={() => setSeleccionados([])}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Anular
              </button>
            </div>
            
            <div className="flex flex-col items-start ml-4 px-4 bg-white/10 rounded-3xl py-2.5 border border-white/10">
              <span className="text-[8px] font-black text-blue-300 uppercase tracking-widest mb-1.5 px-1">En fecha:</span>
              <div className="flex items-center gap-2">
                <Calendar size={12} className="text-white/40" />
                <input
                  type="date"
                  value={fechaMasiva}
                  onChange={e => setFechaMasiva(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs font-black text-white focus:text-blue-200 transition-colors w-28 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial Global */}
      {showGlobalHistory && (
        <ModalUI titulo="Historial Global de Movimientos" onClose={() => setShowGlobalHistory(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-500 font-medium mb-4">Últimos movimientos registrados en el sistema:</p>
            {registros.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-bold">No hay movimientos registrados.</div>
            ) : (
              <div className="space-y-3">
                {registros.slice(0, 50).map(r => {
                  const p = personas.find(pers => pers.cedula === r.cedula_trabajador);
                  return (
                    <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-xl ${r.tipo === 'retiro' ? 'bg-rose-100 text-rose-500' : 'bg-emerald-100 text-emerald-500'}`}>
                          {r.tipo === 'retiro' ? <X size={16} /> : <CheckCircle size={16} />}
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-sm leading-tight">{p?.nombre || 'Trabajador desconocido'}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{r.tipo} · {r.fecha}</p>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-slate-200" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ModalUI>
      )}

      {/* Modal Edición Rápida Trabajador */}
      {personaSeleccionada && (
        <ModalUI 
          titulo={`Gestionar ARL: ${personaSeleccionada.nombre}`} 
          onClose={() => setPersonaSeleccionada(null)}
        >
          <div className="space-y-8">
            {/* Acciones Rápidas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                    <CheckCircle size={18} />
                  </div>
                  <h4 className="font-black text-emerald-900 text-sm uppercase tracking-tight">Nuevo Ingreso</h4>
                </div>
                <p className="text-xs text-emerald-700/70 mb-5 font-medium leading-relaxed">Registra un nuevo ingreso o re-ingreso para este trabajador.</p>
                <button 
                  disabled={procesando}
                  onClick={() => {
                    const ultimo = getRegistrosPersona(personaSeleccionada.cedula)[0]?.tipo;
                    registrarEvento(personaSeleccionada.cedula, ultimo === 'retiro' ? 're-ingreso' : 'ingreso');
                  }}
                  className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
                >
                  Confirmar Ingreso
                </button>
              </div>

              <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                    <XCircle size={18} />
                  </div>
                  <h4 className="font-black text-rose-900 text-sm uppercase tracking-tight">Registrar Retiro</h4>
                </div>
                <p className="text-xs text-rose-700/70 mb-5 font-medium leading-relaxed">Marca al trabajador como retirado para dejar de contar sus días de ARL.</p>
                <button 
                  disabled={procesando}
                  onClick={() => registrarEvento(personaSeleccionada.cedula, 'retiro')}
                  className="w-full py-3 bg-rose-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-200 disabled:opacity-50"
                >
                  Confirmar Retiro
                </button>
              </div>
            </div>

            {/* Historial Detallado */}
            <div>
              <div className="flex items-center justify-between mb-4 px-2">
                <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight flex items-center gap-2">
                  <History size={16} className="text-blue-500" />
                  Historial de Movimientos
                </h4>
                <button 
                  onClick={() => reiniciarPersonaARL(personaSeleccionada.cedula, personaSeleccionada.nombre)}
                  className="text-[10px] font-black text-rose-400 hover:text-rose-600 uppercase tracking-widest transition-colors flex items-center gap-1"
                >
                  <Trash2 size={12} /> Borrar Todo
                </button>
              </div>
              
              <div className="space-y-2.5">
                {getRegistrosPersona(personaSeleccionada.cedula).length === 0 ? (
                  <div className="py-8 bg-white border border-slate-100 border-dashed rounded-3xl text-center text-slate-400 text-xs font-bold italic">
                    Sin registros previos. Se asumen 30 días de nómina.
                  </div>
                ) : (
                  getRegistrosPersona(personaSeleccionada.cedula).map(r => (
                    <RegistroEditable
                      key={r.id}
                      registro={r}
                      onEditar={editarRegistro}
                      onEliminar={() => eliminarRegistro(r.id, personaSeleccionada.nombre)}
                      procesando={procesando}
                    />
                  ))
                )}
              </div>
            </div>
            
            <div className="pt-4 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">
                Cualquier cambio se aplica a la fecha seleccionada ({fechaSeleccionada})
              </p>
            </div>
          </div>
        </ModalUI>
      )}
    </div>
  );
};

export default ControlARL;
