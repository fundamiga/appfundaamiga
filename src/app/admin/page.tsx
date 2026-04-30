'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, Search, Users, ChevronDown, RefreshCw, AlertCircle, Building2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

interface Persona {
  id: string;
  cedula: string;
  nombre: string;
  valor_turno: number;
  valor_hora_adicional: number;
  forma_pago: string;
  cargo: string;
  numero_cuenta?: string;
}

const CARGOS = [
  'CONTRATISTAS DE ADMINISTRACION',
  '5 - 6', '6 - 6', 'CARTON C', 'GUACANDA',
  'TERCERA', 'ROZO', '2 - 10', 'MAYORISTA', 'GUABINAS', 'BOLIVAR', 'REMESAS',
];

const FORMAS_PAGO = ['Transferencia', 'Nequi', 'Bancolombia', 'AV Villas', 'Davivienda', 'Daviplata', 'Efectivo'];

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

const formVacio = (): Omit<Persona, 'id'> => ({
  cedula: '', nombre: '', valor_turno: 0, valor_hora_adicional: 0,
  forma_pago: 'Transferencia', cargo: 'CONTRATISTAS DE ADMINISTRACION',
  numero_cuenta: '',
});

const cargoColor: Record<string, string> = {
  'CONTRATISTAS DE ADMINISTRACION': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '5 - 6': 'bg-blue-50 text-blue-700 border-blue-200',
  '6 - 6': 'bg-violet-50 text-violet-700 border-violet-200',
  'CARTON C': 'bg-orange-50 text-orange-700 border-orange-200',
  'GUACANDA': 'bg-teal-50 text-teal-700 border-teal-200',
  'TERCERA': 'bg-pink-50 text-pink-700 border-pink-200',
  'ROZO': 'bg-amber-50 text-amber-700 border-amber-200',
  '2 - 10': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'MAYORISTA': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'GUABINAS': 'bg-rose-50 text-rose-700 border-rose-200',
  'BOLIVAR': 'bg-lime-50 text-lime-700 border-lime-200',
  'REMESAS': 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

export default function AdminPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCargo, setFiltroCargo] = useState('');
  const [form, setForm] = useState<Omit<Persona, 'id'>>(formVacio());
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [errores, setErrores] = useState<Partial<Record<keyof Omit<Persona,'id'>, string>>>({});
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null);
  const [confirmTexto, setConfirmTexto] = useState('');

  // Resumen por parqueadero
  const [mostrarResumen, setMostrarResumen] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);

  const cargarPersonas = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.from('trabajadores').select('*').order('nombre');
    if (error) setError('Error al cargar trabajadores: ' + error.message);
    else setPersonas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { cargarPersonas(); }, [cargarPersonas]);

  const validar = () => {
    const e: typeof errores = {};
    if (!form.nombre.trim()) e.nombre = 'El nombre es obligatorio';
    if (form.valor_turno <= 0) e.valor_turno = 'Debe ser mayor a 0';
    if (form.valor_hora_adicional <= 0) e.valor_hora_adicional = 'Debe ser mayor a 0';

    // Validar cédula duplicada
    if (form.cedula.trim()) {
      const duplicado = personas.find(p => p.cedula === form.cedula.trim() && p.id !== editandoId);
      if (duplicado) e.cedula = `Ya existe: ${duplicado.nombre}`;
    }

    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const handleGuardar = async () => {
    if (!validar()) return;
    setGuardando(true);
    if (editandoId) {
      const { error } = await supabase.from('trabajadores').update(form).eq('id', editandoId);
      if (error) { setError('Error al actualizar: ' + error.message); setGuardando(false); return; }
    } else {
      const { error } = await supabase.from('trabajadores').insert({ ...form, id: Date.now().toString() });
      if (error) { setError('Error al agregar: ' + error.message); setGuardando(false); return; }
    }
    await cargarPersonas();
    setForm(formVacio()); setEditandoId(null); setErrores({});
    setGuardado(true); setTimeout(() => setGuardado(false), 2000);
    setGuardando(false);
  };

  const handleEditar = (p: Persona) => {
    setForm({ cedula: p.cedula, nombre: p.nombre, valor_turno: p.valor_turno, valor_hora_adicional: p.valor_hora_adicional, forma_pago: p.forma_pago, cargo: p.cargo, numero_cuenta: p.numero_cuenta || '' });
    setEditandoId(p.id); setErrores({});
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleEliminar = async (id: string) => {
    if (confirmTexto !== 'CONFIRMAR') return;
    const { error } = await supabase.from('trabajadores').delete().eq('id', id);
    if (error) setError('Error al eliminar: ' + error.message);
    else { await cargarPersonas(); setConfirmEliminar(null); setConfirmTexto(''); }
  };

  const handleCancelar = () => { setForm(formVacio()); setEditandoId(null); setErrores({}); };
  const set = (field: keyof Omit<Persona,'id'>, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errores[field]) setErrores(prev => ({ ...prev, [field]: undefined }));
  };

  const personasFiltradas = personas.filter(p => {
    const matchB = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.cedula.includes(busqueda);
    const matchC = filtroCargo ? p.cargo === filtroCargo : true;
    return matchB && matchC;
  });

  // Resumen por parqueadero
  const resumenPorCargo = CARGOS.map(cargo => ({
    cargo,
    cantidad: personas.filter(p => p.cargo === cargo).length,
    totalTurno: personas.filter(p => p.cargo === cargo).reduce((acc, p) => acc + p.valor_turno, 0),
  })).filter(r => r.cantidad > 0);

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-emerald-100/30 blur-[120px] rounded-full -z-10 -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-yellow-100/20 blur-[100px] rounded-full -z-10 translate-x-1/4 translate-y-1/4" />

      <nav className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative w-12 h-12 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <Image src="/LOGO.png" alt="Fundamiga Logo" fill className="object-contain p-1.5" priority />
            </div>
            <div>
              <span className="text-xl font-black text-slate-800 tracking-tighter leading-none block">Fundamiga</span>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-[0.15em] mt-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />Panel de Control Admin
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setMostrarResumen(v => !v)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border font-bold text-xs transition-all ${mostrarResumen ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200'}`}>
              <Building2 size={14} />Resumen
            </button>
            <button onClick={cargarPersonas} className="p-2.5 rounded-xl border border-gray-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200 transition-all" title="Recargar">
              <RefreshCw size={16} />
            </button>
            <Link href="/" className="group flex items-center gap-2 text-slate-500 hover:text-emerald-700 transition-all px-5 py-2.5 rounded-2xl hover:bg-emerald-50 border border-transparent hover:border-emerald-100/50 shadow-sm">
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-black tracking-tight">Volver al Sistema</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-1.5 w-12 bg-emerald-500 rounded-full" />
            <div className="h-1.5 w-4 bg-yellow-400 rounded-full" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">
            Gestión de <span className="text-emerald-600">Trabajadores</span>
          </h1>
          <p className="text-slate-500 font-medium mt-3 text-lg border-l-4 border-yellow-400 pl-6">
            Los datos se guardan en la nube — disponibles desde cualquier dispositivo.
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-red-700">
            <AlertCircle size={18} className="shrink-0" />
            <p className="text-sm font-semibold">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto"><X size={16} /></button>
          </div>
        )}

        {/* Resumen por parqueadero */}
        {mostrarResumen && (
          <div className="mb-8 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <Building2 size={16} className="text-emerald-600" />
              <h3 className="font-black text-slate-800">Resumen por Parqueadero</h3>
              <span className="text-[10px] text-slate-400 font-bold ml-auto">{personas.length} trabajadores en total</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
              {resumenPorCargo.map((r, i) => (
                <div key={i} className={`rounded-xl border p-3 ${cargoColor[r.cargo] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">{r.cargo}</p>
                  <p className="text-2xl font-black">{r.cantidad}</p>
                  <p className="text-[10px] font-semibold opacity-60 mt-0.5">personas · {fmt(r.totalTurno / r.cantidad)}/turno prom.</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Total trabajadores', value: loading ? '…' : personas.length, color: 'text-emerald-600' },
            { label: 'Cargos / Lugares', value: CARGOS.length, color: 'text-amber-500' },
            { label: 'Mostrando', value: loading ? '…' : personasFiltradas.length, color: 'text-slate-700' },
            { label: 'Sin cédula', value: loading ? '…' : personas.filter(p => !p.cedula).length, color: 'text-rose-500' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
              <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Formulario */}
          <div ref={formRef} className="lg:col-span-1 sticky top-28">
            <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-emerald-50 transition-all duration-500">
              <div className={`p-6 ${editandoId ? 'bg-amber-500' : 'bg-emerald-600'}`}>
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    {editandoId ? <Pencil size={22} className="text-white" strokeWidth={3} /> : <Plus size={24} className="text-white" strokeWidth={3} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight">{editandoId ? 'Editar Trabajador' : 'Nuevo Trabajador'}</h2>
                    <p className="text-white/70 text-xs mt-0.5">{editandoId ? 'Modifica y guarda los cambios' : 'Completa todos los campos'}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Nombre completo *</label>
                  <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold text-slate-800 outline-none transition-all ${errores.nombre ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100'}`}
                    placeholder="Ej: García López Juan" />
                  {errores.nombre && <p className="text-red-500 text-[10px] font-bold mt-1">{errores.nombre}</p>}
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Cédula</label>
                  <input value={form.cedula} onChange={e => set('cedula', e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold text-slate-800 outline-none transition-all ${errores.cedula ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100'}`}
                    placeholder="Número de cédula" />
                  {errores.cedula && (
                    <p className="text-red-500 text-[10px] font-bold mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />{errores.cedula}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Cargo / Lugar</label>
                  <div className="relative">
                    <select value={form.cargo} onChange={e => set('cargo', e.target.value)}
                      className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 text-sm font-semibold text-slate-800 outline-none transition-all cursor-pointer">
                      {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Valor turno *</label>
                    <input type="number" min={0} value={form.valor_turno || ''} onChange={e => {
                        const v = Number(e.target.value);
                        setForm(prev => ({ ...prev, valor_turno: v, valor_hora_adicional: v > 0 ? Math.round(v / 8) : prev.valor_hora_adicional }));
                      }}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold text-slate-800 outline-none transition-all ${errores.valor_turno ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100'}`}
                      placeholder="17000" />
                    {errores.valor_turno && <p className="text-red-500 text-[10px] font-bold mt-1">{errores.valor_turno}</p>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Valor hora *</label>
                    <input type="number" min={0} value={form.valor_hora_adicional || ''} onChange={e => set('valor_hora_adicional', Number(e.target.value))}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-semibold text-slate-800 outline-none transition-all ${errores.valor_hora_adicional ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100'}`}
                      placeholder="2125" />
                    {errores.valor_hora_adicional && <p className="text-red-500 text-[10px] font-bold mt-1">{errores.valor_hora_adicional}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Forma de pago</label>
                  <div className="relative">
                    <select value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)}
                      className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 text-sm font-semibold text-slate-800 outline-none transition-all cursor-pointer">
                      {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {form.forma_pago && form.forma_pago !== 'Efectivo' && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-blue-500 rounded-full" />Número de cuenta — {form.forma_pago}
                    </label>
                    <input value={form.numero_cuenta || ''} onChange={e => set('numero_cuenta', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100 text-sm font-semibold text-slate-800 outline-none transition-all"
                      placeholder="Ej: 0550018400135374" />
                    {form.forma_pago === 'Davivienda' && (
                      <p className="text-[9px] text-blue-500 mt-1 font-medium">Necesario para el archivo de pagos Davivienda</p>
                    )}
                  </div>
                )}

                {form.valor_turno > 0 && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-700 font-semibold">
                    Turno: <span className="font-black">{fmt(form.valor_turno)}</span> · Hora: <span className="font-black">{fmt(form.valor_hora_adicional)}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={handleGuardar} disabled={guardando}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm text-white transition-all shadow-sm disabled:opacity-60 ${editandoId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                    {guardando ? <RefreshCw size={15} className="animate-spin" /> : guardado ? <><Check size={16} />¡Guardado!</> : <><Plus size={16} />{editandoId ? 'Actualizar' : 'Agregar'}</>}
                  </button>
                  {editandoId && (
                    <button onClick={handleCancelar} className="px-4 py-3 rounded-xl border border-gray-200 text-slate-500 hover:text-red-500 hover:border-red-200 font-bold text-sm transition-all">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Lista */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-gray-100 space-y-3">
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
                  <Search size={15} className="text-slate-400 shrink-0" />
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por nombre o cédula…"
                    className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-700 placeholder:text-slate-400" />
                  {busqueda && <button onClick={() => setBusqueda('')}><X size={14} className="text-slate-400 hover:text-red-400" /></button>}
                </div>
                <div className="relative">
                  <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                    className="w-full appearance-none px-4 py-2.5 pr-8 rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-slate-600 outline-none cursor-pointer">
                    <option value="">Todos los cargos / lugares</option>
                    {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="overflow-x-auto">
                {loading ? (
                  <div className="py-16 text-center">
                    <div className="w-10 h-10 border-4 border-slate-100 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-slate-400 font-bold text-sm">Cargando desde Supabase…</p>
                  </div>
                ) : personasFiltradas.length === 0 ? (
                  <div className="py-16 text-center">
                    <Users size={32} className="text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-bold text-sm">No se encontraron trabajadores</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        {['Trabajador', 'Cargo', 'Turno / Hora', 'Pago', 'Acciones'].map(h => (
                          <th key={h} className="px-5 py-3.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {personasFiltradas.map(p => (
                        <tr key={p.id} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-bold text-slate-800 text-sm">{p.nombre}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">C.C. {p.cedula || '—'}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`text-[9px] font-black px-2 py-1 rounded-full border whitespace-nowrap ${cargoColor[p.cargo] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {p.cargo}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-xs font-bold text-slate-700">{fmt(p.valor_turno)}</p>
                            <p className="text-[10px] text-slate-400">{fmt(p.valor_hora_adicional)}/h</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">{p.forma_pago}</span>
                            {p.forma_pago !== 'Efectivo' && (
                              <p className="text-[9px] text-slate-400 font-mono mt-0.5">{p.numero_cuenta || <span className="text-red-400 font-bold">Sin cuenta</span>}</p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleEditar(p)} className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-100 transition-all">
                                <Pencil size={13} />
                              </button>
                              {confirmEliminar === p.id ? (
                                <div className="flex flex-col gap-1 bg-red-50 border border-red-200 rounded-xl p-2 min-w-[160px]">
                                  <p className="text-[9px] text-red-600 font-black uppercase">Escribe CONFIRMAR</p>
                                  <input
                                    autoFocus
                                    value={confirmTexto}
                                    onChange={e => setConfirmTexto(e.target.value)}
                                    placeholder="CONFIRMAR"
                                    className="px-2 py-1 text-xs border border-red-200 rounded-lg outline-none font-bold text-red-700 bg-white w-full"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleEliminar(p.id)}
                                      disabled={confirmTexto !== 'CONFIRMAR'}
                                      className="flex-1 py-1 rounded-lg bg-red-500 text-white text-[10px] font-black disabled:opacity-40 transition-all"
                                    >Eliminar</button>
                                    <button onClick={() => { setConfirmEliminar(null); setConfirmTexto(''); }} className="flex-1 py-1 rounded-lg bg-gray-100 text-slate-500 text-[10px] font-black">Cancelar</button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => { setConfirmEliminar(p.id); setConfirmTexto(''); }} className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-all">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <p className="text-[10px] text-slate-400 font-bold">{personasFiltradas.length} de {personas.length} trabajadores</p>
                <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />Sincronizado con Supabase
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
