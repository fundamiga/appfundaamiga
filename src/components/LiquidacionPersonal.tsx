'use client';
import React, { useState, useEffect, useRef } from 'react';
import {
  Search, User, Calendar, MinusCircle, Pencil,
  CheckCircle, Calculator, X, Shield, CreditCard, TrendingUp,
  FileText, Trash2, Download, ChevronRight,
  AlertCircle, Sparkles, BarChart3, Users, Clock, Sun, Moon,
  RefreshCw, Info, BookOpen, ListTree, ChevronDown, ChevronUp
} from 'lucide-react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { calcularDiasARL } from '@/utils/arl';

// Tipo de Supabase (snake_case) mapeado al tipo interno (camelCase)
interface PersonaDB {
  id: string; cedula: string; nombre: string;
  valor_turno: number; valor_hora_adicional: number; forma_pago: string; cargo: string;
  numero_cuenta?: string;
}

interface Persona {
  cedula: string; nombre: string; valorTurno: number; valorHoraAdicional: number;
  formaPago: string; cargo: string; numeroCuenta?: string;
}

const CARGOS = [
  'CONTRATISTAS DE ADMINISTRACION',
  '5 - 6',
  '6 - 6',
  'CARTON C',
  'GUACANDA',
  'TERCERA',
  'ROZO',
  '2 - 10',
  'MAYORISTA',
  'GUABINAS',
  'BOLIVAR',
];
interface FormLiquidacion {
  diasTurno: number; turnosAdicionales: number; horasAdicionales: number;
  tieneDescuentoSeguridad: boolean; valorDescuentoSeguridad: number;
  tieneDescuentoPrestamo: boolean; valorDescuentoPrestamo: number;
  tieneBono: boolean; valorBono: number; descripcionBono: string;
  observaciones: string;
}
interface Resultado {
  subtotalTurnos: number; subtotalTurnosAdicionales: number; subtotalHoras: number;
  bono: number;
  totalBruto: number; descuentoSeguridad: number; descuentoPrestamo: number;
  totalDescuentos: number; neto: number;
  operaciones?: {
    turnos: string;
    turnosAdicionales: string;
    horas: string;
    bruto: string;
    descuentos: string;
    neto: string;
  };
}
interface LiquidacionCompleta {
  persona: Persona; form: FormLiquidacion; resultado: Resultado; fecha: string; estado: 'Pendiente' | 'Pagado'; quincena?: string;
}

const PERSONAS: Persona[] = []; // Cargado desde Supabase

const DESCUENTO_SEG_SOCIAL_FULL = 76200;
const DESCUENTO_PRESTAMOS_DEFAULT = 4000;
const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function calcular(p: Persona, f: FormLiquidacion): Resultado {
  const subtotalTurnos = f.diasTurno * p.valorTurno;
  const subtotalTurnosAdicionales = f.turnosAdicionales * p.valorTurno;
  const subtotalHoras = f.horasAdicionales * p.valorHoraAdicional;
  const bono = f.tieneBono ? f.valorBono : 0;
  const descuentoSeguridad = f.tieneDescuentoSeguridad ? f.valorDescuentoSeguridad : 0;
  const descuentoPrestamo = f.tieneDescuentoPrestamo ? f.valorDescuentoPrestamo : 0;
  
  const totalBruto = subtotalTurnos + subtotalTurnosAdicionales + subtotalHoras + bono + descuentoSeguridad;
  const totalDescuentos = descuentoSeguridad + descuentoPrestamo;
  const neto = Math.max(0, totalBruto - totalDescuentos);

  const fmtOp = (n: number) => n.toLocaleString('es-CO');

  return { 
    subtotalTurnos, 
    subtotalTurnosAdicionales, 
    subtotalHoras, 
    bono, 
    totalBruto, 
    descuentoSeguridad, 
    descuentoPrestamo, 
    totalDescuentos, 
    neto,
    operaciones: {
      turnos: `${f.diasTurno} días × ${fmtOp(p.valorTurno)} = ${fmtOp(subtotalTurnos)}`,
      turnosAdicionales: `${f.turnosAdicionales} turnos × ${fmtOp(p.valorTurno)} = ${fmtOp(subtotalTurnosAdicionales)}`,
      horas: `${f.horasAdicionales} horas × ${fmtOp(p.valorHoraAdicional)} = ${fmtOp(subtotalHoras)}`,
      bruto: `${fmtOp(subtotalTurnos)} + ${fmtOp(subtotalTurnosAdicionales)} + ${fmtOp(subtotalHoras)} + ${fmtOp(bono)} + ${fmtOp(descuentoSeguridad)} = ${fmtOp(totalBruto)}`,
      descuentos: `${fmtOp(descuentoSeguridad)} (ARL) + ${fmtOp(descuentoPrestamo)} (Aportes) = ${fmtOp(totalDescuentos)}`,
      neto: `${fmtOp(totalBruto)} (Bruto) − ${fmtOp(totalDescuentos)} (Descuentos) = ${fmtOp(neto)}`
    }
  };
}

const formVacio = (): FormLiquidacion => ({
  diasTurno: 0, turnosAdicionales: 0, horasAdicionales: 0,
  tieneDescuentoSeguridad: false, valorDescuentoSeguridad: DESCUENTO_SEG_SOCIAL_FULL,
  tieneDescuentoPrestamo: false, valorDescuentoPrestamo: DESCUENTO_PRESTAMOS_DEFAULT,
  tieneBono: false, valorBono: 0, descripcionBono: '',
  observaciones: '',
});

const NumField: React.FC<{ label: string; value: number; onChange: (v: number) => void; prefix?: string; min?: number; step?: number; hint?: string; }> =
  ({ label, value, onChange, prefix = '', min = 0, step = 1, hint }) => {
    // Estado local para permitir escribir (borrar dígitos) sin que salte a 0
    const [localValue, setLocalValue] = useState<string>(value === 0 ? '' : String(value));
    
    useEffect(() => {
      setLocalValue(value === 0 ? '' : String(value));
    }, [value]);

    const handleInternalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalValue(val);
      if (val === '') {
        onChange(0);
      } else {
        const num = Number(val);
        if (!isNaN(num)) onChange(num);
      }
    };

    return (
      <div className="group">
        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 group-focus-within:text-emerald-400 transition-colors">{label}</label>
        {hint && <p className="text-[10px] text-emerald-500 font-semibold mb-1.5 bg-emerald-950/60 border border-emerald-900/60 px-2 py-1 rounded-lg">{hint}</p>}
        <div className="relative">
          {prefix && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm pointer-events-none">{prefix}</span>}
          <input 
            type="number" 
            min={min} 
            step={step} 
            value={localValue} 
            onChange={handleInternalChange}
            className={`w-full ${prefix ? 'pl-8' : 'pl-4'} pr-4 py-3.5 border rounded-xl font-bold text-sm outline-none transition-all bg-slate-800/60 border-slate-700 text-white focus:bg-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20`} />
        </div>
      </div>
    );
  };

const ToggleRow: React.FC<{ active: boolean; onToggle: () => void; label: string; sublabel: string; iconEl: React.ReactNode; accentClass: string; }> =
  ({ active, onToggle, label, sublabel, iconEl, accentClass }) => (
  <div onClick={onToggle} className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-200 select-none ${active ? 'bg-slate-800/80 border-slate-600' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}>
    <div className={`p-2.5 rounded-xl transition-colors ${active ? accentClass : 'bg-slate-800'}`}>{iconEl}</div>
    <div className="flex-1 min-w-0">
      <p className="font-bold text-sm text-white">{label}</p>
      <p className="text-[10px] text-slate-500">{sublabel}</p>
    </div>
    <div className={`w-12 h-6 rounded-full relative transition-colors duration-200 shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-700'}`}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${active ? 'translate-x-6' : 'translate-x-0.5'}`} />
    </div>
  </div>
);

export const LiquidacionPersonal: React.FC = () => {
  const [busqueda, setBusqueda] = useState('');
  const [personaSeleccionada, setPersonaSeleccionada] = useState<Persona | null>(null);
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [form, setForm] = useState<FormLiquidacion>(formVacio());
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [personaEditable, setPersonaEditable] = useState<Persona | null>(null);
  const [diasARLCalculados, setDiasARLCalculados] = useState<number | null>(null);
  const [historial, setHistorial] = useState<LiquidacionCompleta[]>([]);
  const [historialPrivado, setHistorialPrivadoRaw] = useState<LiquidacionCompleta[]>([]);

  // Cargar desde localStorage solo en el cliente después del montaje
  useEffect(() => {
    try {
      const saved = localStorage.getItem('historial_privado_fundamiga');
      if (saved) setHistorialPrivadoRaw(JSON.parse(saved));
    } catch {}
  }, []);

  const setHistorialPrivado = (value: LiquidacionCompleta[] | ((prev: LiquidacionCompleta[]) => LiquidacionCompleta[])) => {
    setHistorialPrivadoRaw(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      try { localStorage.setItem('historial_privado_fundamiga', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const [modoInforme, setModoInforme] = useState<'general' | 'privado'>('general');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [alertaCerrada, setAlertaCerrada] = useState(false);
  const [personasActivas, setPersonasActivas] = useState<Persona[]>(PERSONAS);
  const [modoClaro, setModoClaro] = useState(false);
  const [loadingPersonas, setLoadingPersonas] = useState(true);
  const [loadingHistorial, setLoadingHistorial] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usuarioActual, setUsuarioActual] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('fundamiga_usuario') || '';
  });
  const [mostrarPedirNombre, setMostrarPedirNombre] = useState(false);
  const [nombreInput, setNombreInput] = useState('');
  const [mostrarRegistroCambios, setMostrarRegistroCambios] = useState(false);
  const [registroCambios, setRegistroCambios] = useState<any[]>([]);
  const [loadingRegistro, setLoadingRegistro] = useState(false);
  const [mostrarFormulas, setMostrarFormulas] = useState(false);
  const [mostrarDesglose, setMostrarDesglose] = useState(false);

  // Cargar trabajadores desde Supabase
  useEffect(() => {
    setLoadingPersonas(true);
    supabase.from('trabajadores').select('*').order('nombre').then(({ data, error }) => {
      if (error) { setErrorMsg('Error al cargar trabajadores: ' + error.message); }
      else if (data && data.length > 0) {
        setPersonasActivas(data.map((p: PersonaDB) => ({
          cedula: p.cedula, nombre: p.nombre,
          valorTurno: p.valor_turno, valorHoraAdicional: p.valor_hora_adicional,
          formaPago: p.forma_pago, cargo: p.cargo,
          numeroCuenta: p.numero_cuenta || '',
        })));
      }
      setLoadingPersonas(false);
    });
  }, []);

  // Cargar historial desde Supabase y sincronizar numeroCuenta con trabajadores actuales
  useEffect(() => {
    setLoadingHistorial(true);
    supabase.from('historial_liquidaciones').select('*').order('creado_at').then(({ data, error }) => {
      if (error) { setErrorMsg('Error al cargar historial: ' + error.message); }
      else if (data && data.length > 0) {
        // Traer trabajadores actualizados para sincronizar numeroCuenta
        supabase.from('trabajadores').select('cedula, numero_cuenta').then(({ data: trabajadores }) => {
          const cuentaMap = new Map((trabajadores || []).map((t: any) => [t.cedula, t.numero_cuenta || '']));
          setHistorial(data.map((row: any) => ({
            persona: {
              ...row.persona,
              numeroCuenta: cuentaMap.has(row.persona.cedula)
                ? cuentaMap.get(row.persona.cedula)
                : (row.persona.numeroCuenta || row.persona.cuentaDavivienda || ''),
            },
            form: row.form, resultado: row.resultado,
            fecha: row.fecha, estado: row.estado, _id: row.id, quincena: row.quincena,
          })));
        });
      }
      setLoadingHistorial(false);
    });
  }, []);

  const filtradas = personasActivas.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.cedula.includes(busqueda));

  // Historial activo según modo
  const historialActivo = modoInforme === 'general' ? historial : historialPrivado;
  const setHistorialActivo = modoInforme === 'general' ? setHistorial : setHistorialPrivado;

  const totalTurnos = historialActivo.reduce((acc, i) => acc + i.form.diasTurno, 0);
  const totalHoras = historialActivo.reduce((acc, i) => acc + i.form.horasAdicionales, 0);
  const totalBruto = historialActivo.reduce((acc, i) => acc + i.resultado.totalBruto, 0);
  const totalDescuentos = historialActivo.reduce((acc, i) => acc + i.resultado.totalDescuentos, 0);
  const totalNeto = historialActivo.reduce((acc, i) => acc + i.resultado.neto, 0);
  const totalPagado = historialActivo.filter(i => i.estado === 'Pagado').reduce((acc, i) => acc + i.resultado.neto, 0);
  const totalPendiente = historialActivo.filter(i => i.estado === 'Pendiente').reduce((acc, i) => acc + i.resultado.neto, 0);

 const generarExcelDavivienda = async () => {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Fundamiga'; 
    wb.created = new Date();

    const ws = wb.addWorksheet('Liquidaciones');
    const periodo = obtenerPeriodo();

    // 🔥 AGRUPAR POR CÉDULA
    const agrupadosMap = new Map();

    historialActivo.forEach(item => {
      const key = item.persona.cedula || 'sin-cedula';

      if (!agrupadosMap.has(key)) {
        agrupadosMap.set(key, {
          persona: item.persona,
          diasTurno: 0,
          horasAdicionales: 0,
          bono: 0,
          totalBruto: 0,
          descuentoPrestamo: 0,
          descuentoSeguridad: 0,
          neto: 0,
          estado: item.estado,
          fecha: item.fecha,
        });
      }

      const acc = agrupadosMap.get(key);

      acc.diasTurno += item.form.diasTurno;
      acc.horasAdicionales += item.form.horasAdicionales;
      acc.bono += item.form.tieneBono ? item.form.valorBono : 0;
      acc.totalBruto += item.resultado.totalBruto;
      acc.descuentoPrestamo += item.resultado.descuentoPrestamo;
      acc.descuentoSeguridad += item.resultado.descuentoSeguridad;
      acc.neto += item.resultado.neto;

      if (item.estado !== 'Pagado') acc.estado = 'Pendiente';

      acc.fecha = item.fecha;
    });

    const historialAgrupado = Array.from(agrupadosMap.values());

    // 🔢 TOTALES (YA AGRUPADOS)
    const totalTurnos = historialAgrupado.reduce((acc, i) => acc + i.diasTurno, 0);
    const totalHoras = historialAgrupado.reduce((acc, i) => acc + i.horasAdicionales, 0);
    const totalBruto = historialAgrupado.reduce((acc, i) => acc + i.totalBruto, 0);
    const totalNeto = historialAgrupado.reduce((acc, i) => acc + i.neto, 0);
    const totalAportes = historialAgrupado.reduce((acc, i) => acc + i.descuentoPrestamo, 0);
    const totalArl = historialAgrupado.reduce((acc, i) => acc + i.descuentoSeguridad, 0);
    const totalBono = historialAgrupado.reduce((acc, i) => acc + i.bono, 0);

    const totalPagado = historialAgrupado
      .filter(i => i.estado === 'Pagado')
      .reduce((acc, i) => acc + i.neto, 0);

    const totalPendiente = historialAgrupado
      .filter(i => i.estado !== 'Pagado')
      .reduce((acc, i) => acc + i.neto, 0);

    // Anchos de columna
    ws.columns = [
      { width: 28 }, // Nombre
      { width: 16 }, // Cédula
      { width: 26 }, // Parqueadero
      { width: 16 }, // Banco
      { width: 22 }, // Cuenta
      { width: 9  }, // Turnos
      { width: 9  }, // Horas
      { width: 14 }, // Bono
      { width: 16 }, // Bruto
      { width: 14 }, // Aportes
      { width: 14 }, // ARL
      { width: 16 }, // Neto
      { width: 12 }, // Estado
      { width: 20 }, // Fecha
    ];

    // Título
    ws.mergeCells('A1:N1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `INFORME DE LIQUIDACIONES — ${periodo.toUpperCase()}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    ws.mergeCells('A2:N2');
    ws.getRow(2).height = 6;
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

    // Encabezados
    const headers = ['Nombre', 'Cédula', 'Parqueadero', 'Banco', 'Cuenta', 'Turnos', 'Horas', 'Bono', 'Total Bruto', 'Aportes', 'ARL', 'Neto', 'Estado', 'Fecha'];
    const headerRow = ws.addRow(headers);

    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF10B981' } } };
    });

    headerRow.height = 22;

    // Filas de datos (YA AGRUPADAS)
    const moneyFmt = '#,##0';

    historialAgrupado.forEach((item, idx) => {
      const row = ws.addRow([
        item.persona.nombre,
        item.persona.cedula || '',
        item.persona.cargo,
        item.persona.formaPago,
        item.persona.numeroCuenta || '',
        item.diasTurno,
        item.horasAdicionales,
        item.bono,
        item.totalBruto,
        item.descuentoPrestamo,
        item.descuentoSeguridad,
        item.neto,
        item.estado,
        item.fecha,
      ]);

      const isEven = idx % 2 === 0;
      const bgColor = isEven ? 'FFF0FDF4' : 'FFFFFFFF';

      row.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.font = { size: 9 };

        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFD1FAE5' } },
          left: { style: 'thin', color: { argb: 'FFD1FAE5' } },
          right: { style: 'thin', color: { argb: 'FFD1FAE5' } },
        };

        // money: 8=Bono, 9=Bruto, 10=Aportes, 11=ARL, 12=Neto
        if ([8, 9, 10, 11, 12].includes(colNum)) {
          cell.numFmt = moneyFmt;
          cell.alignment = { horizontal: 'right' };
        }

        // center: 6=Turnos, 7=Horas
        if ([6, 7].includes(colNum)) {
          cell.alignment = { horizontal: 'center' };
        }

        // Estado col 13
        if (colNum === 13) {
          cell.font = {
            bold: true,
            size: 9,
            color: { argb: item.estado === 'Pagado' ? 'FF065F46' : 'FF92400E' }
          };

          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: item.estado === 'Pagado' ? 'FFD1FAE5' : 'FFFEF3C7' }
          };

          cell.alignment = { horizontal: 'center' };
        }
      });

      row.height = 18;
    });

    // Totales
    const totRow = ws.addRow([
      'TOTALES', '', '', '', '',
      totalTurnos,
      totalHoras,
      totalBono,
      totalBruto,
      totalAportes,
      totalArl,
      totalNeto,
      '', ''
    ]);

    totRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FF10B981' } } };

      if ([8, 9, 10, 11, 12].includes(colNum)) {
        cell.numFmt = moneyFmt;
        cell.alignment = { horizontal: 'right' };
      }

      if ([6, 7].includes(colNum)) {
        cell.alignment = { horizontal: 'center' };
      }
    });

    totRow.height = 22;

    // Resumen final
    ws.addRow([]);

    const resRow = ws.addRow([
      `Total Pagado: $${totalPagado.toLocaleString('es-CO')}`,
      '', '', '', '', '',
      `Total Pendiente: $${totalPendiente.toLocaleString('es-CO')}`
    ]);

    resRow.getCell(1).font = { bold: true, color: { argb: 'FF065F46' }, size: 10 };
    resRow.getCell(7).font = { bold: true, color: { argb: 'FF92400E' }, size: 10 };

    // Descargar
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Liquidaciones.xlsx';
    a.click();
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error('Error generando Excel:', err);
  }
};


  const seleccionar = async (p: Persona) => {
    setPersonaSeleccionada(p); setPersonaEditable({ ...p });
    setBusqueda(p.nombre); setMostrarDropdown(false);
    setResultado(null); 
    setMostrarDesglose(false);
    
    // Obtener días ARL del mes actual
    setDiasARLCalculados(null);
    const m = new Date().getMonth() + 1;
    const y = new Date().getFullYear();
    const dias = await calcularDiasARL(p.cedula, m, y);
    setDiasARLCalculados(dias);

    // Configurar form inicial
    const formInicial = formVacio();
    formInicial.valorDescuentoSeguridad = Math.round((DESCUENTO_SEG_SOCIAL_FULL / 30) * dias);
    formInicial.tieneDescuentoSeguridad = true; // sugerir descuento por defecto al haber integración
    setForm(formInicial);
  };
  const generarExcelDavivienda2 = () => {
    fetch('/plantilla.xlsx')
      .then(res => {
        if (!res.ok) throw new Error(`No se pudo encontrar el archivo 'plantilla.xlsx' en el servidor (Error ${res.status}). Asegúrate de que el archivo esté en la carpeta /public.`);
        return res.arrayBuffer();
      })
      .then(data => {
        const wb = XLSX.read(data, { type: 'array', cellStyles: true });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const json: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const separarNombreApellido = (nombreCompleto: string) => {
          const partes = nombreCompleto.trim().split(' ');
          if (partes.length === 1) return { nombre: partes[0], apellido: '' };
          const mitad = Math.ceil(partes.length / 2);
          return {
            apellido: partes.slice(0, mitad).join(' '),
            nombre: partes.slice(mitad).join(' '),
          };
        };

        // Agrupar por cédula: solo Pagado + Davivienda, sumando neto si aparece más de una vez
        const agrupado = new Map<string, { neto: number; item: typeof historialActivo[0] }>();
        for (const item of historialActivo) {
          if (item.estado !== 'Pagado') continue;
          if (item.persona.formaPago.toLowerCase() !== 'davivienda') continue;
          if (!item.persona.cedula) continue;
          const ced = item.persona.cedula.trim();
          if (agrupado.has(ced)) {
            agrupado.get(ced)!.neto += item.resultado.neto;
          } else {
            agrupado.set(ced, { neto: item.resultado.neto, item });
          }
        }

        // 1️⃣ Llenar personas que YA están en la plantilla con el neto sumado
        const cedulasEnPlantilla = new Set<string>();
        for (let i = 1; i < json.length; i++) {
          const fila = json[i];
          const cedulaExcel = String(fila[1] || '').trim();
          if (!cedulaExcel) continue;
          cedulasEnPlantilla.add(cedulaExcel);
          const entrada = agrupado.get(cedulaExcel);
          if (entrada) fila[7] = entrada.neto;
        }

        // 2️⃣ Última fila con datos
        let ultimaFilaConDatos = 0;
        for (let i = json.length - 1; i >= 0; i--) {
          if (json[i] && json[i].some((v: any) => v !== null && v !== undefined && v !== '')) {
            ultimaFilaConDatos = i;
            break;
          }
        }

        // 3️⃣ Agregar personas nuevas (no estaban en plantilla) — una sola fila con neto sumado
        for (const [cedula, { neto, item }] of agrupado.entries()) {
          if (cedulasEnPlantilla.has(cedula)) continue;
          const { nombre, apellido } = separarNombreApellido(item.persona.nombre);
          const cuenta = item.persona.numeroCuenta || '';
          const nuevaFila: any[] = [1, cedula, nombre.toUpperCase(), apellido.toUpperCase(), 51, 'CA', cuenta, neto];
          json.splice(ultimaFilaConDatos + 1, 0, nuevaFila);
          ultimaFilaConDatos++;
        }

        // Reconstruir hoja preservando formato original
        const nuevaHoja = XLSX.utils.aoa_to_sheet(json);
        if (ws['!cols']) nuevaHoja['!cols'] = ws['!cols'];
        if (ws['!rows']) nuevaHoja['!rows'] = ws['!rows'];
        if (ws['!merges']) nuevaHoja['!merges'] = ws['!merges'];
        wb.Sheets[wsName] = nuevaHoja;
        XLSX.writeFile(wb, 'Davivienda_Pagos.xlsx');
      })
      .catch(err => {
        console.error('Error generando Excel Davivienda:', err);
        alert('Error al generar Excel: ' + err.message);
      });
  };

  const generarExcelPorBanco = async (banco: string) => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Fundamiga'; wb.created = new Date();
      const ws = wb.addWorksheet(banco);
      const periodo = obtenerPeriodo();

      // Agrupar pagados de ese banco por cédula (comparación sin distinción de mayúsculas)
      const agrupadoMap = new Map<string, { neto: number; item: typeof historialActivo[0] }>();
      for (const item of historialActivo) {
        if (item.estado !== 'Pagado') continue;
        if (item.persona.formaPago.toLowerCase().trim() !== banco.toLowerCase().trim()) continue;
        if (!item.persona.cedula) continue;
        const ced = item.persona.cedula.trim();
        if (agrupadoMap.has(ced)) { agrupadoMap.get(ced)!.neto += item.resultado.neto; }
        else { agrupadoMap.set(ced, { neto: item.resultado.neto, item }); }
      }

      ws.columns = [
        { width: 28 }, { width: 16 }, { width: 26 }, { width: 22 }, { width: 16 }, { width: 18 },
      ];

      ws.mergeCells('A1:F1');
      const titleCell = ws.getCell('A1');
      titleCell.value = `PAGOS ${banco.toUpperCase()} — ${periodo.toUpperCase()}`;
      titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 28;

      ws.mergeCells('A2:F2');
      ws.getRow(2).height = 5;
      ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

      const headerRow = ws.addRow(['Nombre', 'Cédula', 'Parqueadero', 'Cuenta', 'Banco', 'Neto a Pagar']);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF10B981' } } };
      });
      headerRow.height = 20;

      let totalNeto = 0;
      Array.from(agrupadoMap.values()).forEach(({ neto, item }, idx) => {
        totalNeto += neto;
        const row = ws.addRow([
          item.persona.nombre,
          item.persona.cedula || '',
          item.persona.cargo,
          item.persona.numeroCuenta || '',
          banco,
          neto,
        ]);
        const bgColor = idx % 2 === 0 ? 'FFF0FDF4' : 'FFFFFFFF';
        row.eachCell((cell, colNum) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.font = { size: 9 };
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1FAE5' } }, left: { style: 'thin', color: { argb: 'FFD1FAE5' } }, right: { style: 'thin', color: { argb: 'FFD1FAE5' } } };
          if (colNum === 6) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' }; }
        });
        row.height = 18;
      });

      const totRow = ws.addRow(['TOTAL', '', '', '', '', totalNeto]);
      totRow.eachCell((cell, colNum) => {
        cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } };
        cell.border = { top: { style: 'medium', color: { argb: 'FF10B981' } } };
        if (colNum === 6) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right' }; }
      });
      totRow.height = 20;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `Pagos_${banco}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (err) { console.error('Error generando Excel por banco:', err); }
  };

  const [filtroHistorial, setFiltroHistorial] = useState('');
  const [filtroCargo, setFiltroCargo] = useState('');
  const [filtroQuincena, setFiltroQuincena] = useState('');
  const [filtroBanco, setFiltroBanco] = useState('');
  const [mostrarPreviewDavivienda, setMostrarPreviewDavivienda] = useState(false);
  const tablaRef = useRef<HTMLDivElement>(null);
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null);
  const [formEditar, setFormEditar] = useState<FormLiquidacion | null>(null);
  const [personaEditar, setPersonaEditar] = useState<Persona | null>(null);

  const editRowRef = useRef<HTMLTableRowElement>(null);
  const abrirEditar = (index: number) => {
    setEditandoIndex(index);
    setFormEditar({ ...historialActivo[index].form });
    setPersonaEditar({ ...historialActivo[index].persona });
    setTimeout(() => editRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const cancelarEditar = () => { setEditandoIndex(null); setFormEditar(null); setPersonaEditar(null); };

  const guardarEdicion = async () => {
    if (editandoIndex === null || !formEditar || !personaEditar) return;
    const item = historialActivo[editandoIndex];
    const r = calcular(personaEditar, formEditar);
    const updated = { ...item, persona: personaEditar, form: formEditar, resultado: r } as any;
    const n = [...historialActivo];
    n[editandoIndex] = updated;
    setHistorialActivo(n);
    await registrarCambio('EDICIÓN', personaEditar.nombre,
      `Liquidación editada — Neto anterior: ${fmt(item.resultado.neto)} → Neto nuevo: ${fmt(r.neto)}`,
      { form: item.form, persona: item.persona, neto: item.resultado.neto },
      { form: formEditar, persona: personaEditar, neto: r.neto }
    );
    setEditandoIndex(null);
    setFormEditar(null);
    setPersonaEditar(null);
  };

  const eliminarFila = async (index: number) => {
    const item = historialActivo[index] as any;
    if (modoInforme === 'general' && item._id) await supabase.from('historial_liquidaciones').delete().eq('id', item._id);
    await registrarCambio('ELIMINACIÓN', item.persona.nombre,
      `Liquidación eliminada — Neto: ${fmt(item.resultado.neto)}`,
      { neto: item.resultado.neto, fecha: item.fecha }, null
    );
    setHistorialActivo(prev => prev.filter((_, i) => i !== index));
  };

  const reiniciarValoresMasivo = async () => {
    if (historialActivo.length === 0) return;
    if (!confirm('¿Seguro que quieres poner a CERO todos los valores de este informe? Los trabajadores permanecerán en la lista.')) return;

    setLoadingHistorial(true);
    try {
      const nuevoHistorial = await Promise.all(historialActivo.map(async (item) => {
        const formReset = formVacio(); // Ponemos todo en 0
        const resultadoReset = calcular(item.persona as any, formReset);
        
        const updated = { ...item, form: formReset, resultado: resultadoReset };
        
        if (modoInforme === 'general' && (item as any)._id) {
          await supabase.from('historial_liquidaciones')
            .update({ form: formReset, resultado: resultadoReset })
            .eq('id', (item as any)._id);
        }
        
        return updated;
      }));
      
      setHistorialActivo(nuevoHistorial as any);
      await registrarCambio('REINICIO MASIVO', 'Todos', `Se reiniciaron los valores de ${nuevoHistorial.length} registros a cero.`, null, null);
    } catch (e: any) {
      setErrorMsg('Error al reiniciar valores: ' + e.message);
    }
    setLoadingHistorial(false);
  };
 
  const sincronizarARLMasivo = async () => {
    if (historialActivo.length === 0) return;
    if (!confirm('¿Sincronizar descuentos de ARL para todos los registros del mes actual?')) return;

    setLoadingHistorial(true);

    try {
      const nuevoHistorial = await Promise.all(historialActivo.map(async (item) => {
        // Extraemos mes y año de la fecha de la liquidación para usar el periodo correcto
        const fechaDoc = new Date(item.fecha + 'T12:00:00');
        const m = fechaDoc.getMonth() + 1;
        const y = fechaDoc.getFullYear();

        // Obtenemos los días actualizados desde la utilidad que lee supabase
        const dias = await calcularDiasARL((item.persona as any).cedula, m, y, item.fecha);
        const nuevoDescuento = Math.round((76200 / 30) * dias);
        const nuevoForm = { ...item.form, valorDescuentoSeguridad: nuevoDescuento, tieneDescuentoSeguridad: true };
        const nuevoResultado = calcular(item.persona as any, nuevoForm);
        
        const updated = { ...item, form: nuevoForm, resultado: nuevoResultado };
        
        // Si estamos en modo general, actualizamos la base de datos
        if (modoInforme === 'general' && (item as any)._id) {
          await supabase.from('historial_liquidaciones')
            .update({ form: nuevoForm, resultado: nuevoResultado })
            .eq('id', (item as any)._id);
        }
        
        return updated;
      }));
      
      setHistorialActivo(nuevoHistorial as any);
      await registrarCambio('SINCRONIZACIÓN ARL', 'Masivo', `Se actualizaron los descuentos de ARL para ${nuevoHistorial.length} registros.`, null, null);
      alert(`${nuevoHistorial.length} liquidaciones sincronizadas correctamente con el módulo ARL.`);
    } catch (e: any) {
      setErrorMsg('Error al sincronizar ARL: ' + e.message);
    }
    setLoadingHistorial(false);
  };

  const marcarTodoPagado = async () => {
    if (!confirm('¿Marcar todas las liquidaciones como Pagado?')) return;
    if (modoInforme === 'general') await supabase.from('historial_liquidaciones').update({ estado: 'Pagado' }).eq('estado', 'Pendiente');
    await registrarCambio('MARCAR PAGADO', 'Todos', `Se marcaron ${historialActivo.filter(i => i.estado === 'Pendiente').length} liquidaciones como Pagado`, null, null);
    setHistorialActivo(prev => prev.map(item => ({ ...item, estado: 'Pagado' as const })));
  };

  const borrarHistorial = async () => {
    if (!confirm("¿Seguro que quieres borrar todo el informe?")) return;
    await registrarCambio('BORRADO INFORME', 'Todos', `Se borró el informe completo con ${historialActivo.length} registros`, { total: historialActivo.length }, null);
    if (modoInforme === 'general') {
      await supabase.from('historial_liquidaciones').delete().neq('id', '');
      setHistorial([]);
    } else {
      localStorage.removeItem('historial_privado_fundamiga');
      setHistorialPrivadoRaw([]);
    }
  };

  // ── Registro de cambios ──────────────────────────────────────────
  const registrarCambio = async (accion: string, trabajador: string, detalle: string, anteriores?: any, nuevos?: any) => {
    if (modoInforme !== 'general') return; // Solo en modo general
    try {
      await supabase.from('registro_cambios').insert({
        id: Date.now().toString(),
        accion,
        trabajador,
        detalle,
        valores_anteriores: anteriores || null,
        valores_nuevos: nuevos || null,
        usuario: usuarioActual || 'Desconocido',
        fecha: new Date().toISOString(),
      });
    } catch (e) { console.error('Error registrando cambio:', e); }
  };

  const cargarRegistroCambios = async () => {
    setLoadingRegistro(true);
    const { data, error } = await supabase
      .from('registro_cambios')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(100);
    if (!error && data) setRegistroCambios(data);
    setLoadingRegistro(false);
  };

  const obtenerPeriodo = () => {
    const f = new Date(); const dia = f.getDate();
    const mes = f.toLocaleString('es-CO', { month: 'long' }); const año = f.getFullYear();
    return `${dia <= 15 ? '1ra' : '2da'} Quincena - ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${año}`;
  };

  const generarPDF = () => {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text("Informe General de Liquidaciones", 14, 15);

  doc.setFontSize(10);
  doc.text(`Periodo: ${obtenerPeriodo()}`, 14, 22);

  // 🔥 AGRUPAR POR CÉDULA
  const agrupadosMap = new Map();

  historialActivo.forEach(item => {
    const key = item.persona.cedula || 'sin-cedula';

    if (!agrupadosMap.has(key)) {
      agrupadosMap.set(key, {
        persona: item.persona,
        diasTurno: 0,
        horasAdicionales: 0,
        bono: 0,
        totalBruto: 0,
        descuentoPrestamo: 0,
        descuentoSeguridad: 0,
        neto: 0,
        estado: item.estado,
        fecha: item.fecha,
      });
    }

    const acc = agrupadosMap.get(key);

    acc.diasTurno += item.form.diasTurno;
    acc.horasAdicionales += item.form.horasAdicionales;
    acc.bono += item.form.tieneBono ? item.form.valorBono : 0;
    acc.totalBruto += item.resultado.totalBruto;
    acc.descuentoPrestamo += item.resultado.descuentoPrestamo;
    acc.descuentoSeguridad += item.resultado.descuentoSeguridad;
    acc.neto += item.resultado.neto;

    if (item.estado !== 'Pagado') acc.estado = 'Pendiente';

    acc.fecha = item.fecha;
  });

  const historialAgrupado = Array.from(agrupadosMap.values());

  // 📊 FILAS (YA AGRUPADAS)
  const rows = historialAgrupado.map(item => [
    item.persona.nombre,
    item.persona.cedula || 'N/A',
    item.persona.cargo,
    item.persona.formaPago,
    item.persona.numeroCuenta || '—',
    item.diasTurno,
    item.horasAdicionales,
    item.bono > 0 ? fmt(item.bono) : '—',
    fmt(item.totalBruto),
    item.descuentoPrestamo > 0 ? fmt(item.descuentoPrestamo) : '—',
    item.descuentoSeguridad > 0 ? fmt(item.descuentoSeguridad) : '—',
    fmt(item.neto),
    item.estado,
    item.fecha,
  ]);

  // 🔢 TOTALES (AGRUPADOS)
  const tot = historialAgrupado.reduce((a, i) => {
    a.t += i.diasTurno;
    a.h += i.horasAdicionales;
    a.bn += i.bono;
    a.b += i.totalBruto;
    a.ap += i.descuentoPrestamo;
    a.arl += i.descuentoSeguridad;
    a.n += i.neto;
    return a;
  }, { t: 0, h: 0, bn: 0, b: 0, ap: 0, arl: 0, n: 0 });

  rows.push([
    "TOTALES", "", "", "", "",
    tot.t,
    tot.h,
    fmt(tot.bn),
    fmt(tot.b),
    fmt(tot.ap),
    fmt(tot.arl),
    fmt(tot.n),
    "",
    ""
  ]);

  // 📄 TABLA
  autoTable(doc, {
    startY: 30,
    head: [["Nombre", "Cédula", "Parqueadero", "Banco", "Cuenta", "Turnos", "Horas", "Bono", "Bruto", "Aportes", "ARL", "Neto", "Estado", "Fecha"]],
    body: rows,
    styles: { fontSize: 6 },
    headStyles: { fillColor: [16, 185, 129] }
  });

  // 📊 RESUMEN
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  const totalPagado = historialAgrupado
    .filter(i => i.estado === 'Pagado')
    .reduce((acc, i) => acc + i.neto, 0);

  const totalPendiente = historialAgrupado
    .filter(i => i.estado !== 'Pagado')
    .reduce((acc, i) => acc + i.neto, 0);

  doc.setFontSize(10);

  doc.setTextColor(16, 185, 129);
  doc.text(`Total Pagado: ${fmt(totalPagado)}`, 14, finalY);

  doc.setTextColor(234, 179, 8);
  doc.text(`Total Pendiente: ${fmt(totalPendiente)}`, 14, finalY + 8);

  doc.setTextColor(0, 0, 0);

  doc.save("liquidaciones.pdf");
};

  const cambiarEstado = async (index: number) => {
    const item = historialActivo[index] as any;
    if (modoInforme === 'general' && item._id) await supabase.from('historial_liquidaciones').update({ estado: 'Pagado' }).eq('id', item._id);
    await registrarCambio('PAGO', item.persona.nombre, `Marcado como Pagado — Neto: ${fmt(item.resultado.neto)}`, { estado: 'Pendiente' }, { estado: 'Pagado' });
    const n = [...historialActivo]; n[index].estado = 'Pagado'; setHistorialActivo(n);
  };

  const limpiar = () => { setPersonaSeleccionada(null); setBusqueda(''); setResultado(null); setForm(formVacio()); setMostrarDesglose(false); };

  const set = (field: keyof FormLiquidacion, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleCalcular = async () => {
    if (!personaEditable) return;
    // Pedir nombre si no está configurado
    if (!usuarioActual) { setMostrarPedirNombre(true); return; }
    const yaExiste = historialActivo.some(item => item.persona.cedula === personaEditable.cedula && item.persona.nombre === personaEditable.nombre);
    if (yaExiste) {
      const confirmar = confirm(`⚠️ ${personaEditable.nombre} ya tiene una liquidación registrada en este informe. ¿Deseas agregar otra de todas formas?`);
      if (!confirmar) return;
    }
    const r = calcular(personaEditable, form);
    setResultado(r);
    const id = Date.now().toString();
    const fecha = new Date().toLocaleString('es-CO');
    const quincena = obtenerPeriodo();
    if (modoInforme === 'general') {
      await supabase.from('historial_liquidaciones').insert({ id, persona: personaEditable, form, resultado: r, fecha, estado: 'Pendiente', quincena });
      await registrarCambio('NUEVO CÁLCULO', personaEditable.nombre, `Liquidación calculada — Neto: ${fmt(r.neto)} — ${quincena}`, null, { neto: r.neto, form });
      setHistorial(prev => [...prev, { persona: personaEditable, form, resultado: r, fecha, estado: 'Pendiente', _id: id } as any]);
    } else {
      setHistorialPrivado(prev => [...prev, { persona: personaEditable, form, resultado: r, fecha, estado: 'Pendiente' } as any]);
    }
  };

  const res = resultado;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${modoClaro ? "bg-gray-50 text-slate-900" : "bg-slate-950 text-white"}`}>

      {/* Modal pedir nombre */}
      {mostrarPedirNombre && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-white text-lg mb-1">¿Quién eres?</h3>
            <p className="text-slate-500 text-xs mb-4">Tu nombre quedará registrado en cada cambio que hagas. Solo se pide una vez.</p>
            <input
              autoFocus
              value={nombreInput}
              onChange={e => setNombreInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && nombreInput.trim()) {
                  const nombre = nombreInput.trim();
                  localStorage.setItem('fundamiga_usuario', nombre);
                  setUsuarioActual(nombre);
                  setMostrarPedirNombre(false);
                  setNombreInput('');
                  // Re-ejecutar calcular
                  setTimeout(() => handleCalcular(), 100);
                }
              }}
              placeholder="Ej: María González"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white font-semibold text-sm outline-none focus:border-emerald-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!nombreInput.trim()) return;
                  const nombre = nombreInput.trim();
                  localStorage.setItem('fundamiga_usuario', nombre);
                  setUsuarioActual(nombre);
                  setMostrarPedirNombre(false);
                  setNombreInput('');
                  setTimeout(() => handleCalcular(), 100);
                }}
                disabled={!nombreInput.trim()}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-black py-2.5 rounded-xl text-sm transition-all disabled:opacity-40"
              >
                Continuar
              </button>
              <button onClick={() => { setMostrarPedirNombre(false); setNombreInput(''); }}
                className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-xl text-sm transition-all">
                <X size={15} />
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Panel registro de cambios */}
      {mostrarRegistroCambios && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
              <Clock size={16} className="text-emerald-400" />
              <h3 className="font-black text-white flex-1">Registro de Cambios</h3>
              <button onClick={() => setMostrarRegistroCambios(false)} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
              {loadingRegistro ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
                </div>
              ) : registroCambios.length === 0 ? (
                <p className="text-slate-600 text-sm text-center py-10">Sin cambios registrados aún</p>
              ) : registroCambios.map((c, i) => (
                <div key={i} className="flex gap-3 py-2 border-b border-slate-800/60 last:border-0">
                  <div className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                    c.accion === 'ELIMINACIÓN' || c.accion === 'BORRADO INFORME' ? 'bg-red-400' :
                    c.accion === 'PAGO' || c.accion === 'MARCAR PAGADO' ? 'bg-emerald-400' :
                    c.accion === 'EDICIÓN' ? 'bg-amber-400' : 'bg-blue-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                        c.accion === 'ELIMINACIÓN' || c.accion === 'BORRADO INFORME' ? 'bg-red-500/15 text-red-400' :
                        c.accion === 'PAGO' || c.accion === 'MARCAR PAGADO' ? 'bg-emerald-500/15 text-emerald-400' :
                        c.accion === 'EDICIÓN' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'
                      }`}>{c.accion}</span>
                      <span className="text-white text-xs font-bold truncate">{c.trabajador}</span>
                    </div>
                    <p className="text-slate-500 text-[10px] mt-0.5">{c.detalle}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-slate-600 text-[9px]">{c.usuario}</span>
                      <span className="text-slate-700 text-[9px]">{new Date(c.fecha).toLocaleString('es-CO')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-900/90 border border-red-500/50 text-red-200 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-md text-sm font-semibold max-w-lg w-full mx-4">
          <AlertCircle size={16} className="shrink-0 text-red-400" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white transition-colors"><X size={15} /></button>
        </div>
      )}

      {/* Alerta personas sin calcular */}
      {!alertaCerrada && (() => {
        const cedulasCalculadas = new Set(historialActivo.map(i => i.persona.cedula));
        const faltantes = personasActivas.filter(p => !cedulasCalculadas.has(p.cedula));
        if (faltantes.length === 0) return null;
        return (
          <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full">
            <div className="bg-yellow-900/95 border border-yellow-500/50 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-yellow-500/30">
                <AlertCircle size={16} className="shrink-0 text-yellow-400" />
                <p className="text-yellow-200 font-black text-sm flex-1">
                  {faltantes.length} persona{faltantes.length > 1 ? 's' : ''} sin calcular
                </p>
                <button
                  onClick={() => setAlertaCerrada(true)}
                  className="text-yellow-500 hover:text-yellow-200 transition-colors p-1 rounded-lg hover:bg-yellow-500/20"
                  title="Cerrar"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="px-4 py-2 max-h-36 overflow-y-auto space-y-1">
                {faltantes.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                    <p className="text-yellow-100 text-xs font-semibold truncate">{p.nombre}</p>
                    <span className="text-yellow-600 text-[10px] ml-auto shrink-0">{p.cargo}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div className={`relative overflow-hidden border-b transition-colors duration-300 ${modoClaro ? "bg-white border-gray-200" : "bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-slate-800/80"}`}>
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-10 -right-10 w-60 h-60 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative px-6 md:px-8 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-13 h-13 w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-900/40">
                <Calculator size={24} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full border-2 border-slate-900 flex items-center justify-center">
                <Sparkles size={8} className="text-yellow-900" />
              </div>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight">Liquidación de Personal</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[9px] font-black px-2.5 py-1 bg-emerald-500/15 text-emerald-400 rounded-lg uppercase tracking-wider border border-emerald-500/20">Módulo Nómina</span>
                <span className="text-[10px] font-semibold text-slate-500">{obtenerPeriodo()}</span>
              </div>
              {/* Selector de modo */}
              <div className="flex items-center gap-1 mt-3">
                <button
                  onClick={() => setModoInforme('general')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${modoInforme === 'general' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
                >
                  📋 General
                </button>
                <button
                  onClick={() => setModoInforme('privado')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${modoInforme === 'privado' ? 'bg-purple-500/20 border-purple-500/40 text-purple-400' : 'border-slate-700 text-slate-500 hover:text-slate-300'}`}
                >
                  🔒 Privado {mounted && historialPrivado.length > 0 && <span className="bg-purple-500/30 px-1.5 py-0.5 rounded-full">{historialPrivado.length}</span>}
                </button>
              </div>
            </div>
          </div>
          <button
              onClick={() => setModoClaro(m => !m)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-bold text-xs transition-all ${modoClaro ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-yellow-400 hover:border-yellow-500/30'}`}
              title={modoClaro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
            >
              {modoClaro ? <Moon size={14} /> : <Sun size={14} />}
              {modoClaro ? 'Oscuro' : 'Claro'}
            </button>
            <button 
              onClick={() => setMostrarFormulas(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-bold text-xs transition-all ${modoClaro ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30'}`}
              title="Ver fórmulas y lógica"
            >
              <BookOpen size={14} />
              Fórmulas
            </button>
          {historialActivo.length > 0 && (
            <div className="hidden md:flex items-center gap-6">
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Registros</p>
                <p className="text-2xl font-black text-white">{historialActivo.length}</p>
              </div>
              <div className="w-px h-10 bg-slate-800" />
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Total Neto</p>
                <p className="text-2xl font-black text-emerald-400">{fmt(totalNeto)}</p>
              </div>
              <button
                onClick={() => tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 font-bold text-xs transition-all"
                title="Ir a la tabla"
              >
                <FileText size={13} />
                Ver tabla
              </button>
              <button
                onClick={() => { setMostrarRegistroCambios(true); cargarRegistroCambios(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-purple-400 hover:border-purple-500/30 font-bold text-xs transition-all"
                title="Ver registro de cambios"
              >
                <Clock size={13} />
                Cambios
              </button>
              {usuarioActual && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-800 cursor-pointer hover:border-slate-600 transition-all"
                  onClick={() => {
                    const nuevo = prompt('Cambiar nombre de usuario:', usuarioActual);
                    if (nuevo?.trim()) { localStorage.setItem('fundamiga_usuario', nuevo.trim()); setUsuarioActual(nuevo.trim()); }
                  }}
                  title="Cambiar usuario"
                >
                  <div className="w-5 h-5 rounded-full bg-emerald-500/30 border border-emerald-500/40 flex items-center justify-center">
                    <span className="text-[9px] font-black text-emerald-400">{usuarioActual.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 max-w-[80px] truncate">{usuarioActual}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">

          {/* Columna formulario */}
          <div className="space-y-5">

            {/* Buscar */}
            <div className={`border rounded-2xl p-6 transition-colors duration-300 ${modoClaro ? "bg-white border-gray-200 shadow-sm" : "bg-slate-900/80 border-slate-800"}`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Users size={14} className="text-emerald-400" />
                </div>
                <h3 className="font-black text-base">Seleccionar Trabajador</h3>
              </div>
              {loadingPersonas && (
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold py-2 px-1">
                  <div className="w-3 h-3 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
                  Cargando trabajadores desde Supabase...
                </div>
              )}
              <div className="relative">
                <div className={`flex items-center gap-3 pl-4 pr-4 py-3.5 bg-slate-800/60 border rounded-xl transition-all ${mostrarDropdown && busqueda ? 'border-emerald-500 ring-2 ring-emerald-500/15' : 'border-slate-700'}`}>
                  <Search size={16} className="text-slate-500 shrink-0" />
                  <input type="text" placeholder="Buscar por nombre o cédula…" value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setMostrarDropdown(true); if (personaSeleccionada?.nombre !== e.target.value) { setPersonaSeleccionada(null); setResultado(null); } }}
                    onFocus={() => setMostrarDropdown(true)}
                    className="flex-1 bg-transparent outline-none text-white font-semibold text-sm placeholder:text-slate-600" />
                  {busqueda && <button onClick={limpiar} className="text-slate-600 hover:text-red-400 transition-colors"><X size={15} /></button>}
                </div>
                {mostrarDropdown && busqueda && !personaSeleccionada && filtradas.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden max-h-64 overflow-y-auto">
                    {filtradas.map((p, i) => (
                      <button key={i} onClick={() => seleccionar(p)} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800 text-left transition-colors border-b border-slate-800 last:border-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                          <User size={14} className="text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-sm truncate">{p.nombre}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">C.C. {p.cedula || '—'} · {fmt(p.valorTurno)}/turno · {p.formaPago}</p>
                          <p className="text-[9px] text-teal-400 font-bold mt-0.5">{p.cargo}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                {mostrarDropdown && busqueda && !personaEditable && filtradas.length === 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl p-5 text-center">
                    <AlertCircle size={20} className="text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Sin resultados para <span className="text-white font-bold">"{busqueda}"</span></p>
                  </div>
                )}
              </div>
              {personaEditable && (
                <div className="mt-4 relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-900/40">
                      <User size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-white text-base truncate">{personaEditable.nombre}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-[9px] font-bold text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/20">C.C. {personaEditable.cedula || 'N/A'}</span>
                        <span className="text-[9px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">{fmt(personaEditable.valorTurno)}/día</span>
                        <span className="text-[9px] font-bold text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">{personaEditable.formaPago}</span>
                      </div>
                      <div className="mt-3">
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Cargo / Lugar</label>
                        <select
                          value={personaEditable.cargo}
                          onChange={e => setPersonaEditable(prev => prev ? { ...prev, cargo: e.target.value } : prev)}
                          className="w-full bg-slate-800/80 border border-slate-600 text-white text-xs font-bold px-3 py-2 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer"
                        >
                          {CARGOS.map(c => (
                            <option key={c} value={c} className="bg-slate-900">{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button onClick={limpiar} className="text-slate-600 hover:text-red-400 transition-colors p-1.5 hover:bg-slate-800 rounded-xl self-start"><X size={16} /></button>
                  </div>
                </div>
              )}
            </div>

            {/* Formulario condicional */}
            {personaSeleccionada && (
              <>
                {/* Días y turnos */}
                <div className={`border rounded-2xl p-6 transition-colors duration-300 ${modoClaro ? "bg-white border-gray-200 shadow-sm" : "bg-slate-900/80 border-slate-800"}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                      <Calendar size={14} className="text-yellow-400" />
                    </div>
                    <h3 className="font-black text-base">Días y Turnos</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <NumField label="Días de turno" value={form.diasTurno} onChange={v => set('diasTurno', v)} hint={`→ ${fmt(form.diasTurno * personaSeleccionada.valorTurno)}`} />
                    <NumField label="Turnos adicionales" value={form.turnosAdicionales} onChange={v => set('turnosAdicionales', v)} hint={`→ ${fmt(form.turnosAdicionales * personaSeleccionada.valorTurno)}`} />
                    <NumField label="Horas adicionales" value={form.horasAdicionales} onChange={v => set('horasAdicionales', v)} hint={`${fmt(personaSeleccionada.valorHoraAdicional)}/h → ${fmt(form.horasAdicionales * personaSeleccionada.valorHoraAdicional)}`} />
                  </div>
                </div>

                {/* Descuentos */}
                <div className={`border rounded-2xl p-6 transition-colors duration-300 ${modoClaro ? "bg-white border-gray-200 shadow-sm" : "bg-slate-900/80 border-slate-800"}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                      <MinusCircle size={14} className="text-red-400" />
                    </div>
                    <h3 className="font-black text-base">Descuentos</h3>
                  </div>
                  <div className="space-y-3">
                    <ToggleRow active={form.tieneDescuentoSeguridad} onToggle={() => set('tieneDescuentoSeguridad', !form.tieneDescuentoSeguridad)}
                      label={`Seguridad Social (ARL: ${diasARLCalculados ?? '...'} días)`} sublabel={`Prorrateo por defecto (30 días): ${fmt(DESCUENTO_SEG_SOCIAL_FULL)}`}
                      iconEl={<Shield size={15} className={form.tieneDescuentoSeguridad ? 'text-blue-300' : 'text-slate-500'} />}
                      accentClass="bg-blue-500/20 border border-blue-500/20" />
                    {form.tieneDescuentoSeguridad && (
                      <div className="pl-4 pr-4 py-4 mt-1 bg-blue-500/5 rounded-2xl border border-blue-500/10 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <NumField 
                           label="Días a descontar (editable)" 
                           value={diasARLCalculados || 30} 
                           onChange={d => {
                             setDiasARLCalculados(d);
                             set('valorDescuentoSeguridad', Math.round((DESCUENTO_SEG_SOCIAL_FULL / 30) * d));
                           }} 
                           min={0} 
                        />
                        <NumField label="Monto total a descontar" value={form.valorDescuentoSeguridad} onChange={v => set('valorDescuentoSeguridad', v)} prefix="$" />
                        <div className="md:col-span-2">
                           <p className="text-[10px] text-blue-400 font-semibold mt-[-5px]">
                             Si el trabajador faltó o trabajó días esporádicos, modifica los días arriba. El monto se calculará automáticamente limitando la base de 30 días.
                           </p>
                        </div>
                      </div>
                    )}
                    <ToggleRow active={form.tieneDescuentoPrestamo} onToggle={() => set('tieneDescuentoPrestamo', !form.tieneDescuentoPrestamo)}
                      label="Préstamos y Aportes" sublabel={`Por defecto: ${fmt(DESCUENTO_PRESTAMOS_DEFAULT)}`}
                      iconEl={<CreditCard size={15} className={form.tieneDescuentoPrestamo ? 'text-orange-300' : 'text-slate-500'} />}
                      accentClass="bg-orange-500/20 border border-orange-500/20" />
                    {form.tieneDescuentoPrestamo && (
                      <div className="pl-2 pt-1"><NumField label="Monto préstamos" value={form.valorDescuentoPrestamo} onChange={v => set('valorDescuentoPrestamo', v)} prefix="$" /></div>
                    )}
                    <ToggleRow active={form.tieneBono} onToggle={() => set('tieneBono', !form.tieneBono)}
                      label="Bono / Adicional" sublabel="Monto extra opcional (no se guarda en BD)"
                      iconEl={<Sparkles size={15} className={form.tieneBono ? 'text-purple-300' : 'text-slate-500'} />}
                      accentClass="bg-purple-500/20 border border-purple-500/20" />
                    {form.tieneBono && (
                      <div className="pl-2 pt-1 flex flex-col gap-3">
                        <NumField label="Valor bono / adicional" value={form.valorBono} onChange={v => set('valorBono', v)} prefix="$" />
                        <div className="group">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 group-focus-within:text-purple-400 transition-colors">Descripción del bono</label>
                          <input
                            type="text"
                            placeholder="Ej: Transporte, Alimentación, Prima…"
                            value={form.descripcionBono}
                            onChange={e => set('descripcionBono', e.target.value)}
                            className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-xl text-white text-sm font-semibold placeholder:text-slate-600 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Ajustar valores */}
                <div className={`border rounded-2xl p-6 transition-colors duration-300 ${modoClaro ? "bg-white border-gray-200 shadow-sm" : "bg-slate-900/80 border-slate-800"}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <TrendingUp size={14} className="text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-black text-base">Ajustar Valores</h3>
                      <p className="text-[10px] text-slate-600 mt-0.5">Edición manual para este cálculo</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <NumField label="Valor turno" value={personaEditable?.valorTurno || 0} onChange={v => setPersonaEditable(prev => prev ? { ...prev, valorTurno: v, valorHoraAdicional: v > 0 ? Math.round(v / 8) : prev.valorHoraAdicional } : prev)} prefix="$" />
                    <NumField label="Hora adicional" value={personaEditable?.valorHoraAdicional || 0} onChange={v => setPersonaEditable(prev => prev ? { ...prev, valorHoraAdicional: v } : prev)} prefix="$" />
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Forma de Pago</label>
                      <select value={personaEditable?.formaPago || ''} onChange={e => {
                        const nuevoBanco = e.target.value;
                        // Buscar la cuenta registrada para este trabajador con ese banco
                        const trabajadorActual = personasActivas.find(p => p.cedula === personaEditable?.cedula);
                        // Solo actualiza la cuenta si el trabajador tiene ese banco registrado
                        const nuevaCuenta = trabajadorActual?.formaPago?.toLowerCase() === nuevoBanco.toLowerCase()
                          ? (trabajadorActual?.numeroCuenta || '')
                          : '';
                        setPersonaEditable(prev => prev ? { ...prev, formaPago: nuevoBanco, numeroCuenta: nuevaCuenta } : prev);
                      }}
                        className="w-full px-4 py-3.5 bg-slate-800/60 border border-slate-700 rounded-xl text-white font-bold text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all">
                        <option value="">Seleccionar banco</option>
                        {['Bancolombia','Nequi','Daviplata','Davivienda','BBVA','Banco de Bogotá','Banco Popular','AV Villas','Caja Social','Transferencia','Efectivo'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      {personaEditable?.numeroCuenta && (
                        <p className="text-[9px] text-slate-500 font-mono mt-1">Cuenta: {personaEditable.numeroCuenta}</p>
                      )}
                      {personaEditable?.formaPago && personaEditable.formaPago !== 'Efectivo' && !personaEditable.numeroCuenta && (
                        <p className="text-[9px] text-yellow-500 font-semibold mt-1">⚠ Sin cuenta registrada para {personaEditable.formaPago}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Observaciones <span className="text-slate-700 normal-case font-normal">(opcional)</span></label>
                  <textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas adicionales…" rows={2}
                    className="w-full px-4 py-3.5 bg-slate-900/80 border border-slate-800 rounded-xl text-white font-medium text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 outline-none transition-all resize-none placeholder:text-slate-700" />
                </div>

                {/* Calcular */}
                <button onClick={handleCalcular}
                  className="w-full group relative overflow-hidden bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white py-4 px-8 rounded-2xl font-black text-base flex items-center justify-center gap-3 shadow-xl shadow-emerald-900/40 transition-all duration-300 active:scale-[0.98]">
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Calculator size={20} strokeWidth={2.5} />
                  <span>Calcular {modoInforme === 'privado' ? '(Privado 🔒)' : 'Liquidación'}</span>
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </>
            )}
          </div>

          {/* Columna resultado */}
          <div className="space-y-5">
            {res && personaEditable ? (
              <div className="bg-slate-900/80 border border-slate-700 rounded-2xl overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600" />
                <div className="p-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={18} className="text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-black text-white text-base leading-tight">{personaEditable.nombre}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{new Date().toLocaleDateString('es-CO')} · {personaEditable.formaPago}</p>
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Turnos regulares <span className="text-slate-600">({form.diasTurno}d)</span></span>
                      <span className="font-bold text-white">{fmt(res.subtotalTurnos)}</span>
                    </div>
                    {res.subtotalTurnosAdicionales > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Turnos adicionales <span className="text-slate-600">({form.turnosAdicionales})</span></span>
                        <span className="font-bold text-white">{fmt(res.subtotalTurnosAdicionales)}</span>
                      </div>
                    )}
                    {res.subtotalHoras > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400">Horas adicionales <span className="text-slate-600">({form.horasAdicionales}h)</span></span>
                        <span className="font-bold text-white">{fmt(res.subtotalHoras)}</span>
                      </div>
                    )}
                    {res.bono > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-purple-400 flex items-center gap-1.5">
                          <Sparkles size={12} />
                          Bono / Adicional
                          {form.descripcionBono && <span className="text-[10px] text-purple-500 font-normal ml-1">({form.descripcionBono})</span>}
                        </span>
                        <span className="font-bold text-purple-300">+{fmt(res.bono)}</span>
                      </div>
                    )}
                    <div className="border-t border-slate-700 pt-2.5 flex justify-between items-center">
                      <span className="text-slate-300 font-bold text-sm">Total bruto</span>
                      <span className="font-black text-white">{fmt(res.totalBruto)}</span>
                    </div>
                  </div>

                  {/* Bloque de ARL (Descuento de Bruto) */}
                  {res.descuentoSeguridad > 0 && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex justify-between items-center">
                      <div className="flex items-center gap-2.5 text-blue-400">
                        <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/20">
                          <Shield size={14} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest leading-none">Descuento ARL</span>
                          <span className="text-[8px] font-bold text-blue-500/60 uppercase mt-0.5">Saldado en Bruto</span>
                        </div>
                      </div>
                      <span className="font-black text-blue-400 text-sm tracking-tight">−{fmt(res.descuentoSeguridad)}</span>
                    </div>
                  )}

                  {res.descuentoPrestamo > 0 && (
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 space-y-2.5">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 flex items-center gap-2"><CreditCard size={12} className="text-orange-400" />Préstamos</span>
                        <span className="font-bold text-orange-300">−{fmt(res.descuentoPrestamo)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-700/50 flex justify-between text-sm">
                        <span className="text-slate-300 font-black uppercase text-[10px] tracking-widest">Total Descuentos</span>
                        <span className="font-black text-orange-400">−{fmt(res.totalDescuentos)}</span>
                      </div>
                    </div>
                  )}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 shadow-xl shadow-emerald-900/40">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                    <div className="relative flex items-end justify-between">
                      <div>
                        <p className="text-emerald-100 text-[9px] font-black uppercase tracking-widest">Neto a Pagar</p>
                        <p className="text-white text-4xl font-black mt-1 tracking-tight">{fmt(res.neto)}</p>
                        <p className="text-emerald-200 text-xs font-semibold mt-2">{personaEditable.cedula ? `C.C. ${personaEditable.cedula}` : 'Sin cédula'}</p>
                      </div>
                      <div className="bg-white/15 rounded-xl px-3 py-2 text-right">
                        <p className="text-emerald-100 text-[9px] font-bold uppercase">Banco</p>
                        <p className="text-white font-black text-sm mt-0.5">{personaEditable.formaPago}</p>
                      </div>
                    </div>
                  </div>

                  {/* Botón Ver Operaciones */}
                  <button 
                    onClick={() => setMostrarDesglose(!mostrarDesglose)}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border font-black text-[10px] uppercase tracking-widest transition-all ${mostrarDesglose ? 'bg-slate-800 border-slate-600 text-emerald-400' : 'bg-slate-800/40 border-slate-800 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/30'}`}
                  >
                    {mostrarDesglose ? <ChevronUp size={14} /> : <ListTree size={14} />}
                    {mostrarDesglose ? 'Ocultar Operaciones' : 'Ver Operaciones'}
                  </button>

                  {/* Sección Desglose */}
                  {mostrarDesglose && res.operaciones && (
                    <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center gap-2 mb-2">
                        <Calculator size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Desglose Matemático</span>
                      </div>
                      
                      <div className="space-y-3 font-mono text-[11px]">
                        <div className="space-y-1">
                          <p className="text-slate-500 uppercase text-[9px] font-bold tracking-tighter">Turnos:</p>
                          <p className="text-slate-300">{res.operaciones.turnos}</p>
                          {res.subtotalTurnosAdicionales > 0 && <p className="text-slate-300">{res.operaciones.turnosAdicionales}</p>}
                        </div>

                        {res.subtotalHoras > 0 && (
                          <div className="space-y-1">
                            <p className="text-slate-500 uppercase text-[9px] font-bold tracking-tighter">Horas Adicionales:</p>
                            <p className="text-slate-300">{res.operaciones.horas}</p>
                          </div>
                        )}

                        <div className="space-y-1">
                          <p className="text-slate-500 uppercase text-[9px] font-bold tracking-tighter">Total Bruto:</p>
                          <p className="text-slate-300 text-wrap leading-relaxed">{res.operaciones.bruto}</p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-slate-500 uppercase text-[9px] font-bold tracking-tighter">Descuentos:</p>
                          <p className="text-slate-300">{res.operaciones.descuentos}</p>
                        </div>

                        <div className="pt-2 border-t border-slate-800">
                          <p className="text-emerald-500 uppercase text-[9px] font-bold tracking-tighter">Cálculo Final:</p>
                          <p className="text-white font-bold">{res.operaciones.neto}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {form.observaciones && (
                    <p className="text-slate-500 text-xs italic flex items-start gap-2">
                      <AlertCircle size={12} className="shrink-0 mt-0.5 text-slate-600" />{form.observaciones}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              !personaSeleccionada && (
                <div className="bg-slate-900/40 border border-slate-800/60 border-dashed rounded-2xl p-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-4">
                    <Calculator size={28} className="text-slate-600" />
                  </div>
                  <p className="font-bold text-slate-500">Selecciona un trabajador</p>
                  <p className="text-sm text-slate-700 mt-1">El resultado aparecerá aquí</p>
                </div>
              )
            )}

            {/* Resumen global */}
            {historialActivo.length > 0 && (
              <div className={`border rounded-2xl p-5 space-y-4 ${modoClaro ? "bg-white border-gray-200 shadow-sm" : "bg-slate-900/80 border-slate-800"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <BarChart3 size={14} className="text-blue-400" />
                  </div>
                  <h3 className="font-black text-base">Resumen del Periodo</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Trabajadores', value: String(historialActivo.length), color: 'text-white', sub: 'registros' },
                    { label: 'Total Turnos', value: String(totalTurnos), color: 'text-white', sub: 'días' },
                    { label: 'Total Bruto', value: fmt(totalBruto), color: 'text-white', sub: 'antes desc.' },
                    { label: 'Total Neto', value: fmt(totalNeto), color: 'text-emerald-400', sub: 'a pagar' },
                  ].map((s, i) => (
                    <div key={i} className="bg-slate-800/50 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{s.label}</p>
                      <p className={`font-black text-lg mt-1 ${s.color}`}>{s.value}</p>
                      <p className="text-[9px] text-slate-600">{s.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-500/10 border border-emerald-500/15 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Pagado</p>
                    <p className="font-black text-emerald-400 text-base mt-1">{fmt(totalPagado)}</p>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/15 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-yellow-600 uppercase tracking-widest">Pendiente</p>
                    <p className="font-black text-yellow-400 text-base mt-1">{fmt(totalPendiente)}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={sincronizarARLMasivo}
                    disabled={loadingHistorial || historialActivo.length === 0}
                    className="w-full flex items-center justify-center gap-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:text-blue-300 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-900/10"
                    title="Actualizar descuentos de ARL según registros actuales"
                  >
                    <Shield size={16} /> Sincronizar ARL
                  </button>
                  <button onClick={generarPDF} className="w-full flex items-center justify-center gap-2.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-400 hover:text-red-300 px-4 py-3 rounded-xl font-bold text-sm transition-all">
                    <FileText size={16} />Exportar PDF
                  </button>
                  <button onClick={generarExcelDavivienda} className="w-full flex items-center justify-center gap-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 hover:text-emerald-300 px-4 py-3 rounded-xl font-bold text-sm transition-all">
                    <Download size={16} />Excel General
                  </button>

                  {/* Excel Davivienda con preview */}
                  <div className="flex gap-1">
                    <button onClick={generarExcelDavivienda2} className="flex-1 flex items-center justify-center gap-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/25 text-blue-400 hover:text-blue-300 px-3 py-3 rounded-xl font-bold text-sm transition-all">
                      <Download size={15} />Excel Davivienda
                    </button>
                    <button onClick={() => setMostrarPreviewDavivienda(v => !v)}
                      className={`px-3 py-3 rounded-xl border font-bold text-xs transition-all ${mostrarPreviewDavivienda ? 'bg-blue-500/30 border-blue-400 text-blue-300' : 'bg-blue-500/10 border-blue-500/25 text-blue-500 hover:text-blue-300'}`}
                      title="Ver preview">
                      👁
                    </button>
                  </div>

                  {/* Preview Davivienda */}
                  {mostrarPreviewDavivienda && (() => {
                    const pagadosDavi = historialActivo.filter(i => i.estado === 'Pagado' && i.persona.formaPago.toLowerCase() === 'davivienda');
                    const agrupadoDavi = new Map<string, { neto: number; nombre: string; cuenta: string }>();
                    pagadosDavi.forEach(i => {
                      const ced = i.persona.cedula;
                      if (agrupadoDavi.has(ced)) { agrupadoDavi.get(ced)!.neto += i.resultado.neto; }
                      else { agrupadoDavi.set(ced, { neto: i.resultado.neto, nombre: i.persona.nombre, cuenta: i.persona.numeroCuenta || '' }); }
                    });
                    return (
                      <div className="bg-slate-800/60 border border-blue-500/20 rounded-xl p-3 space-y-1.5">
                        <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Preview — {agrupadoDavi.size} personas</p>
                        {agrupadoDavi.size === 0 && <p className="text-slate-600 text-xs font-semibold">Sin pagados Davivienda</p>}
                        {Array.from(agrupadoDavi.values()).map((e, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-white text-[10px] font-bold truncate">{e.nombre}</p>
                              <p className="text-slate-500 text-[9px] font-mono">{e.cuenta || 'Sin cuenta'}</p>
                            </div>
                            <span className="text-emerald-400 font-black text-[10px] shrink-0">{fmt(e.neto)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Excel por banco */}
                  {(() => {
                    const bancosConPagados = [...new Set(historialActivo.filter(i => i.estado === 'Pagado' && i.persona.formaPago.toLowerCase() !== 'davivienda' && i.persona.formaPago.toLowerCase() !== 'efectivo').map(i => i.persona.formaPago))];
                    if (bancosConPagados.length === 0) return null;
                    return (
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Exportar por banco</p>
                        {bancosConPagados.map(banco => {
                          const count = [...new Set(historialActivo.filter(i => i.estado === 'Pagado' && i.persona.formaPago.toLowerCase().trim() === banco.toLowerCase().trim()).map(i => i.persona.cedula))].length;
                          return (
                            <button key={banco} onClick={() => generarExcelPorBanco(banco)}
                              className="w-full flex items-center justify-between gap-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-400 hover:text-teal-300 px-3 py-2.5 rounded-xl font-bold text-xs transition-all">
                              <span className="flex items-center gap-2"><Download size={13} />{banco}</span>
                              <span className="bg-teal-500/20 px-2 py-0.5 rounded-full text-[9px]">{count} pagados</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {historialActivo.some(i => i.estado === 'Pendiente') && (
                    <button onClick={marcarTodoPagado} className="w-full flex items-center justify-center gap-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-400 hover:text-emerald-300 px-4 py-3 rounded-xl font-bold text-sm transition-all">
                      <CheckCircle size={15} />Marcar todo pagado
                    </button>
                  )}
                  
                  <button onClick={reiniciarValoresMasivo} className="w-full flex items-center justify-center gap-2.5 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/25 text-yellow-400 hover:text-yellow-300 px-4 py-3 rounded-xl font-bold text-sm transition-all">
                    <RefreshCw size={15} />Reiniciar valores a cero
                  </button>

                  <button onClick={borrarHistorial} className="w-full flex items-center justify-center gap-2.5 bg-slate-800/60 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 text-slate-500 hover:text-red-400 px-4 py-3 rounded-xl font-bold text-sm transition-all">
                    <Trash2 size={15} />Borrar informe
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabla historial */}
        {historialActivo.length > 0 && (
          <div ref={tablaRef} className={`mt-8 border rounded-2xl overflow-hidden transition-colors duration-300 ${modoClaro ? "bg-white border-gray-200 shadow-sm" : "bg-slate-900/80 border-slate-800"}`}>
            <div className={`px-6 py-5 border-b flex flex-col gap-4 ${modoClaro ? "border-gray-200" : "border-slate-800"}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                  <FileText size={14} className="text-slate-400" />
                </div>
                <div className="flex-1">
                  <h3 className={`font-black ${modoClaro ? "text-slate-800" : "text-white"}`}>
                    {modoInforme === 'privado' ? '🔒 Informe Privado' : 'Informe General de Liquidaciones'}
                  </h3>
                  <p className="text-[10px] text-slate-600 mt-0.5">{obtenerPeriodo()} · {historialActivo.filter(item => {
                    const matchNombre = !filtroHistorial || item.persona.nombre.toLowerCase().includes(filtroHistorial.toLowerCase()) || item.persona.cedula.includes(filtroHistorial);
                    const matchCargo = !filtroCargo || item.persona.cargo === filtroCargo;
                    const matchBanco = !filtroBanco || item.persona.formaPago === filtroBanco;
                    return matchNombre && matchCargo && matchBanco;
                  }).length} de {historialActivo.length} registros · {[...new Set(historialActivo.map((h: any) => h.quincena).filter(Boolean))].length} quincenas</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className={`flex items-center gap-2 flex-1 min-w-40 px-3 py-2 rounded-xl border text-xs transition-all ${modoClaro ? "bg-gray-50 border-gray-200" : "bg-slate-800/60 border-slate-700"}`}>
                  <Search size={12} className="text-slate-500 shrink-0" />
                  <input value={filtroHistorial} onChange={e => setFiltroHistorial(e.target.value)}
                    placeholder="Buscar en informe…"
                    className="flex-1 bg-transparent outline-none font-semibold text-xs placeholder:text-slate-600" />
                  {filtroHistorial && <button onClick={() => setFiltroHistorial('')}><X size={11} className="text-slate-500 hover:text-red-400" /></button>}
                </div>
                <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
                  className={`flex-1 min-w-40 px-3 py-2 rounded-xl border text-xs font-semibold outline-none cursor-pointer transition-all ${modoClaro ? "bg-gray-50 border-gray-200 text-slate-700" : "bg-slate-800/60 border-slate-700 text-slate-300"}`}>
                  <option value="">Todos los parqueaderos</option>
                  {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filtroBanco} onChange={e => setFiltroBanco(e.target.value)}
                  className={`flex-1 min-w-40 px-3 py-2 rounded-xl border text-xs font-semibold outline-none cursor-pointer transition-all ${modoClaro ? "bg-gray-50 border-gray-200 text-slate-700" : "bg-slate-800/60 border-slate-700 text-slate-300"}`}>
                  <option value="">Todos los bancos</option>
                  {[...new Set(historialActivo.map(i => i.persona.formaPago).filter(Boolean))].sort().map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <select value={filtroQuincena}
                  onChange={e => setFiltroQuincena(e.target.value)}
                  className={`flex-1 min-w-40 px-3 py-2 rounded-xl border text-xs font-semibold outline-none cursor-pointer transition-all ${modoClaro ? "bg-gray-50 border-gray-200 text-slate-700" : "bg-slate-800/60 border-slate-700 text-slate-300"}`}>
                  <option value="">Todas las quincenas</option>
                  {[...new Set(historialActivo.map((item: any) => item.quincena).filter(Boolean))].map(q => (
                    <option key={q as string} value={q as string}>{q as string}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${modoClaro ? "border-gray-200" : "border-slate-800"}`}>
                    {['Trabajador','Cédula','Parqueadero','Banco','Turnos','Horas','Bono','Bruto','Aportes','ARL','Neto','Fecha','Estado'].map(h => (
                      <th key={h} className={`px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${modoClaro ? "text-slate-500" : "text-slate-600"}`}>{h}</th>
                    ))}
                    <th className={`px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest sticky right-0 z-10 ${modoClaro ? "text-slate-500 bg-white shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.05)]" : "text-slate-600 bg-slate-900 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.4)]"}`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historialActivo.filter(item => {
                    const matchNombre = !filtroHistorial || item.persona.nombre.toLowerCase().includes(filtroHistorial.toLowerCase()) || item.persona.cedula.includes(filtroHistorial);
                    const matchCargo = !filtroCargo || item.persona.cargo === filtroCargo;
                    const matchQuincena = !filtroQuincena || (item as any).quincena === filtroQuincena;
                    const matchBanco = !filtroBanco || item.persona.formaPago === filtroBanco;
                    return matchNombre && matchCargo && matchQuincena && matchBanco;
                  }).flatMap((item, i) => {
                    const rows = [];
                    rows.push(<tr key={`row-${i}`} className={`border-b transition-colors ${modoClaro ? "border-gray-100 hover:bg-gray-50" : "border-slate-800/60 hover:bg-slate-800/30"}`}>
                      <td className={`px-4 py-3.5 font-bold whitespace-nowrap ${modoClaro ? "text-slate-800" : "text-white"}`}>{item.persona.nombre}</td>
                      <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">{item.persona.cedula || '—'}</td>
                      <td className="px-4 py-3.5"><span className="text-[9px] font-bold text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 whitespace-nowrap">{item.persona.cargo}</span></td>
                      <td className="px-4 py-3.5 text-slate-400">{item.persona.formaPago}</td>
                      <td className="px-4 py-3.5 text-center"><span className="bg-yellow-500/10 text-yellow-400 font-bold px-2 py-0.5 rounded-lg text-xs">{item.form.diasTurno}</span></td>
                      <td className="px-4 py-3.5 text-center"><span className="bg-blue-500/10 text-blue-400 font-bold px-2 py-0.5 rounded-lg text-xs">{item.form.horasAdicionales}</span></td>
                      <td className="px-4 py-3.5 text-center">
                        {item.form.tieneBono && item.form.valorBono > 0 ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="bg-purple-500/10 text-purple-400 font-bold px-2 py-0.5 rounded-lg text-xs">+{fmt(item.form.valorBono)}</span>
                            {item.form.descripcionBono && <span className="text-[9px] text-purple-500/70 font-semibold">{item.form.descripcionBono}</span>}
                          </div>
                        ) : <span className="text-slate-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-slate-300 font-semibold">{fmt(item.resultado.totalBruto)}</td>
                      <td className="px-4 py-3.5 text-orange-400 font-semibold">{item.resultado.descuentoPrestamo > 0 ? `−${fmt(item.resultado.descuentoPrestamo)}` : '—'}</td>
                      <td className="px-4 py-3.5 text-blue-400 font-semibold">{item.resultado.descuentoSeguridad > 0 ? fmt(item.resultado.descuentoSeguridad) : '—'}</td>
                      <td className="px-4 py-3.5 font-black text-emerald-400">{fmt(item.resultado.neto)}</td>
                      <td className="px-4 py-3.5 text-slate-600 text-xs whitespace-nowrap">{item.fecha}</td>
                      <td className="px-4 py-3.5">
                        {item.estado === 'Pagado' ? (
                          <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-black">
                            <CheckCircle size={10} />Pagado
                          </span>
                        ) : (
                          <button onClick={() => cambiarEstado(i)} className="inline-flex items-center gap-1.5 bg-yellow-500/15 hover:bg-emerald-500/15 text-yellow-400 hover:text-emerald-400 border border-yellow-500/20 hover:border-emerald-500/20 px-2.5 py-1 rounded-full text-[10px] font-black transition-all">
                            <Clock size={10} />Pendiente
                          </button>
                        )}
                      </td>
                      {/* Columna sticky de acciones */}
                      <td className={`px-4 py-3.5 sticky right-0 z-10 ${modoClaro ? "bg-white shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.05)]" : "bg-slate-900 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.4)]"}`}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => abrirEditar(i)}
                            className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 border border-amber-500/20 transition-all"
                            title="Editar liquidación"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => eliminarFila(i)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-500 hover:text-red-300 border border-red-500/20 transition-all"
                            title="Eliminar fila"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>);

                    if (editandoIndex === i && formEditar) {
                      rows.push(
                        <tr ref={editRowRef} key={`edit-${i}`} className="bg-slate-800/80 border-b border-amber-500/30">
                          <td colSpan={14} className="px-6 py-5">
                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-4">Editando: {item.persona.nombre}</p>

                            {/* Fila 0: Parqueadero y Banco */}
                            <div className="flex flex-wrap items-end gap-4 mb-4">
                              <div className="flex flex-col gap-1">
                                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Parqueadero</p>
                                <select value={personaEditar?.cargo || ''} onChange={e => setPersonaEditar(prev => prev ? {...prev, cargo: e.target.value} : prev)}
                                  className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs font-bold outline-none focus:border-amber-400 cursor-pointer">
                                  {CARGOS.map(c => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Banco</p>
                                <select value={personaEditar?.formaPago || ''} onChange={e => {
                                  const nuevoBanco = e.target.value;
                                  const trabajadorActual = personasActivas.find(p => p.cedula === personaEditar?.cedula);
                                  const nuevaCuenta = trabajadorActual?.formaPago?.toLowerCase() === nuevoBanco.toLowerCase()
                                    ? (trabajadorActual?.numeroCuenta || '') : '';
                                  setPersonaEditar(prev => prev ? {...prev, formaPago: nuevoBanco, numeroCuenta: nuevaCuenta} : prev);
                                }}
                                  className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs font-bold outline-none focus:border-amber-400 cursor-pointer">
                                  {['Bancolombia','Nequi','Daviplata','Davivienda','BBVA','Banco de Bogotá','Banco Popular','AV Villas','Caja Social','Transferencia','Efectivo'].map(b => <option key={b} value={b} className="bg-slate-800">{b}</option>)}
                                </select>
                                {personaEditar?.numeroCuenta && <p className="text-[9px] text-slate-500 font-mono">{personaEditar.numeroCuenta}</p>}
                                {personaEditar?.formaPago && personaEditar.formaPago !== 'Efectivo' && !personaEditar.numeroCuenta && (
                                  <p className="text-[9px] text-yellow-500 font-semibold">⚠ Sin cuenta</p>
                                )}
                              </div>
                            </div>

                            {/* Divisor */}
                            <div className="border-t border-slate-700 mb-4" />

                            {/* Fila 1: Turnos y horas */}
                            <div className="flex flex-wrap items-end gap-4 mb-4">
                              <div>
                                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Días turno</p>
                                <input type="number" min={0} value={formEditar.diasTurno} onChange={e => setFormEditar(prev => prev ? {...prev, diasTurno: Number(e.target.value)} : prev)}
                                  className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-bold outline-none focus:border-amber-400" />
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Turnos adic.</p>
                                <input type="number" min={0} value={formEditar.turnosAdicionales} onChange={e => setFormEditar(prev => prev ? {...prev, turnosAdicionales: Number(e.target.value)} : prev)}
                                  className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-bold outline-none focus:border-amber-400" />
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">Horas adic.</p>
                                <input type="number" min={0} value={formEditar.horasAdicionales} onChange={e => setFormEditar(prev => prev ? {...prev, horasAdicionales: Number(e.target.value)} : prev)}
                                  className="w-20 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-bold outline-none focus:border-amber-400" />
                              </div>
                            </div>

                            {/* Divisor */}
                            <div className="border-t border-slate-700 mb-4" />

                            {/* Fila 2: Descuentos y bono */}
                            <div className="flex flex-wrap items-start gap-4 mb-4">
                              {/* Seguridad Social */}
                              <div className="flex flex-col gap-1.5">
                                <div onClick={() => setFormEditar(prev => prev ? {...prev, tieneDescuentoSeguridad: !prev.tieneDescuentoSeguridad} : prev)}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all select-none ${formEditar.tieneDescuentoSeguridad ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                                  <Shield size={11} />
                                  <span className="text-[10px] font-black uppercase">Seg. Social</span>
                                  <div className={`w-6 h-3 rounded-full relative transition-colors ml-1 ${formEditar.tieneDescuentoSeguridad ? 'bg-blue-500' : 'bg-slate-600'}`}>
                                    <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full shadow transition-transform ${formEditar.tieneDescuentoSeguridad ? 'translate-x-3' : 'translate-x-0.5'}`} />
                                  </div>
                                </div>
                                {formEditar.tieneDescuentoSeguridad && (
                                  <input type="number" min={0} value={formEditar.valorDescuentoSeguridad} onChange={e => setFormEditar(prev => prev ? {...prev, valorDescuentoSeguridad: Number(e.target.value)} : prev)}
                                    className="w-32 px-2 py-1.5 bg-slate-700 border border-blue-500/40 rounded-lg text-blue-300 text-sm font-bold outline-none focus:border-blue-400" />
                                )}
                              </div>

                              {/* Préstamos */}
                              <div className="flex flex-col gap-1.5">
                                <div onClick={() => setFormEditar(prev => prev ? {...prev, tieneDescuentoPrestamo: !prev.tieneDescuentoPrestamo} : prev)}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all select-none ${formEditar.tieneDescuentoPrestamo ? 'bg-orange-500/15 border-orange-500/30 text-orange-300' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                                  <CreditCard size={11} />
                                  <span className="text-[10px] font-black uppercase">Préstamos</span>
                                  <div className={`w-6 h-3 rounded-full relative transition-colors ml-1 ${formEditar.tieneDescuentoPrestamo ? 'bg-orange-500' : 'bg-slate-600'}`}>
                                    <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full shadow transition-transform ${formEditar.tieneDescuentoPrestamo ? 'translate-x-3' : 'translate-x-0.5'}`} />
                                  </div>
                                </div>
                                {formEditar.tieneDescuentoPrestamo && (
                                  <input type="number" min={0} value={formEditar.valorDescuentoPrestamo} onChange={e => setFormEditar(prev => prev ? {...prev, valorDescuentoPrestamo: Number(e.target.value)} : prev)}
                                    className="w-32 px-2 py-1.5 bg-slate-700 border border-orange-500/40 rounded-lg text-orange-300 text-sm font-bold outline-none focus:border-orange-400" />
                                )}
                              </div>

                              {/* Bono */}
                              <div className="flex flex-col gap-1.5">
                                <div onClick={() => setFormEditar(prev => prev ? {...prev, tieneBono: !prev.tieneBono} : prev)}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all select-none ${formEditar.tieneBono ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                                  <Sparkles size={11} />
                                  <span className="text-[10px] font-black uppercase">Bono</span>
                                  <div className={`w-6 h-3 rounded-full relative transition-colors ml-1 ${formEditar.tieneBono ? 'bg-purple-500' : 'bg-slate-600'}`}>
                                    <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full shadow transition-transform ${formEditar.tieneBono ? 'translate-x-3' : 'translate-x-0.5'}`} />
                                  </div>
                                </div>
                                {formEditar.tieneBono && (
                                  <div className="flex flex-col gap-1">
                                    <input type="number" min={0} value={formEditar.valorBono} onChange={e => setFormEditar(prev => prev ? {...prev, valorBono: Number(e.target.value)} : prev)}
                                      className="w-32 px-2 py-1.5 bg-slate-700 border border-purple-500/40 rounded-lg text-purple-300 text-sm font-bold outline-none focus:border-purple-400" />
                                    <input type="text" placeholder="Descripción…" value={formEditar.descripcionBono} onChange={e => setFormEditar(prev => prev ? {...prev, descripcionBono: e.target.value} : prev)}
                                      className="w-32 px-2 py-1.5 bg-slate-700 border border-purple-500/40 rounded-lg text-purple-300 text-xs font-semibold outline-none focus:border-purple-400 placeholder:text-slate-600" />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Botones */}
                            <div className="flex items-center gap-2">
                              <button onClick={guardarEdicion} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-black text-xs px-4 py-2 rounded-lg transition-all">
                                <CheckCircle size={13} />Guardar
                              </button>
                              <button onClick={cancelarEditar} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-black text-xs px-4 py-2 rounded-lg transition-all">
                                <X size={13} />Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return rows;
                  })}
                </tbody>
                <tfoot>
                  <tr className={`border-t-2 ${modoClaro ? "bg-gray-50 border-gray-200" : "bg-slate-800/60 border-slate-700"}`}>
                    <td colSpan={4} className={`px-4 py-4 font-black text-xs uppercase tracking-widest ${modoClaro ? "text-slate-700" : "text-white"}`}>TOTALES</td>
                    <td className="px-4 py-4 text-center"><span className="bg-yellow-500/20 text-yellow-300 font-black px-2 py-0.5 rounded-lg text-xs">{totalTurnos}</span></td>
                    <td className="px-4 py-4 text-center"><span className="bg-blue-500/20 text-blue-300 font-black px-2 py-0.5 rounded-lg text-xs">{totalHoras}</span></td>
                    <td className="px-4 py-4 text-center"><span className="bg-purple-500/20 text-purple-300 font-black px-2 py-0.5 rounded-lg text-xs">{fmt(historialActivo.reduce((acc, i) => acc + (i.form.tieneBono ? i.form.valorBono : 0), 0))}</span></td>
                    <td className="px-4 py-4 text-slate-200 font-black">{fmt(totalBruto)}</td>
                    <td className="px-4 py-4 text-orange-300 font-black">−{fmt(historialActivo.reduce((acc, i) => acc + i.resultado.descuentoPrestamo, 0))}</td>
                    <td className="px-4 py-4 text-blue-300 font-black">{fmt(historialActivo.reduce((acc, i) => acc + i.resultado.descuentoSeguridad, 0))}</td>
                    <td className="px-4 py-4 text-emerald-300 font-black text-base">{fmt(totalNeto)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
      {/* Modal de Fórmulas y Lógica */}
      {mostrarFormulas && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setMostrarFormulas(false)} />
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200 shadow-2xl">
            <div className="px-10 py-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                  <BookOpen size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight uppercase">Fórmulas y Lógica</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Documentación técnica del sistema</p>
                </div>
              </div>
              <button onClick={() => setMostrarFormulas(false)} className="p-3 hover:bg-slate-800 rounded-2xl transition-all text-slate-400">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-10 overflow-y-auto space-y-12 custom-scrollbar">
              {/* Sección Liquidación */}
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <Calculator size={22} />
                  </div>
                  <h4 className="text-xl font-black text-white uppercase tracking-tight">Liquidación de Nómina</h4>
                </div>
                
                <div className="space-y-6">
                  {/* Cálculo del Bruto */}
                  <div className="bg-slate-800/40 border border-slate-800 rounded-[2.5rem] p-8">
                    <h5 className="text-emerald-400 text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                      <TrendingUp size={14} /> 1. Cálculo del Total Bruto
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Ingresos por Turnos</p>
                          <code className="text-sm text-white font-mono">
                            (Días Turno + Adicionales) × Valor Turno
                          </code>
                          <p className="text-[9px] text-slate-600 mt-2 italic">* El Valor Turno es específico de cada trabajador.</p>
                        </div>
                        <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Ingresos por Horas</p>
                          <code className="text-sm text-white font-mono">
                            Horas Extras × Valor Hora
                          </code>
                          <p className="text-[9px] text-slate-600 mt-2 italic">* Valor Hora = Valor específico del trabajador.</p>
                        </div>
                      </div>
                      <div className="flex flex-col justify-center">
                        <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-3xl">
                          <p className="text-sm font-black text-white mb-2 uppercase tracking-tight">Fórmula Total Bruto:</p>
                          <p className="text-lg font-black text-emerald-400 font-mono">
                            Σ(Turnos) + Σ(Horas) + Bono + ARL
                          </p>
                          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                            El <span className="text-white font-bold">Bono</span> y la <span className="text-white font-bold">ARL</span> se suman al total para obtener el saldo bruto.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cálculo del Neto */}
                  <div className="bg-slate-800/40 border border-slate-800 rounded-[2.5rem] p-8">
                    <h5 className="text-rose-400 text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                      <MinusCircle size={14} /> 2. Cálculo del Total Neto
                    </h5>
                    <div className="p-6 bg-slate-900/50 rounded-3xl border border-slate-800">
                      <p className="text-xl font-black text-white font-mono text-center">
                        Neto = Total Bruto - ARL - Préstamos
                      </p>
                      <div className="mt-6 p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                        <p className="text-[11px] text-slate-400 leading-relaxed text-center">
                          Siguiendo tu fórmula, el <span className="text-white font-bold">ARL</span> se incluye en el bruto pero se descuenta para llegar al valor neto a pagar.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Sección ARL */}
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Shield size={22} />
                  </div>
                  <h4 className="text-xl font-black text-white uppercase tracking-tight">Detalle de Seguridad Social (ARL)</h4>
                </div>
                <div className="p-8 bg-blue-500/5 border border-blue-500/10 rounded-[3rem] space-y-6">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    El sistema automatiza el prorrateo de la ARL basado en el historial de movimientos (Ingresos/Retiros) del trabajador.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800">
                      <p className="text-[9px] font-black text-blue-400 uppercase mb-2">Costo Mensual (Base)</p>
                      <p className="text-2xl font-black text-white">$76.200</p>
                    </div>
                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800">
                      <p className="text-[9px] font-black text-blue-400 uppercase mb-2">Días Trabajados</p>
                      <p className="text-2xl font-black text-white">X Días</p>
                    </div>
                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800">
                      <p className="text-[9px] font-black text-blue-400 uppercase mb-2">Fórmula de Cobro</p>
                      <p className="text-lg font-black text-white">(76.200 / 30) × X</p>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/50">
                    <p className="text-[11px] text-slate-400 italic">
                      * El sistema considera un <span className="text-white font-bold">Mes Comercial de 30 días</span>. Si un trabajador labora los 31 días de marzo, el cobro se ajusta automáticamente al tope de 30 días.
                    </p>
                  </div>
                </div>
              </section>

            </div>
            
            <div className="p-8 bg-slate-950/50 border-t border-slate-800 flex justify-center">
              <button 
                onClick={() => setMostrarFormulas(false)}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/20"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
