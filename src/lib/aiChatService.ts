import { supabase } from '@/lib/supabase';
import { supabaseRemesas } from '@/lib/supabaseRemesas';
import { calcularDescuentoARLPila } from '@/utils/calcularDescuentoARL';

export interface ChatAction {
  label: string;
  tipo: 'COPIAR' | 'CONSULTAR_DETALLE' | 'CALCULAR_TURNO' | 'MODIFICAR_DATO' | 'DESPLAZAR_TABLA' | 'EDITAR_EN_TABLA' | 'LIQUIDAR_TRABAJADOR' | 'PAGO_MASIVO' | 'APLICAR_FILTROS' | 'CREAR_TRABAJADOR' | 'ELIMINAR_DE_NOMINA' | 'MODIFICAR_TURNOS' | 'NAVEGAR_RUTA';
  payload?: any;
}

export interface ChatContext {
  ultimoTrabajador?: any;
  campoPendiente?: {
    campo: string;
    campoLabel: string;
    valorNuevo: any;
  };
  liquidandoPendiente?: {
    trabajador: any;
  };
  eliminandoPendiente?: {
    historialId: string;
    nombre: string;
    cedula?: string;
  };
}

export interface ChatResponse {
  text: string;
  acciones?: ChatAction[];
  nuevoContexto?: ChatContext;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  acciones?: ChatAction[];
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

export async function executeUpdateTrabajador(payload: {
  trabajadorId: string;
  campo: string;
  valorNuevo: any;
  nombre: string;
  campoLabel?: string;
  cedulaAnterior?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Actualizar en trabajadores
    const { error } = await supabase
      .from('trabajadores')
      .update({ [payload.campo]: payload.valorNuevo })
      .eq('id', payload.trabajadorId);

    if (error) {
      return {
        success: false,
        message: `❌ Error al actualizar en Supabase: ${error.message}`
      };
    }

    // 2. Sincronizar en historial_liquidaciones si la persona ya está en el cuadro de nómina
    try {
      const { data: histRows } = await supabase.from('historial_liquidaciones').select('*');
      if (histRows && histRows.length > 0) {
        for (const row of histRows) {
          const matchCedula = payload.cedulaAnterior && String(row.persona?.cedula || '').trim() === String(payload.cedulaAnterior).trim();
          const matchNombre = String(row.persona?.nombre || '').toLowerCase().trim() === payload.nombre.toLowerCase().trim();
          if (matchCedula || matchNombre) {
            const updatedPersona = { ...row.persona };
            if (payload.campo === 'numero_cuenta') {
              updatedPersona.numeroCuenta = payload.valorNuevo;
            } else if (payload.campo === 'cedula') {
              updatedPersona.cedula = payload.valorNuevo;
            } else if (payload.campo === 'forma_pago') {
              updatedPersona.formaPago = payload.valorNuevo;
            } else if (payload.campo === 'cargo') {
              updatedPersona.cargo = payload.valorNuevo;
            } else if (payload.campo === 'valor_turno') {
              updatedPersona.valorTurno = payload.valorNuevo;
            } else if (payload.campo === 'valor_hora_adicional') {
              updatedPersona.valorHoraAdicional = payload.valorNuevo;
            }

            await supabase
              .from('historial_liquidaciones')
              .update({ persona: updatedPersona })
              .eq('id', row.id);
          }
        }
      }
    } catch (errSync) {
      console.warn('Sincronización secundaria en historial_liquidaciones:', errSync);
    }

    // 3. Notificar a las pantallas activas para recargar datos y enfocar la fila
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fundamiga:recargar-datos'));
      window.dispatchEvent(new CustomEvent('fundamiga:desplazar-a-trabajador', {
        detail: {
          cedula: payload.campo === 'cedula' ? payload.valorNuevo : payload.cedulaAnterior,
          nombre: payload.nombre
        }
      }));
    }

    const valorMostrar = typeof payload.valorNuevo === 'number'
      ? fmt(payload.valorNuevo)
      : `\`${payload.valorNuevo}\``;

    return {
      success: true,
      message: `✅ **¡Dato actualizado exitosamente en Supabase!**\n\n` +
        `• 👤 **Trabajador**: **${payload.nombre}**\n` +
        `• 🔄 **${payload.campoLabel || payload.campo}**: Guardado como ${valorMostrar}.\n` +
        `• 📋 *Tanto la base de datos como el cuadro de nómina se han sincronizado en vivo.*`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `❌ Error de red o conexión: ${err?.message || 'Error desconocido'}`
    };
  }
}

export const obtenerPeriodo = () => {
  const f = new Date();
  const dia = f.getDate();
  const mes = f.toLocaleString('es-CO', { month: 'long' });
  const año = f.getFullYear();
  return `${dia <= 15 ? '1ra' : '2da'} Quincena - ${mes.charAt(0).toUpperCase() + mes.slice(1)} ${año}`;
};

export async function executeLiquidacionDirecta(payload: {
  persona: {
    nombre: string;
    cedula: string;
    cargo: string;
    valorTurno: number;
    valorHoraAdicional: number;
    formaPago: string;
    numeroCuenta?: string;
  };
  diasTurno: number;
  turnosAdicionales?: number;
  horasAdicionales?: number;
  tieneBono?: boolean;
  valorBono?: number;
  descripcionBono?: string;
  tieneDescuentoPrestamo?: boolean;
  valorDescuentoPrestamo?: number;
}): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const p = payload.persona;
    const diasTurno = Number(payload.diasTurno) || 0;
    const turnosAdicionales = Number(payload.turnosAdicionales) || 0;
    const horasAdicionales = Number(payload.horasAdicionales) || 0;
    const tieneBono = Boolean(payload.tieneBono);
    const valorBono = Number(payload.valorBono) || 0;
    const tieneDescuentoPrestamo = Boolean(payload.tieneDescuentoPrestamo);
    const valorDescuentoPrestamo = Number(payload.valorDescuentoPrestamo) || 0;

    const valorDescuentoSeguridad = calcularDescuentoARLPila(diasTurno);
    const tieneDescuentoSeguridad = diasTurno > 0;

    const subtotalTurnos = diasTurno * (p.valorTurno || 0);
    const subtotalTurnosAdicionales = turnosAdicionales * (p.valorTurno || 0);
    const subtotalHoras = horasAdicionales * (p.valorHoraAdicional || 0);
    const bono = tieneBono ? valorBono : 0;
    const descuentoSeguridad = tieneDescuentoSeguridad ? valorDescuentoSeguridad : 0;
    const descuentoPrestamo = tieneDescuentoPrestamo ? valorDescuentoPrestamo : 0;

    const totalBruto = subtotalTurnos + subtotalTurnosAdicionales + subtotalHoras + bono + descuentoSeguridad;
    const totalDescuentos = descuentoSeguridad + descuentoPrestamo;
    const neto = Math.max(0, totalBruto - totalDescuentos);

    const fmtOp = (n: number) => n.toLocaleString('es-CO');

    const resultado = {
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
        turnos: `${diasTurno} días × ${fmtOp(p.valorTurno)} = ${fmtOp(subtotalTurnos)}`,
        turnosAdicionales: `${turnosAdicionales} turnos × ${fmtOp(p.valorTurno)} = ${fmtOp(subtotalTurnosAdicionales)}`,
        horas: `${horasAdicionales} horas × ${fmtOp(p.valorHoraAdicional)} = ${fmtOp(subtotalHoras)}`,
        bruto: `${fmtOp(subtotalTurnos)} + ${fmtOp(subtotalTurnosAdicionales)} + ${fmtOp(subtotalHoras)} + ${fmtOp(bono)} + ${fmtOp(descuentoSeguridad)} = ${fmtOp(totalBruto)}`,
        descuentos: `${fmtOp(descuentoSeguridad)} (ARL) + ${fmtOp(descuentoPrestamo)} (Aportes) = ${fmtOp(totalDescuentos)}`,
        neto: `${fmtOp(totalBruto)} (Bruto) − ${fmtOp(totalDescuentos)} (Descuentos) = ${fmtOp(neto)}`
      }
    };

    const form = {
      diasTurno,
      turnosAdicionales,
      horasAdicionales,
      tieneDescuentoSeguridad,
      valorDescuentoSeguridad,
      tieneDescuentoPrestamo,
      valorDescuentoPrestamo,
      tieneBono,
      valorBono,
      descripcionBono: payload.descripcionBono || '',
      observaciones: 'Liquidado vía Asistente IA'
    };

    const id = Date.now().toString();
    const fecha = new Date().toLocaleString('es-CO');
    const quincena = obtenerPeriodo();

    const { error } = await supabase.from('historial_liquidaciones').insert({
      id,
      persona: {
        nombre: p.nombre,
        cedula: p.cedula,
        cargo: p.cargo,
        valorTurno: p.valorTurno,
        valorHoraAdicional: p.valorHoraAdicional,
        formaPago: p.formaPago,
        numeroCuenta: p.numeroCuenta || ''
      },
      form,
      resultado,
      fecha,
      estado: 'Pendiente',
      quincena
    });

    if (error) {
      return { success: false, message: `❌ Error al guardar liquidación en Supabase: ${error.message}` };
    }

    return {
      success: true,
      message: `🎉 **¡Liquidación registrada exitosamente!**\n\n` +
        `👤 **${p.nombre}** (C.C. \`${p.cedula}\`)\n` +
        `• 📅 Turnos: **${diasTurno} días** ${horasAdicionales > 0 ? `| Horas: ${horasAdicionales} hrs` : ''}\n` +
        `• 💰 Neto a pagar: **${fmt(neto)}** (⏳ Pendiente)\n` +
        `• 💳 Forma de pago: ${p.formaPago} (${p.numeroCuenta || 'Sin cuenta'})\n\n` +
        `*El cuadro de nómina se ha actualizado en tiempo real.*`,
      id
    };
  } catch (err: any) {
    return { success: false, message: `❌ Error inesperado: ${err?.message || 'Error de conexión'}` };
  }
}

export async function executePagoMasivo(payload: {
  tipoFiltro: 'banco' | 'cargo' | 'todos';
  valorFiltro?: string;
}): Promise<{ success: boolean; message: string; actualizados: number }> {
  try {
    const { data: historial, error: errFetch } = await supabase
      .from('historial_liquidaciones')
      .select('*')
      .eq('estado', 'Pendiente');

    if (errFetch || !historial) {
      return { success: false, message: `❌ Error al consultar pendientes: ${errFetch?.message}`, actualizados: 0 };
    }

    let aActualizar = historial;
    if (payload.tipoFiltro === 'banco' && payload.valorFiltro) {
      aActualizar = historial.filter(h =>
        (h.persona?.formaPago || '').toLowerCase().includes(payload.valorFiltro!.toLowerCase())
      );
    } else if (payload.tipoFiltro === 'cargo' && payload.valorFiltro) {
      aActualizar = historial.filter(h =>
        (h.persona?.cargo || '').toLowerCase().includes(payload.valorFiltro!.toLowerCase())
      );
    }

    if (aActualizar.length === 0) {
      return { success: true, message: `ℹ️ No se encontraron trabajadores con pagos pendientes para el filtro seleccionado.`, actualizados: 0 };
    }

    const ids = aActualizar.map(h => h.id);
    const { error: errUpdate } = await supabase
      .from('historial_liquidaciones')
      .update({ estado: 'Pagado' })
      .in('id', ids);

    if (errUpdate) {
      return { success: false, message: `❌ Error al actualizar en Supabase: ${errUpdate.message}`, actualizados: 0 };
    }

    return {
      success: true,
      message: `🎉 **¡Pago masivo completado con éxito!**\n\n` +
        `Se marcaron como **✅ Pagados** a **${ids.length} trabajador(es)**` +
        (payload.valorFiltro ? ` de **${payload.valorFiltro}**` : '') + `.\n` +
        `*El cuadro de nómina se ha sincronizado en vivo.*`,
      actualizados: ids.length
    };
  } catch (err: any) {
    return { success: false, message: `❌ Error inesperado: ${err?.message || 'Error al procesar'}`, actualizados: 0 };
  }
}

export async function executeCrearTrabajador(payload: {
  nombre: string;
  cedula?: string;
  cargo?: string;
  valor_turno?: number;
  valor_hora_adicional?: number;
  forma_pago?: string;
  numero_cuenta?: string;
}): Promise<{ success: boolean; message: string; trabajador?: any }> {
  try {
    const valorTurno = Number(payload.valor_turno) || 35000;
    const valorHora = Number(payload.valor_hora_adicional) || Math.round(valorTurno / 8);

    const nuevoTrabajador = {
      nombre: payload.nombre.trim(),
      cedula: payload.cedula ? String(payload.cedula).trim() : '',
      cargo: payload.cargo || 'General',
      valor_turno: valorTurno,
      valor_hora_adicional: valorHora,
      forma_pago: payload.forma_pago || 'Efectivo',
      numero_cuenta: payload.numero_cuenta ? String(payload.numero_cuenta).trim() : ''
    };

    const { data, error } = await supabase
      .from('trabajadores')
      .insert(nuevoTrabajador)
      .select()
      .single();

    if (error) {
      return { success: false, message: `❌ Error al crear trabajador en Supabase: ${error.message}` };
    }

    return {
      success: true,
      message: `🎉 **¡Trabajador registrado exitosamente en la base de datos!**\n\n` +
        `• 👤 **Nombre**: **${nuevoTrabajador.nombre}**\n` +
        `• 🆔 **Cédula**: \`${nuevoTrabajador.cedula || 'Sin registrar'}\`\n` +
        `• 🏢 **Parqueadero**: ${nuevoTrabajador.cargo}\n` +
        `• 💰 **Valor Turno**: ${fmt(valorTurno)} | Hora Extra: ${fmt(valorHora)}\n` +
        `• 💳 **Forma de Pago**: ${nuevoTrabajador.forma_pago} (${nuevoTrabajador.numero_cuenta || 'Sin cuenta'})\n\n` +
        `*Ya está disponible para ser liquidado en el cuadro de nómina.*`,
      trabajador: data
    };
  } catch (err: any) {
    return { success: false, message: `❌ Error inesperado: ${err?.message || 'Error de conexión'}` };
  }
}

export async function executeEliminarDeNomina(payload: {
  historialId: string;
  nombre: string;
  cedula?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from('historial_liquidaciones')
      .delete()
      .eq('id', payload.historialId);

    if (error) {
      return {
        success: false,
        message: `❌ Error al eliminar de la nómina en Supabase: ${error.message}`
      };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fundamiga:recargar-datos'));
    }

    return {
      success: true,
      message: `🗑️ **¡${payload.nombre} ha sido eliminado(a) de la tabla de nómina con éxito!**\n\n` +
        `• 👤 **Trabajador**: ${payload.nombre}\n` +
        (payload.cedula ? `• 🆔 **Cédula**: \`${payload.cedula}\`\n` : '') +
        `• 🔄 *El cuadro de nómina y los totales se han recalculado automáticamente.*`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `❌ Error inesperado al eliminar: ${err?.message || 'Error de conexión'}`
    };
  }
}

export async function executeModificarTurnosLiquidacion(payload: {
  historialId: string;
  nombre: string;
  cedula?: string;
  nuevosDias: number;
}): Promise<{ success: boolean; message: string; nuevoNeto?: number }> {
  try {
    const { data: row, error: fetchErr } = await supabase
      .from('historial_liquidaciones')
      .select('*')
      .eq('id', payload.historialId)
      .single();

    if (fetchErr || !row) {
      return { success: false, message: `❌ No se encontró la liquidación en Supabase: ${fetchErr?.message || ''}` };
    }

    const p = row.persona || {};
    const f = row.form || {};
    const valorTurno = Number(p.valorTurno) || 0;
    const valorHora = Number(p.valorHoraAdicional) || 0;
    const nuevosDias = Number(payload.nuevosDias) || 0;
    const horasAdicionales = Number(f.horasAdicionales) || 0;
    const bono = Number(f.bono) || 0;
    const valorDescuentoPrestamo = Number(f.valorDescuentoPrestamo) || 0;
    const tieneDescuentoPrestamo = valorDescuentoPrestamo > 0;

    const tieneDescuentoSeguridad = nuevosDias > 0 && !row.sinARL;
    const valorDescuentoSeguridad = tieneDescuentoSeguridad ? calcularDescuentoARLPila(nuevosDias) : 0;

    const subtotalTurnos = nuevosDias * valorTurno;
    const subtotalHoras = horasAdicionales * valorHora;
    const totalDevengado = subtotalTurnos + subtotalHoras + bono + (tieneDescuentoSeguridad ? valorDescuentoSeguridad : 0);
    const totalDeducciones = (tieneDescuentoSeguridad ? valorDescuentoSeguridad : 0) + (tieneDescuentoPrestamo ? valorDescuentoPrestamo : 0);
    const neto = totalDevengado - totalDeducciones;

    const updatedForm = {
      ...f,
      diasTurno: nuevosDias,
      turnos: nuevosDias
    };

    const updatedResultado = {
      ...row.resultado,
      subtotalTurnos,
      totalDevengado,
      totalDeducciones,
      descuentoSeguridad: valorDescuentoSeguridad,
      neto,
      detalle: {
        ...(row.resultado?.detalle || {}),
        turnos: `${nuevosDias} días × ${fmt(valorTurno)} = ${fmt(subtotalTurnos)}`
      }
    };

    const { error: updateErr } = await supabase
      .from('historial_liquidaciones')
      .update({
        form: updatedForm,
        resultado: updatedResultado
      })
      .eq('id', payload.historialId);

    if (updateErr) {
      return { success: false, message: `❌ Error al actualizar turnos en Supabase: ${updateErr.message}` };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fundamiga:recargar-datos'));
      window.dispatchEvent(new CustomEvent('fundamiga:desplazar-a-trabajador', {
        detail: { cedula: payload.cedula, nombre: payload.nombre }
      }));
    }

    return {
      success: true,
      message: `✅ **¡Turnos actualizados exitosamente en la nómina!**\n\n` +
        `• 👤 **Trabajador**: **${payload.nombre}**\n` +
        `• 📅 **Días actualizados**: **${nuevosDias} turnos** (${fmt(valorTurno)} c/u)\n` +
        `• 💰 **Nuevo Neto a Pagar**: **${fmt(neto)}**\n` +
        `• 🔄 *El cuadro de nómina y los totales se han sincronizado en vivo.*`,
      nuevoNeto: neto
    };
  } catch (err: any) {
    return { success: false, message: `❌ Error inesperado: ${err?.message || 'Error de conexión'}` };
  }
}

export async function processAIChatMessage(message: string, context?: ChatContext): Promise<ChatResponse> {
  const cleanMsg = message.trim();
  if (!cleanMsg) return { text: 'Por favor escribe una consulta válida.' };

  // 1. Intentar conectar con un Asistente IA Local si está disponible
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch('http://localhost:3500/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: cleanMsg }),
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.response) {
        return { text: data.response };
      }
    }
  } catch {
    // Continuar con el motor inteligente integrado
  }

  // 2. Motor Inteligente Directo con Base de Datos Fundamiga
  return await processFundamigaQuery(cleanMsg, context);
}

async function processFundamigaQuery(query: string, context?: ChatContext): Promise<ChatResponse> {
  let q = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¨´`^~¿?¡!.,:;_"*()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Corrección inteligente de dedazos y variaciones ortográficas frecuentes
  q = q
    .replace(/\b(aparquederos?|parquaderos?|parquederos?|paqueaderos?|parqeaderos?)\b/g, 'parqueadero')
    .replace(/\b(cuneta|cuetna|cuentaa|cunta|cueta)\b/g, 'cuenta')
    .replace(/\b(cedulaa|celuda|cedla|cdeula|sedula)\b/g, 'cedula')
    .replace(/\b(perdro)\b/g, 'pedro')
    .replace(/\b(quienen|quiene|quieness|kien|kienes|kienen)\b/g, 'quienes')
    .replace(/\b(perosnas|pesonas|personass|pesona|personad|perosna|persoas)\b/g, 'personas')
    .replace(/\b(trabajadore|trabajadorse|trabajadoers)\b/g, 'trabajadores')
    .replace(/\b(nominaa|nmina|monina|nomnia)\b/g, 'nomina')
    .replace(/\b(tabal|tbala|tavla)\b/g, 'tabla')
    .replace(/\b(cuadroo|cudaros?|cuadroa)\b/g, 'cuadro')
    .replace(/\b(cuant[ao]ss?|cuantoa|cuntos|cuatas)\b/g, 'cuantos')
    .replace(/\b5\s*-\s*6\b/g, '5 - 6')
    .replace(/\b6\s*-\s*6\b/g, '6 - 6')
    .replace(/\b2\s*-\s*10\b/g, '2 - 10');

  // ── 0. SALUDOS Y PRESENTACIÓN ───────────────────────────────────────────────
  const esSaludo = /^(hola|buenos\s*dias|buenas\s*tardes|buenas\s*noches|saludos|que\s*tal|buenas|hi|hello)\b/i.test(q);
  if (esSaludo || q === 'hola' || q === 'ayuda' || q === 'que puedes hacer') {
    return {
      text: `👋 **¡Hola! Soy tu Asistente Fundamiga.**\n\n` +
        `Puedo ayudarte a consultar información operativa en tiempo real:\n\n` +
        `• 👤 **Personal**: Busca trabajadores por nombre, cédula o parqueadero para ver sus datos bancarios y valor de turno.\n` +
        `• 💰 **Nómina**: Consulta el resumen de liquidaciones, totales y estado de pagos.\n` +
        `• 🛡️ **Seguridad Social / ARL**: Información sobre días cotizados y descuentos PILA.\n` +
        `• 🚚 **Remesas**: Movimientos y personal asignado.\n` +
        `• 🧮 **Cálculos**: Pregúntame cómo se calculan turnos, horas extra o préstamos.\n\n` +
        `*Prueba escribiendo un nombre (ej: "carlos"), "resumen nomina" o selecciona un botón rápido arriba.*`
    };
  }

  // ── -0.1 CREAR / AGREGAR NUEVO TRABAJADOR A LA BASE DE DATOS ───────────────
  const esParaNomina = q.includes('nomina') || q.includes('cuadro') || q.includes('tabla') || q.includes('liquidar') || Boolean(context?.liquidandoPendiente);
  const esIntentoCrearTrabajador = !esParaNomina && (
    /\b(agrega|agregar|crea|crear|registra|registrar|anade|anadir|inserta|insertar)\b.*?\b(nuevo\s*(?:trabajador|empleado|persona)|trabajador\s*nuevo)\b/i.test(q) ||
    /\b(nuevo\s*(?:trabajador|empleado|persona)|crear\s*(?:un\s*)?trabajador|registrar\s*(?:un\s*)?trabajador)\b/i.test(q) ||
    (q.includes('nuevo trabajador') || q.includes('crear trabajador') || q.includes('nuevo empleado'))
  );

  if (esIntentoCrearTrabajador) {
    // Verificar si proporcionó detalles para crearlo directamente
    const matchCedula = q.match(/(?:cedula|cc|documento)(?:\s*(?:a|por|en|de|=|:))?\s*([0-9]{6,12})/i) || q.match(/\b([0-9]{7,11})\b/);
    const cedulaExtraida = matchCedula ? matchCedula[1] : '';

    const cargosDisponiblesCrear = [
      'CONTRATISTAS DE ADMINISTRACION', '5 - 6', '6 - 6', 'CARTON C', 'GUACANDA',
      'TERCERA', 'ROZO', '2 - 10', 'MAYORISTA', 'GUABINAS', 'BOLIVAR', 'REMESAS'
    ];
    const cargoMatch = cargosDisponiblesCrear.find(c => q.includes(c.toLowerCase()));

    const numMatchTurno = q.match(/(?:turno|tarifa|diario)(?:\s*(?:de|=|:))?\s*(?:\$|\b)([0-9]{2,3}(?:[.,][0-9]{3})+|[0-9]{4,6})\b/i);
    const turnoExtraido = numMatchTurno ? parseInt(numMatchTurno[1].replace(/[.,]/g, ''), 10) : 35000;

    const mapaBancosCrear: Record<string, string> = {
      'bancolombia': 'Bancolombia', 'nequi': 'Nequi', 'daviplata': 'Daviplata', 'davivienda': 'Davivienda',
      'av villas': 'AV Villas', 'villas': 'AV Villas', 'bbva': 'BBVA', 'bogota': 'Banco de Bogotá',
      'popular': 'Banco Popular', 'caja social': 'Caja Social', 'efectivo': 'Efectivo'
    };
    const bancoMatchKey = Object.keys(mapaBancosCrear).find(b => q.includes(b));
    const bancoExtraido = bancoMatchKey ? mapaBancosCrear[bancoMatchKey] : 'Efectivo';

    const matchCuenta = q.match(/(?:cuenta|cta|cuneta|no\.?)(?:\s*(?:a|por|en|de|=|:))?\s*([0-9]{7,25})/i);
    const cuentaExtraida = matchCuenta ? matchCuenta[1] : '';

    // Extraer nombre ignorando palabras de comando y datos
    const palabrasIgnorarNombre = new Set([
      'agrega', 'agregar', 'crea', 'crear', 'registra', 'registrar', 'anade', 'anadir',
      'un', 'una', 'el', 'la', 'los', 'las', 'nuevo', 'nueva', 'trabajador', 'empleado', 'persona',
      'a', 'al', 'de', 'del', 'con', 'en', 'por', 'cedula', 'cc', 'documento', 'parqueadero', 'cargo',
      'turno', 'tarifa', 'cuenta', 'cta', 'cuneta', 'banco', 'dime', 'porfa', 'favor',
      ...(cargoMatch ? cargoMatch.toLowerCase().split(/\s+/) : []),
      ...(bancoMatchKey ? [bancoMatchKey] : [])
    ]);

    const tokensNombre = q.split(/\s+/).filter(w => w.length >= 3 && !palabrasIgnorarNombre.has(w) && !/^\d+$/.test(w));

    // Si proporcionó un nombre para crearlo de una vez
    if (tokensNombre.length > 0 && (cargoMatch || cedulaExtraida || tokensNombre.length >= 2)) {
      const nombreCapitalizado = tokensNombre.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      return {
        text: `📝 **Solicitud de Registro de Nuevo Trabajador**:\n\n` +
          `• 👤 **Nombre**: **${nombreCapitalizado}**\n` +
          `• 🆔 **Cédula**: \`${cedulaExtraida || 'Pendiente'}\`\n` +
          `• 🏢 **Parqueadero**: ${cargoMatch || 'General'}\n` +
          `• 💰 **Valor Turno**: ${fmt(turnoExtraido)} | Hora Extra: ${fmt(Math.round(turnoExtraido / 8))}\n` +
          `• 💳 **Forma de Pago**: ${bancoExtraido} (${cuentaExtraida || 'Sin cuenta'})\n\n` +
          `¿Deseas guardar a **${nombreCapitalizado}** en la base de datos de trabajadores de Fundamiga?`,
        acciones: [
          {
            label: `⚡ Crear a ${tokensNombre[0]} en Supabase`,
            tipo: 'CREAR_TRABAJADOR',
            payload: {
              nombre: nombreCapitalizado,
              cedula: cedulaExtraida,
              cargo: cargoMatch || 'General',
              valor_turno: turnoExtraido,
              valor_hora_adicional: Math.round(turnoExtraido / 8),
              forma_pago: bancoExtraido,
              numero_cuenta: cuentaExtraida
            }
          },
          {
            label: `🌐 Ir a Gestión de Trabajadores (/admin)`,
            tipo: 'NAVEGAR_RUTA',
            payload: '/admin'
          }
        ]
      };
    }

    // Si fue solo "agrega un nuevo trabajador" sin datos
    return {
      text: `👤 **Registro de Nuevo Trabajador en Fundamiga**:\n\n` +
        `Puedes registrar a un nuevo trabajador de dos formas sencillas:\n\n` +
        `1️⃣ **Directamente por este chat**: Escribe por ejemplo:\n` +
        `• *"Crea a Carlos Mario Gómez, cédula 1005234567, parqueadero Guabinas, turno 40000"*\n` +
        `• *"Agrega al trabajador Pedro Pérez, cédula 98765432, parqueadero 5 - 6, Bancolombia cuenta 12345678"*\n\n` +
        `2️⃣ **En el panel de administración**: Puedes abrir el formulario completo con un clic en el botón de abajo.`,
      acciones: [
        {
          label: `🌐 Ir a Formulario de Nuevo Trabajador (/admin)`,
          tipo: 'NAVEGAR_RUTA',
          payload: '/admin'
        }
      ]
    };
  }

  // ── 0.00 ELIMINAR TRABAJADOR DE LA TABLA DE NÓMINA (HISTORIAL) ───────────
  const verbosEliminar = /\b(elimina|eliminar|eliminame|borra|borrar|borrame|quita|quitar|quitame|saca|sacar|sacame)\b/i;
  const esIntentoEliminar = !q.includes('filtro') && (
    (verbosEliminar.test(q) && (
      q.includes('tabla') ||
      q.includes('cuadro') ||
      q.includes('nomina') ||
      q.includes('persona') ||
      q.includes('trabajador') ||
      q.includes('fila') ||
      q.includes('esa persona') ||
      q.includes('este trabajador') ||
      q.includes('eliminalo') ||
      q.includes('eliminala') ||
      q.includes('borralo') ||
      q.includes('borrala') ||
      q.includes('quitalo') ||
      q.includes('quitala') ||
      q.includes('sacalo') ||
      q.includes('sacala') ||
      Boolean(context?.ultimoTrabajador)
    )) ||
    q.includes('elimina esa persona') ||
    q.includes('borra esa persona') ||
    q.includes('quita esa persona') ||
    q.includes('saca esa persona') ||
    q.includes('eliminar persona')
  );

  if (esIntentoEliminar) {
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');
    const { data: todosTrabajadores } = await supabase.from('trabajadores').select('*');

    const palabrasControlEliminar = new Set([
      'elimina', 'eliminar', 'eliminame', 'borra', 'borrar', 'borrame', 'quita', 'quitar', 'quitame',
      'saca', 'sacar', 'sacame', 'a', 'al', 'de', 'del', 'la', 'el', 'los', 'las', 'esa', 'ese',
      'este', 'esta', 'persona', 'trabajador', 'empleado', 'fila', 'tabla', 'cuadro', 'nomina',
      'porfa', 'favor', 'tambien', 'en'
    ]);

    const tokensNombre = q.split(/\s+/).filter(w => w.length >= 3 && !palabrasControlEliminar.has(w) && !/^\d+$/.test(w));
    const matchCedula = q.match(/\b([0-9]{6,12})\b/);
    const cedulaBusqueda = matchCedula ? matchCedula[1] : null;

    let rowEncontrada: any = null;

    if (cedulaBusqueda) {
      rowEncontrada = (historial || []).find(h => String(h.persona?.cedula || '').trim() === cedulaBusqueda);
    }

    if (!rowEncontrada && tokensNombre.length > 0) {
      let mejorScore = 0;
      for (const h of (historial || [])) {
        const nom = String(h.persona?.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let score = 0;
        if (tokensNombre.every(tk => nom.includes(tk))) {
          score = 100 + tokensNombre.length * 10;
        } else {
          for (const tk of tokensNombre) {
            if (nom.includes(tk)) score += 20;
          }
        }
        if (score > mejorScore && score >= 20) {
          mejorScore = score;
          rowEncontrada = h;
        }
      }
    }

    // Si no encontró por tokens o no se ingresó nombre específico, recurrir a context?.ultimoTrabajador
    if (!rowEncontrada && context?.ultimoTrabajador) {
      const cedCtx = String(context.ultimoTrabajador.cedula || '').trim();
      const nomCtx = String(context.ultimoTrabajador.nombre || '').toLowerCase().trim();
      rowEncontrada = (historial || []).find(h => 
        (cedCtx && String(h.persona?.cedula || '').trim() === cedCtx) ||
        (nomCtx && String(h.persona?.nombre || '').toLowerCase().trim() === nomCtx)
      );
    }

    if (rowEncontrada) {
      const nombre = rowEncontrada.persona?.nombre || 'Trabajador';
      const cedula = rowEncontrada.persona?.cedula || '';
      const cargo = rowEncontrada.persona?.cargo || 'General';
      const turnos = rowEncontrada.form?.turnos || 0;
      const neto = rowEncontrada.resultado?.neto || 0;
      const estado = rowEncontrada.estado || 'Pendiente';

      return {
        text: `⚠️ **Confirmación para retirar del cuadro de nómina**:\n\n` +
          `• 👤 **Trabajador**: **${nombre}**\n` +
          (cedula ? `• 🆔 **Cédula**: \`${cedula}\`\n` : '') +
          `• 🏢 **Parqueadero / Cargo**: ${cargo}\n` +
          `• 📊 **Registro actual en tabla**: ${turnos} turnos → **${fmt(neto)}** (${estado === 'Pagado' ? '✅ Pagado' : '⏳ Pendiente'})\n\n` +
          `¿Deseas eliminar a este trabajador del cuadro activo de nómina?\n` +
          `*(Nota: Su ficha de registro en la base de datos de Trabajadores permanecerá intacta)*.`,
        acciones: [
          {
            label: `🗑️ Confirmar eliminación de ${nombre.split(' ')[0]} de la tabla`,
            tipo: 'ELIMINAR_DE_NOMINA',
            payload: {
              historialId: rowEncontrada.id,
              nombre,
              cedula
            }
          },
          {
            label: `📍 Ubicar a ${nombre.split(' ')[0]} en la tabla`,
            tipo: 'DESPLAZAR_TABLA',
            payload: { cedula, nombre }
          }
        ],
        nuevoContexto: {
          ...context,
          ultimoTrabajador: rowEncontrada.persona || context?.ultimoTrabajador,
          eliminandoPendiente: {
            historialId: rowEncontrada.id,
            nombre,
            cedula
          }
        }
      };
    }

    // Si no está en el historial pero sí en la base de datos de trabajadores
    let trabajadorEnBD: any = null;
    if (cedulaBusqueda) {
      trabajadorEnBD = (todosTrabajadores || []).find(t => String(t.cedula).trim() === cedulaBusqueda);
    }
    if (!trabajadorEnBD && tokensNombre.length > 0) {
      trabajadorEnBD = (todosTrabajadores || []).find(t => {
        const tNorm = t.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return tokensNombre.every(tk => tNorm.includes(tk));
      });
    }

    if (trabajadorEnBD) {
      return {
        text: `ℹ️ **${trabajadorEnBD.nombre}** está registrado en la base de datos general de trabajadores, pero **actualmente NO se encuentra en la tabla de nómina activa** (no tiene turnos cargados en este momento).\n\n` +
          `• Si deseas agregarlo y liquidarlo en la tabla, puedes pedirme por ejemplo:\n` +
          `  *"Liquida a ${trabajadorEnBD.nombre.split(' ')[0]} con 15 turnos"*\n` +
          `• Si deseas darlo de baja permanente de toda la empresa, puedes gestionarlo desde el panel de administración.`,
        acciones: [
          {
            label: `🌐 Ir al panel de trabajadores (/admin)`,
            tipo: 'NAVEGAR_RUTA',
            payload: '/admin'
          }
        ],
        nuevoContexto: {
          ...context,
          ultimoTrabajador: trabajadorEnBD
        }
      };
    }

    return {
      text: `🤖 No encontré al trabajador que deseas eliminar en el cuadro de nómina.\n\n` +
        `Por favor indícame su nombre o cédula, por ejemplo:\n` +
        `• *"Elimina a Carlos Mario de la tabla"*\n` +
        `• *"Borra la fila de Diana Arias del cuadro"*\n` +
        `• *"Elimina al trabajador con cédula 1005"*`
    };
  }

  // ── 0.0 LIQUIDACIÓN Y REGISTRO EN LA NÓMINA EN VIVO ─────────────────────────
  const verbosLiquidar = /\b(liquida|liquidale|ingresa|ingresale|calcula|calculale|mete|metele|agrega|agregale)\b/i;
  const esIntentoNomina =
    Boolean(context?.liquidandoPendiente) ||
    (verbosLiquidar.test(q) && (q.includes('nomina') || q.includes('cuadro') || q.includes('tabla') || /\b(\d+)\s*(?:dias?|turnos?)\b/.test(q) || /\bcon\s*(\d+)\s*(?:dias?|turnos?)\b/.test(q))) ||
    (q.includes('a la nomina') || q.includes('al cuadro') || q.includes('a la tabla') || q.includes('en la nomina') || q.includes('en el cuadro') || q.includes('en la tabla') || q.includes('agregar trabajador') || q.includes('agregar trabajadores') || q.includes('ingresar trabajador') || q.includes('ingresar trabajadores'));

  if (esIntentoNomina) {
    const { data: todosTrabajadores } = await supabase.from('trabajadores').select('*');
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');

    if (todosTrabajadores && todosTrabajadores.length > 0) {
      // 1. Extraer días de turno
      let diasTurno = 0;
      const matchTurnos =
        q.match(/\b(\d+)\s*(?:dias?|turnos?)\b/) ||
        q.match(/\b(?:con|de)\s*(\d+)\s*(?:turnos?|dias?)\b/) ||
        q.match(/^\s*(\d+)\s*(?:turnos?|dias?)?\s*$/);
      if (matchTurnos) diasTurno = parseInt(matchTurnos[1], 10);

      // 2. Extraer horas adicionales
      let horasAdicionales = 0;
      const matchHoras = q.match(/\b(\d+)\s*(?:horas?|extras?|adicionales?)\b/);
      if (matchHoras) horasAdicionales = parseInt(matchHoras[1], 10);

      // 3. Extraer descuento de préstamo / aportes
      let tieneDescuentoPrestamo = false;
      let valorDescuentoPrestamo = 0;
      const matchPrestamo = q.match(/(?:prestamo|aporte|descuento)(?:\s*(?:de|=|:))?\s*(?:\$|\b)([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,6})\b/i);
      if (matchPrestamo) {
        tieneDescuentoPrestamo = true;
        valorDescuentoPrestamo = parseInt(matchPrestamo[1].replace(/[.,]/g, ''), 10);
      } else if (q.includes('con prestamo') || q.includes('con aporte') || q.includes('con aportes')) {
        tieneDescuentoPrestamo = true;
        valorDescuentoPrestamo = 4000;
      } else if (q.includes('sin prestamo') || q.includes('sin aporte') || q.includes('sin aportes') || q.includes('sin descuento')) {
        tieneDescuentoPrestamo = false;
        valorDescuentoPrestamo = 0;
      }

      // 4. Extraer bono
      let bono = 0;
      const matchBono = q.match(/bono(?:\s*de)?\s*(?:\$|\b)([0-9]{2,3}(?:[.,][0-9]{3})+|[0-9]{4,6})\b/);
      if (matchBono) bono = parseInt(matchBono[1].replace(/[.,]/g, ''), 10);

      // 5. Verificar ARL
      const sinARL = q.includes('sin arl') || q.includes('no arl') || q.includes('sin seguridad');

      // 6. Identificar al trabajador
      let trabajadorEncontrado: any = null;

      if (context?.liquidandoPendiente?.trabajador) {
        trabajadorEncontrado = todosTrabajadores.find(t =>
          String(t.cedula).trim() === String(context.liquidandoPendiente!.trabajador.cedula).trim() ||
          t.id === context.liquidandoPendiente!.trabajador.id
        ) || context.liquidandoPendiente.trabajador;
      }

      if (!trabajadorEncontrado) {
        const palabrasControlLiq = new Set([
          'liquida', 'liquidale', 'ingresa', 'ingresale', 'calcula', 'calculale', 'mete', 'metele', 'agrega', 'agregale',
          'con', 'de', 'del', 'a', 'al', 'los', 'las', 'el', 'la', 'un', 'una', 'por', 'en',
          'turnos', 'turno', 'dias', 'dia', 'horas', 'hora', 'extra', 'extras', 'adicionales', 'adicional',
          'bono', 'bonos', 'nomina', 'cuadro', 'tabla', 'porfa', 'favor', 'favorito', 'prestamo', 'aporte', 'aportes',
          'descuento', 'arl', 'seguridad', 'sin', 'social'
        ]);

        const tokensNombre = q.split(/\s+/).filter(w => w.length >= 3 && !palabrasControlLiq.has(w) && !/^\d+$/.test(w));

        if (tokensNombre.length > 0) {
          const candidatos = todosTrabajadores.map(t => {
            const tNorm = t.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            let score = 0;
            if (tokensNombre.every(tk => tNorm.includes(tk))) {
              score = 100 + tokensNombre.length * 10;
            } else {
              const palabrasT = tNorm.split(/\s+/).filter((w: string) => w.length >= 3);
              for (const tk of tokensNombre) {
                if (palabrasT.includes(tk)) score += 20;
              }
            }
            return { t, score };
          }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);

          if (candidatos.length > 0 && candidatos[0].score >= 20) {
            trabajadorEncontrado = candidatos[0].t;
          }
        }
      }

      if (!trabajadorEncontrado && context?.ultimoTrabajador) {
        trabajadorEncontrado = todosTrabajadores.find(t =>
          String(t.cedula).trim() === String(context.ultimoTrabajador.cedula).trim() ||
          t.id === context.ultimoTrabajador.id
        ) || context.ultimoTrabajador;
      }

      // CASO 1: Trabajador identificado Y se especificaron los días de turno
      if (trabajadorEncontrado && diasTurno > 0) {
        const yaExiste = (historial || []).some(h => String(h.persona?.cedula || '').trim() === String(trabajadorEncontrado.cedula).trim());

        const valorTurno = trabajadorEncontrado.valor_turno || 0;
        const valorHora = trabajadorEncontrado.valor_hora_adicional || Math.round(valorTurno / 8);
        const subtotalTurnos = diasTurno * valorTurno;
        const subtotalHoras = horasAdicionales * valorHora;

        const tieneDescuentoSeguridad = !sinARL && diasTurno > 0;
        const valorDescuentoSeguridad = tieneDescuentoSeguridad ? calcularDescuentoARLPila(diasTurno) : 0;
        const descuentoPrestamo = tieneDescuentoPrestamo ? valorDescuentoPrestamo : 0;

        const totalBruto = subtotalTurnos + subtotalHoras + bono + valorDescuentoSeguridad;
        const totalDescuentos = valorDescuentoSeguridad + descuentoPrestamo;
        const neto = Math.max(0, totalBruto - totalDescuentos);

        const pPayload = {
          nombre: trabajadorEncontrado.nombre,
          cedula: trabajadorEncontrado.cedula,
          cargo: trabajadorEncontrado.cargo || 'General',
          valorTurno: valorTurno,
          valorHoraAdicional: valorHora,
          formaPago: trabajadorEncontrado.forma_pago || 'Bancaria',
          numeroCuenta: trabajadorEncontrado.numero_cuenta || ''
        };

        const avisoDuplicado = yaExiste
          ? `⚠️ **Advertencia**: ${trabajadorEncontrado.nombre} ya tiene una liquidación registrada en esta quincena. Si confirmas, se añadirá una nueva adicional.\n\n`
          : '';

        return {
          text: `${avisoDuplicado}📋 **Cálculo de Liquidación para el Cuadro de Nómina**:\n\n` +
            `• 👤 **Trabajador**: **${trabajadorEncontrado.nombre}** (C.C. \`${trabajadorEncontrado.cedula}\`)\n` +
            `• 🏢 **Parqueadero**: ${trabajadorEncontrado.cargo || 'General'}\n` +
            `• 📅 **Días Turno**: **${diasTurno} días** × ${fmt(valorTurno)} = **${fmt(subtotalTurnos)}**\n` +
            (horasAdicionales > 0 ? `• ⏱️ **Horas Extra**: **${horasAdicionales} hrs** × ${fmt(valorHora)} = **${fmt(subtotalHoras)}**\n` : '') +
            (tieneDescuentoSeguridad ? `• 🛡️ **Seguridad Social / ARL PILA**: **${fmt(valorDescuentoSeguridad)}** (${diasTurno} días cotizados)\n` : '• 🛡️ **ARL**: Sin descuento\n') +
            (tieneDescuentoPrestamo ? `• 💳 **Descuento Préstamo / Aportes**: **${fmt(valorDescuentoPrestamo)}**\n` : '• 💳 **Préstamos/Aportes**: $0 (Sin descuento)\n') +
            (bono > 0 ? `• 🎁 **Bono Adicional**: **${fmt(bono)}**\n` : '') +
            `• 💵 **TOTAL NETO A PAGAR**: **${fmt(neto)}** (⏳ Pendiente)\n` +
            `• 🏦 **Forma de Pago**: ${trabajadorEncontrado.forma_pago || 'No definida'} (${trabajadorEncontrado.numero_cuenta ? `\`${trabajadorEncontrado.numero_cuenta}\`` : '*Sin cuenta*'})\n\n` +
            `¿Deseas registrar esta liquidación directamente en el cuadro de nómina?`,
          acciones: [
            {
              label: `⚡ Registrar a ${trabajadorEncontrado.nombre.split(' ')[0]} en nómina (${fmt(neto)})`,
              tipo: 'LIQUIDAR_TRABAJADOR',
              payload: {
                persona: pPayload,
                diasTurno,
                horasAdicionales,
                tieneBono: bono > 0,
                valorBono: bono,
                tieneDescuentoPrestamo,
                valorDescuentoPrestamo
              }
            },
            {
              label: `📍 Ubicar a ${trabajadorEncontrado.nombre.split(' ')[0]} en la tabla`,
              tipo: 'DESPLAZAR_TABLA',
              payload: {
                cedula: trabajadorEncontrado.cedula,
                nombre: trabajadorEncontrado.nombre
              }
            }
          ],
          nuevoContexto: {
            ultimoTrabajador: trabajadorEncontrado,
            liquidandoPendiente: undefined
          }
        };
      }

      // CASO 2: Trabajador identificado pero NO se han especificado los días ni deducciones
      if (trabajadorEncontrado && diasTurno === 0) {
        const yaExiste = (historial || []).some(h => String(h.persona?.cedula || '').trim() === String(trabajadorEncontrado.cedula).trim());
        const avisoDuplicado = yaExiste
          ? `⚠️ *Nota: ${trabajadorEncontrado.nombre} ya tiene un registro en este cuadro de nómina.*\n\n`
          : '';

        return {
          text: `${avisoDuplicado}📋 **Para ingresar a ${trabajadorEncontrado.nombre} (C.C. \`${trabajadorEncontrado.cedula}\`) a la nómina, indícame los datos de su liquidación**:\n\n` +
            `• 📅 **¿Cuántos días de turno laboró?** (Ej: *15* o *16 días*)\n` +
            `• ⏱️ **¿Tuvo horas extra o turnos adicionales?** (Opcional, ej: *2 horas extra*)\n` +
            `• 🛡️ **ARL**: Se calculará automáticamente según sus días cotizados.\n` +
            `• 💳 **Descuento de préstamos/aportes**: ¿Aplica descuento? (Usualmente *$4.000* o *$0* si no tiene).\n` +
            `• 🎁 **Bono**: (Opcional si tiene un incentivo adicional).\n\n` +
            `💬 *Puedes responder por ejemplo:*\n` +
            `• *"16 turnos"*\n` +
            `• *"15 turnos y 4000 de aporte"*\n` +
            `• *"16 días con 2 horas extra y sin préstamo"*\n\n` +
            `*(O selecciona una opción rápida abajo)*`,
          acciones: [
            {
              label: `📅 16 turnos`,
              tipo: 'LIQUIDAR_TRABAJADOR',
              payload: {
                persona: {
                  nombre: trabajadorEncontrado.nombre,
                  cedula: trabajadorEncontrado.cedula,
                  cargo: trabajadorEncontrado.cargo || 'General',
                  valorTurno: trabajadorEncontrado.valor_turno || 0,
                  valorHoraAdicional: trabajadorEncontrado.valor_hora_adicional || Math.round((trabajadorEncontrado.valor_turno || 0) / 8),
                  formaPago: trabajadorEncontrado.forma_pago || 'Bancaria',
                  numeroCuenta: trabajadorEncontrado.numero_cuenta || ''
                },
                diasTurno: 16,
                horasAdicionales: 0,
                tieneDescuentoPrestamo: false,
                valorDescuentoPrestamo: 0
              }
            },
            {
              label: `📅 15 turnos`,
              tipo: 'LIQUIDAR_TRABAJADOR',
              payload: {
                persona: {
                  nombre: trabajadorEncontrado.nombre,
                  cedula: trabajadorEncontrado.cedula,
                  cargo: trabajadorEncontrado.cargo || 'General',
                  valorTurno: trabajadorEncontrado.valor_turno || 0,
                  valorHoraAdicional: trabajadorEncontrado.valor_hora_adicional || Math.round((trabajadorEncontrado.valor_turno || 0) / 8),
                  formaPago: trabajadorEncontrado.forma_pago || 'Bancaria',
                  numeroCuenta: trabajadorEncontrado.numero_cuenta || ''
                },
                diasTurno: 15,
                horasAdicionales: 0,
                tieneDescuentoPrestamo: false,
                valorDescuentoPrestamo: 0
              }
            },
            {
              label: `📅 16 turnos + $4.000 aporte`,
              tipo: 'LIQUIDAR_TRABAJADOR',
              payload: {
                persona: {
                  nombre: trabajadorEncontrado.nombre,
                  cedula: trabajadorEncontrado.cedula,
                  cargo: trabajadorEncontrado.cargo || 'General',
                  valorTurno: trabajadorEncontrado.valor_turno || 0,
                  valorHoraAdicional: trabajadorEncontrado.valor_hora_adicional || Math.round((trabajadorEncontrado.valor_turno || 0) / 8),
                  formaPago: trabajadorEncontrado.forma_pago || 'Bancaria',
                  numeroCuenta: trabajadorEncontrado.numero_cuenta || ''
                },
                diasTurno: 16,
                horasAdicionales: 0,
                tieneDescuentoPrestamo: true,
                valorDescuentoPrestamo: 4000
              }
            }
          ],
          nuevoContexto: {
            ultimoTrabajador: trabajadorEncontrado,
            liquidandoPendiente: {
              trabajador: trabajadorEncontrado
            }
          }
        };
      }

      // CASO 3: No se indicó qué trabajador ingresar
      const cedulasLiquidadas = new Set((historial || []).map(h => String(h.persona?.cedula || '').trim()));
      const faltantes = todosTrabajadores.filter(t => !cedulasLiquidadas.has(String(t.cedula || '').trim()));

      const listaAcciones = faltantes.slice(0, 4).map(f => ({
        label: `👤 Ingresar a ${f.nombre.split(' ')[0]} (${f.cargo || 'General'})`,
        tipo: 'LIQUIDAR_TRABAJADOR' as const,
        payload: {
          persona: {
            nombre: f.nombre,
            cedula: f.cedula,
            cargo: f.cargo || 'General',
            valorTurno: f.valor_turno || 0,
            valorHoraAdicional: f.valor_hora_adicional || Math.round((f.valor_turno || 0) / 8),
            formaPago: f.forma_pago || 'Bancaria',
            numeroCuenta: f.numero_cuenta || ''
          },
          diasTurno: 16,
          horasAdicionales: 0,
          tieneDescuentoPrestamo: false,
          valorDescuentoPrestamo: 0
        }
      }));

      return {
        text: `👥 **¿A qué trabajador deseas ingresar al cuadro de nómina?**\n\n` +
          `Actualmente faltan **${faltantes.length} persona(s)** por ingresar a la nómina activa.\n\n` +
          `💬 **Puedes escribirme directamente:**\n` +
          `• *"Ingresa a Donella con 16 turnos"*\n` +
          `• *"Liquida a ${faltantes[0]?.nombre || 'Carlos'} 15 turnos"*\n` +
          `• *"Agrega a ${faltantes[1]?.nombre || 'Diana'} 16 días y 4000 de aporte"*\n\n` +
          (faltantes.length > 0 ? `*(O pulsa uno de los botones abajo para ingresar con 16 turnos estándar)*:` : ''),
        acciones: listaAcciones
      };
    }
  }

  // ── 0.05 AUDITORÍA Y DETECCIÓN DE ANOMALÍAS ─────────────────────────────────
  const esAuditoria =
    q.includes('auditoria') || q.includes('auditar') ||
    q.includes('revisa la nomina') || q.includes('revisar nomina') || q.includes('revisa el cuadro') || q.includes('revisar el cuadro') ||
    q.includes('hay errores') || q.includes('detectar errores') || q.includes('anomalias') || q.includes('inconsistencias');

  if (esAuditoria) {
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');

    if (!historial || historial.length === 0) {
      return { text: `📋 El cuadro de nómina está vacío actualmente. No hay registros para auditar.` };
    }

    const anomalías: string[] = [];

    // 1. Duplicados en la nómina
    const conteoCedulas = new Map<string, typeof historial>();
    historial.forEach(h => {
      const c = String(h.persona?.cedula || '').trim();
      if (c) {
        if (!conteoCedulas.has(c)) conteoCedulas.set(c, []);
        conteoCedulas.get(c)!.push(h);
      }
    });

    const duplicados = Array.from(conteoCedulas.entries()).filter(([_, lista]) => lista.length > 1);
    if (duplicados.length > 0) {
      let dTxt = `🚨 **Duplicados detectados en el cuadro (${duplicados.length})**:\n`;
      duplicados.forEach(([ced, lista]) => {
        dTxt += `   • 👤 **${lista[0].persona?.nombre}** (C.C. \`${ced}\`) aparece **${lista.length} veces** en la nómina.\n`;
      });
      anomalías.push(dTxt);
    }

    // 2. Turnos atípicos (> 16 turnos en quincena) o muchas horas extra (> 12 hrs)
    const turnosAltos = historial.filter(h => (h.form?.diasTurno || 0) > 16 || (h.form?.horasAdicionales || 0) > 12);
    if (turnosAltos.length > 0) {
      let tTxt = `⚠️ **Turnos o recargos atípicos (${turnosAltos.length})**:\n`;
      turnosAltos.forEach(h => {
        tTxt += `   • 👤 **${h.persona?.nombre}**: **${h.form?.diasTurno || 0} turnos**, **${h.form?.horasAdicionales || 0} hrs extra**.\n`;
      });
      anomalías.push(tTxt);
    }

    // 3. Tarifas en cero
    const tarifaCero = historial.filter(h => (h.persona?.valorTurno || 0) <= 0);
    if (tarifaCero.length > 0) {
      let zTxt = `⚠️ **Liquidaciones con tarifa de turno en $0 (${tarifaCero.length})**:\n`;
      tarifaCero.forEach(h => {
        zTxt += `   • 👤 **${h.persona?.nombre}** (C.C. \`${h.persona?.cedula}\`)\n`;
      });
      anomalías.push(zTxt);
    }

    // 4. Inconsistencias de cuenta bancaria
    const cuentasInvalidas = historial.filter(h => {
      const forma = (h.persona?.formaPago || '').toLowerCase();
      if (forma === 'efectivo') return false;
      const cta = (h.persona?.numeroCuenta || '').replace(/\D/g, '');
      return cta.length < 7;
    });
    if (cuentasInvalidas.length > 0) {
      let cTxt = `💳 **Cuentas bancarias dudosas o incompletas (${cuentasInvalidas.length})**:\n`;
      cuentasInvalidas.forEach(h => {
        cTxt += `   • 👤 **${h.persona?.nombre}** (${h.persona?.formaPago}): \`${h.persona?.numeroCuenta || 'Sin cuenta'}\`\n`;
      });
      anomalías.push(cTxt);
    }

    // 5. Sin parqueadero / cargo
    const sinCargo = historial.filter(h => !h.persona?.cargo || h.persona?.cargo === 'No asignado');
    if (sinCargo.length > 0) {
      let scTxt = `🏢 **Sin parqueadero asignado (${sinCargo.length})**:\n`;
      sinCargo.forEach(h => {
        scTxt += `   • 👤 **${h.persona?.nombre}**\n`;
      });
      anomalías.push(scTxt);
    }

    if (anomalías.length === 0) {
      return {
        text: `🛡️ **Auditoría de Nómina en Vivo - Estado Impecable**:\n\n` +
          `✅ Se auditaron **${historial.length} registros** en el cuadro de nómina.\n` +
          `• 0 personas duplicadas.\n` +
          `• 0 turnos fuera de rango.\n` +
          `• Todas las tarifas y cuentas bancarias son válidas.\n\n` +
          `🎉 **¡La nómina está 100% lista y consistente para pagos!**`
      };
    }

    return {
      text: `🛡️ **Resultado de Auditoría de Nómina (${anomalías.length} alertas detectadas)**:\n\n` +
        anomalías.join('\n') + `\n` +
        `💡 *Puedes pedirme modificar o abrir el editor de cualquiera de estas personas escribiendo su nombre.*`
    };
  }

  // ── 0.06 CONTROL DE FILTROS DE TABLA DESDE EL CHAT ──────────────────────────
  const esLimpiarFiltros =
    q.includes('quitar filtros') || q.includes('quitar filtro') ||
    q.includes('limpiar filtros') || q.includes('limpiar filtro') ||
    q.includes('ver todos') || q.includes('mostrar todos') || q.includes('toda la tabla');

  if (esLimpiarFiltros) {
    return {
      text: `🎛️ **Filtros restablecidos**: Ahora la tabla muestra todos los registros del cuadro de nómina sin restricciones.`,
      acciones: [
        {
          label: `🔄 Restablecer vista de tabla`,
          tipo: 'APLICAR_FILTROS',
          payload: { cargo: '', banco: '', busqueda: '' }
        }
      ]
    };
  }

  const cargosFiltroList = [
    'CONTRATISTAS DE ADMINISTRACION', '5 - 6', '6 - 6', 'CARTON C', 'GUACANDA',
    'TERCERA', 'ROZO', '2 - 10', 'MAYORISTA', 'GUABINAS', 'BOLIVAR', 'REMESAS'
  ];

  const mapaBancosFiltro: Record<string, string> = {
    'bancolombia': 'Bancolombia',
    'nequi': 'Nequi',
    'daviplata': 'Daviplata',
    'davivienda': 'Davivienda',
    'av villas': 'AV Villas',
    'villas': 'AV Villas',
    'bbva': 'BBVA',
    'banco de bogota': 'Banco de Bogotá',
    'bogota': 'Banco de Bogotá',
    'popular': 'Banco Popular',
    'caja social': 'Caja Social',
    'efectivo': 'Efectivo',
    'transferencia': 'Transferencia'
  };

  const esIntentoFiltrar =
    /\b(filtra|filtrar|filtro|muestra|mostrar|ver|solo)\b/.test(q) &&
    (q.includes('tabla') || q.includes('cuadro') || cargosFiltroList.some(c => q.includes(c.toLowerCase())) || Object.keys(mapaBancosFiltro).some(b => q.includes(b)) || q.includes('pendiente') || q.includes('pagado'));

  if (esIntentoFiltrar) {
    const cargoFiltro = cargosFiltroList.find(c => q.includes(c.toLowerCase()));
    const bancoFiltroKey = Object.keys(mapaBancosFiltro).find(b => q.includes(b));
    const bancoFiltro = bancoFiltroKey ? mapaBancosFiltro[bancoFiltroKey] : undefined;

    let busquedaEstado = '';
    if (q.includes('pendiente') || q.includes('pendientes')) busquedaEstado = 'Pendiente';
    if (q.includes('pagado') || q.includes('pagados')) busquedaEstado = 'Pagado';

    if (cargoFiltro || bancoFiltro || busquedaEstado) {
      const desc: string[] = [];
      const payload: any = {};
      if (cargoFiltro) {
        payload.cargo = cargoFiltro;
        desc.push(`🏢 Parqueadero: **${cargoFiltro}**`);
      }
      if (bancoFiltro) {
        payload.banco = bancoFiltro;
        desc.push(`🏦 Banco: **${bancoFiltro}**`);
      }
      if (busquedaEstado) {
        payload.busqueda = busquedaEstado;
        desc.push(`📌 Estado: **${busquedaEstado}**`);
      }

      return {
        text: `🎛️ **Aplicando filtro en la tabla**:\n\n` + desc.join('\n') + `\n\n*La vista de la tabla se ha actualizado según tu solicitud.*`,
        acciones: [
          {
            label: `🔍 Aplicar filtros solicitados`,
            tipo: 'APLICAR_FILTROS',
            payload
          },
          {
            label: `🔄 Quitar filtros`,
            tipo: 'APLICAR_FILTROS',
            payload: { cargo: '', banco: '', busqueda: '' }
          }
        ]
      };
    }
  }

  // ── 0.07 PAGOS MASIVOS Y ESTADÍSTICAS POR SEGMENTO ─────────────────────────
  const esMarcaPagadoMasivo =
    /\b(marca|marcar|pasa|pasar|cambia|cambiar|pon|poner)\s*(?:a\s*)?(?:todos\s*)?(?:como\s*)?pagados?\b/i.test(q) ||
    /\b(pagar\s*a\s*todos)\b/i.test(q);

  if (esMarcaPagadoMasivo) {
    const cargoFiltro = cargosFiltroList.find(c => q.includes(c.toLowerCase()));
    const bancoFiltroKey = Object.keys(mapaBancosFiltro).find(b => q.includes(b));
    const bancoFiltro = bancoFiltroKey ? mapaBancosFiltro[bancoFiltroKey] : undefined;

    const { data: historial } = await supabase.from('historial_liquidaciones').select('*').eq('estado', 'Pendiente');

    if (!historial || historial.length === 0) {
      return { text: `✅ No hay pagos pendientes en el cuadro de nómina actual. Todos los registros ya están marcados como Pagados.` };
    }

    let pendientesFiltrados = historial;
    let criterio = 'todos los pendientes';
    let tipoFiltro: 'banco' | 'cargo' | 'todos' = 'todos';
    let valorFiltro: string | undefined = undefined;

    if (cargoFiltro) {
      pendientesFiltrados = historial.filter(h => (h.persona?.cargo || '').toLowerCase() === cargoFiltro.toLowerCase());
      criterio = `los del parqueadero **${cargoFiltro}**`;
      tipoFiltro = 'cargo';
      valorFiltro = cargoFiltro;
    } else if (bancoFiltro) {
      pendientesFiltrados = historial.filter(h => (h.persona?.formaPago || '').toLowerCase() === bancoFiltro.toLowerCase());
      criterio = `los que cobran por **${bancoFiltro}**`;
      tipoFiltro = 'banco';
      valorFiltro = bancoFiltro;
    }

    if (pendientesFiltrados.length === 0) {
      return { text: `ℹ️ No se encontraron trabajadores con pagos pendientes para ${criterio}.` };
    }

    const totalNeto = pendientesFiltrados.reduce((acc, h) => acc + (h.resultado?.neto || 0), 0);

    return {
      text: `💳 **Confirmación de Pago Masivo**:\n\n` +
        `• 👥 Trabajadores a marcar como Pagados: **${pendientesFiltrados.length} personas** (${criterio})\n` +
        `• 💰 Total Neto a liquidar: **${fmt(totalNeto)}**\n\n` +
        `⚠️ ¿Deseas aplicar el cambio de estado a **✅ Pagado** en Supabase para estas ${pendientesFiltrados.length} personas?`,
      acciones: [
        {
          label: `⚡ Confirmar pago masivo (${pendientesFiltrados.length} pers. — ${fmt(totalNeto)})`,
          tipo: 'PAGO_MASIVO',
          payload: { tipoFiltro, valorFiltro }
        }
      ]
    };
  }

  // Estadísticas por segmento (ej: "cuanto suma guacanda", "cuanto es lo de bancolombia")
  const esPreguntaCuantoSumaSegmento =
    (/\b(cuanto\s*(?:suma|es|vale|se\s*debe|toca\s*pagar|total))\b/i.test(q)) &&
    (cargosFiltroList.some(c => q.includes(c.toLowerCase())) || Object.keys(mapaBancosFiltro).some(b => q.includes(b)));

  if (esPreguntaCuantoSumaSegmento) {
    const cargoFiltro = cargosFiltroList.find(c => q.includes(c.toLowerCase()));
    const bancoFiltroKey = Object.keys(mapaBancosFiltro).find(b => q.includes(b));
    const bancoFiltro = bancoFiltroKey ? mapaBancosFiltro[bancoFiltroKey] : undefined;

    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');

    if (!historial || historial.length === 0) {
      return { text: `El cuadro de nómina está vacío actualmente.` };
    }

    let filtrados = historial;
    let titulo = '';

    if (cargoFiltro) {
      filtrados = historial.filter(h => (h.persona?.cargo || '').toLowerCase() === cargoFiltro.toLowerCase());
      titulo = `🏢 Parqueadero ${cargoFiltro}`;
    } else if (bancoFiltro) {
      filtrados = historial.filter(h => (h.persona?.formaPago || '').toLowerCase() === bancoFiltro.toLowerCase());
      titulo = `🏦 Forma de Pago ${bancoFiltro}`;
    }

    if (filtrados.length === 0) {
      return { text: `No se encontraron personas liquidadas para **${titulo}** en el cuadro de nómina actual.` };
    }

    const tTurnos = filtrados.reduce((acc, h) => acc + (h.form?.diasTurno || 0), 0);
    const tHoras = filtrados.reduce((acc, h) => acc + (h.form?.horasAdicionales || 0), 0);
    const tNeto = filtrados.reduce((acc, h) => acc + (h.resultado?.neto || 0), 0);
    const pagados = filtrados.filter(h => h.estado === 'Pagado');
    const pendientes = filtrados.filter(h => h.estado !== 'Pagado');
    const sumaPagados = pagados.reduce((acc, h) => acc + (h.resultado?.neto || 0), 0);
    const sumaPendientes = pendientes.reduce((acc, h) => acc + (h.resultado?.neto || 0), 0);

    return {
      text: `📊 **Resumen Financiero: ${titulo}**\n\n` +
        `• 👥 **Personas liquidadas**: ${filtrados.length}\n` +
        `• 📅 **Total Turnos**: ${tTurnos} días ${tHoras > 0 ? `| ${tHoras} hrs adicionales` : ''}\n` +
        `• 💰 **Total Neto a Pagar**: **${fmt(tNeto)}**\n` +
        `   • ✅ Pagados: ${fmt(sumaPagados)} (${pagados.length} pers.)\n` +
        `   • ⏳ Pendientes: ${fmt(sumaPendientes)} (${pendientes.length} pers.)\n\n` +
        (pendientes.length > 0 ? `💡 *Puedes pedirme "marca como pagados a los de ${cargoFiltro || bancoFiltro}" para actualizar su estado.*` : `🎉 *Todos los pagos de este grupo ya están al día.*`),
      acciones: [
        {
          label: `🔍 Filtrar tabla por ${cargoFiltro || bancoFiltro}`,
          tipo: 'APLICAR_FILTROS',
          payload: cargoFiltro ? { cargo: cargoFiltro } : { banco: bancoFiltro }
        }
      ]
    };
  }

  // ── 0.08 CONSULTA DE TRABAJADORES SIN CUENTA BANCARIA ──────────────────────
  const esConsultaFaltaCuenta =
    (/\b(falta|faltan|sin|no\s*tienen?|tienen?)\b/i.test(q) && /\b(cuenta|cuentas|cuneta|numero\s*de\s*cuenta|bancaria)\b/i.test(q)) ||
    q.includes('faltan por cuenta') || q.includes('falta por cuenta') ||
    q.includes('sin cuenta') || q.includes('sin numero de cuenta') ||
    q.includes('no tienen cuenta') || q.includes('quienes no tienen cuenta') ||
    q.includes('quienes faltan por cuenta') || q.includes('cuales faltan por cuenta');

  if (esConsultaFaltaCuenta) {
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');
    const { data: todosTrabajadores } = await supabase.from('trabajadores').select('*');

    interface SinCuentaInfo {
      nombre: string;
      cedula: string;
      cargo: string;
      formaPago: string;
      enNomina: boolean;
      historialId?: string;
      neto?: number;
    }

    const sinCuentaMap = new Map<string, SinCuentaInfo>();

    // 1. Revisar trabajadores en nómina
    for (const h of (historial || [])) {
      const p = h.persona || {};
      const forma = (p.formaPago || p.forma_pago || '').trim();
      const cuenta = String(p.numeroCuenta || p.numero_cuenta || '').trim();
      const esMetodoElectronico = forma.toLowerCase() !== 'efectivo' && forma !== '';
      const cuentaInvalida = !cuenta || cuenta === '0' || cuenta.toLowerCase().includes('sin') || cuenta.toLowerCase().includes('pendiente') || cuenta.length < 6;

      if (esMetodoElectronico && cuentaInvalida) {
        const ced = String(p.cedula || '').trim();
        sinCuentaMap.set(ced || p.nombre, {
          nombre: p.nombre || 'Sin nombre',
          cedula: ced,
          cargo: p.cargo || 'General',
          formaPago: forma,
          enNomina: true,
          historialId: h.id,
          neto: h.resultado?.neto || 0
        });
      }
    }

    // 2. Revisar resto de trabajadores en BD general
    for (const t of (todosTrabajadores || [])) {
      const ced = String(t.cedula || '').trim();
      if (sinCuentaMap.has(ced || t.nombre)) continue;

      const forma = (t.forma_pago || '').trim();
      const cuenta = String(t.numero_cuenta || '').trim();
      const esMetodoElectronico = forma.toLowerCase() !== 'efectivo' && forma !== '';
      const cuentaInvalida = !cuenta || cuenta === '0' || cuenta.toLowerCase().includes('sin') || cuenta.toLowerCase().includes('pendiente') || cuenta.length < 6;

      if (esMetodoElectronico && cuentaInvalida) {
        sinCuentaMap.set(ced || t.nombre, {
          nombre: t.nombre || 'Sin nombre',
          cedula: ced,
          cargo: t.cargo || 'General',
          formaPago: forma,
          enNomina: false
        });
      }
    }

    const listaSinCuenta = Array.from(sinCuentaMap.values());

    if (listaSinCuenta.length === 0) {
      return {
        text: `🎉 **¡Excelente! No hay trabajadores pendientes por registrar cuenta bancaria.**\n\n` +
          `Todos los trabajadores con pago por transferencia (Bancolombia, Davivienda, Nequi, etc.) tienen su número de cuenta debidamente registrado.`
      };
    }

    const lineas = listaSinCuenta.map(item => {
      const estadoNomina = item.enNomina ? `📊 En nómina: **${fmt(item.neto || 0)}**` : `👤 Registrado en base de datos`;
      return `• 👤 **${item.nombre}** (C.C. \`${item.cedula || 'Sin C.C.'}\`)\n` +
        `   • 🏢 Parqueadero: ${item.cargo}\n` +
        `   • 🏦 Banco: **${item.formaPago}** ⚠️ *(Sin número de cuenta)*\n` +
        `   • ${estadoNomina}`;
    });

    const acciones: ChatAction[] = [];

    const enTabla = listaSinCuenta.filter(i => i.enNomina).slice(0, 3);
    for (const item of enTabla) {
      acciones.push({
        label: `✏️ Abrir editor de ${item.nombre.split(' ')[0]} en tabla`,
        tipo: 'EDITAR_EN_TABLA',
        payload: { cedula: item.cedula, nombre: item.nombre }
      });
    }

    return {
      text: `⚠️ **Trabajadores sin número de cuenta bancaria** (${listaSinCuenta.length} personas):\n\n` +
        `Tienen asignada una forma de pago por transferencia pero su cuenta está vacía o incompleta:\n\n` +
        lineas.join('\n\n') + `\n\n` +
        `💬 *Para asignarle la cuenta a cualquiera de ellos, puedes pedirme por ejemplo:*\n` +
        `• *"Cámbiale la cuenta a ${listaSinCuenta[0].nombre.split(' ')[0]} a 1234567890"*`,
      acciones
    };
  }

  // ── 0.09 CONSULTA DE PERSONAL POR BANCO O PARQUEADERO ──────────────────────
  const tienePalabraListarPersonal = /\b(cuales|quienes|lista|dime|ver|mostrar|cuantos|personal|trabajadores|empleados|gente|filas)\b/i.test(q);
  const esConsultaQuienesPorBancoOCargo =
    !q.includes('falta') && !q.includes('sin cuenta') && !q.includes('no tiene') && !q.includes('cambia') && !q.includes('marca') && (
      (tienePalabraListarPersonal && (cargosFiltroList.some(c => q.includes(c.toLowerCase())) || Object.keys(mapaBancosFiltro).some(b => q.includes(b)))) ||
      (/\b(quienes|cuales)\s*(son|estan|cobran|pagan|tienen)?\s*(de|por|en)?\s*(davivienda|bancolombia|nequi|daviplata|villas|bbva|bogota|popular|social|efectivo|transferencia)/i.test(q))
    );

  if (esConsultaQuienesPorBancoOCargo) {
    const cargoFiltro = cargosFiltroList.find(c => q.includes(c.toLowerCase()));
    const bancoFiltroKey = Object.keys(mapaBancosFiltro).find(b => q.includes(b));
    const bancoFiltro = bancoFiltroKey ? mapaBancosFiltro[bancoFiltroKey] : undefined;

    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');
    const { data: todosTrabajadores } = await supabase.from('trabajadores').select('*');

    let filtradosHistorial = (historial || []);
    let filtradosTrabajadores = (todosTrabajadores || []);
    let tituloGrupo = '';

    if (cargoFiltro) {
      filtradosHistorial = filtradosHistorial.filter(h => (h.persona?.cargo || '').toLowerCase() === cargoFiltro.toLowerCase());
      filtradosTrabajadores = filtradosTrabajadores.filter(t => (t.cargo || '').toLowerCase() === cargoFiltro.toLowerCase());
      tituloGrupo = `🏢 Parqueadero ${cargoFiltro}`;
    } else if (bancoFiltro) {
      filtradosHistorial = filtradosHistorial.filter(h => (h.persona?.formaPago || '').toLowerCase() === bancoFiltro.toLowerCase());
      filtradosTrabajadores = filtradosTrabajadores.filter(t => (t.forma_pago || '').toLowerCase() === bancoFiltro.toLowerCase());
      tituloGrupo = `🏦 Forma de Pago ${bancoFiltro}`;
    }

    if (filtradosHistorial.length === 0 && filtradosTrabajadores.length === 0) {
      return {
        text: `🤖 No se encontraron trabajadores registrados con **${tituloGrupo}** en el sistema.`
      };
    }

    const tNeto = filtradosHistorial.reduce((acc, h) => acc + (h.resultado?.neto || 0), 0);
    const pagados = filtradosHistorial.filter(h => h.estado === 'Pagado');
    const pendientes = filtradosHistorial.filter(h => h.estado !== 'Pagado');

    const lineasDetalle: string[] = [];

    filtradosHistorial.forEach((h, idx) => {
      const p = h.persona || {};
      const cta = p.numeroCuenta ? `Cta: \`${p.numeroCuenta}\`` : '⚠️ *Sin cuenta*';
      const estadoBadge = h.estado === 'Pagado' ? '✅ Pagado' : '⏳ Pendiente';
      const netoStr = fmt(h.resultado?.neto || 0);
      lineasDetalle.push(
        `${idx + 1}. **${p.nombre}** (C.C. \`${p.cedula || 'S/C'}\`)\n` +
        `   • ${cargoFiltro ? `🏦 ${p.formaPago} | ${cta}` : `🏢 ${p.cargo} | ${cta}`}\n` +
        `   • 📊 ${h.form?.diasTurno || h.form?.turnos || 0} turnos → **${netoStr}** (${estadoBadge})`
      );
    });

    const cedulasEnNomina = new Set(filtradosHistorial.map(h => String(h.persona?.cedula || '').trim()));
    const noLiquidadosAun = filtradosTrabajadores.filter(t => !cedulasEnNomina.has(String(t.cedula).trim()));

    let extraNoLiquidados = '';
    if (noLiquidadosAun.length > 0) {
      extraNoLiquidados = `\n\n⏳ **Aún no ingresados a nómina activa (${noLiquidadosAun.length})**:\n` +
        noLiquidadosAun.map(t => `• 👤 **${t.nombre}** (C.C. \`${t.cedula || 'S/C'}\`) — Cuenta: \`${t.numero_cuenta || 'Sin cuenta'}\``).join('\n');
    }

    const acciones: ChatAction[] = [
      {
        label: `🔍 Filtrar tabla por ${cargoFiltro || bancoFiltro}`,
        tipo: 'APLICAR_FILTROS',
        payload: cargoFiltro ? { cargo: cargoFiltro } : { banco: bancoFiltro }
      }
    ];

    if (pendientes.length > 0) {
      const totalPend = pendientes.reduce((acc, h) => acc + (h.resultado?.neto || 0), 0);
      acciones.push({
        label: `⚡ Pagar los de ${cargoFiltro || bancoFiltro} (${pendientes.length} pendientes — ${fmt(totalPend)})`,
        tipo: 'PAGO_MASIVO',
        payload: {
          tipoFiltro: cargoFiltro ? 'cargo' : 'banco',
          valorFiltro: cargoFiltro || bancoFiltro
        }
      });
    }

    return {
      text: `📋 **Personal asignado a: ${tituloGrupo}**\n\n` +
        `• 👥 **En nómina actual**: **${filtradosHistorial.length} personas** (${fmt(tNeto)})\n` +
        `   • ✅ Pagados: ${pagados.length} | ⏳ Pendientes: ${pendientes.length}\n\n` +
        lineasDetalle.join('\n\n') +
        extraNoLiquidados,
      acciones
    };
  }

  // ── 0.095 CONSULTA DE TRABAJADORES POR DÍAS DE TURNO ────────────────────────
  const esIntentoModificarTurnosDirecto =
    /\b(cambia|cambiar|actualiza|actualizar|modifica|modificar|pon|ponle|ajusta)\b/i.test(q) &&
    /\b(dias?|turnos?)\b/i.test(q) &&
    (/\ba\s*([0-9]{1,2})\b/.test(q) || /\bpor\s*([0-9]{1,2})\b/.test(q) || /\b([0-9]{1,2})\s*(dias?|turnos?)\b/.test(q));

  const tienePalabraConsultaTurnos = !esIntentoModificarTurnosDirecto &&
    (
      (/\b(cuales|quienes|lista|dime|mostrar|ver|cuantos|hay|trabajadores|personas)\b/i.test(q) &&
       /\b(dias?|turnos?)\b/i.test(q) &&
       /\b([0-9]{1,2})\b/.test(q)) ||
      /\b(tienen|con)\s*([0-9]{1,2})\s*(dias?|turnos?)\b/i.test(q) ||
      /\b(de\s*([0-9]{1,2})\s*(dias?|turnos?))\b/i.test(q)
    );

  if (tienePalabraConsultaTurnos) {
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');

    if (!historial || historial.length === 0) {
      return { text: `El cuadro de nómina está vacío actualmente.` };
    }

    const diasMatches = [...q.matchAll(/\b([0-9]{1,2})\b/g)]
      .map(m => parseInt(m[1], 10))
      .filter(n => n >= 1 && n <= 31);
    let diasConsultados = Array.from(new Set(diasMatches));

    if (diasConsultados.length === 0) {
      diasConsultados = [16];
    }

    const filtrados = historial.filter(h => {
      const turnos = Number(h.form?.diasTurno || h.form?.turnos || 0);
      return diasConsultados.includes(turnos);
    });

    if (filtrados.length === 0) {
      const turnosExistentes = Array.from(new Set(historial.map(h => Number(h.form?.diasTurno || h.form?.turnos || 0))))
        .filter(t => t > 0)
        .sort((a, b) => a - b);

      return {
        text: `🤖 En este momento no hay trabajadores liquidados con **${diasConsultados.join(' o ')} días** en el cuadro de nómina.\n\n` +
          `• Días de turno registrados actualmente en el cuadro: **${turnosExistentes.map(t => `${t} días`).join(', ') || 'Ninguno'}**.`
      };
    }

    const lineas = filtrados.map((h, idx) => {
      const p = h.persona || {};
      const turnos = Number(h.form?.diasTurno || h.form?.turnos || 0);
      const horas = Number(h.form?.horasAdicionales || 0);
      const neto = Number(h.resultado?.neto || 0);
      const estado = h.estado === 'Pagado' ? '✅ Pagado' : '⏳ Pendiente';

      return `${idx + 1}. 👤 **${p.nombre}** (C.C. \`${p.cedula || 'S/C'}\`)\n` +
        `   • 🏢 Parqueadero: ${p.cargo || 'General'} | 💳 ${p.formaPago || 'Efectivo'}\n` +
        `   • 📊 **${turnos} días**${horas > 0 ? ` + ${horas} hrs extra` : ''} → **${fmt(neto)}** (${estado})`;
    });

    const acciones: ChatAction[] = [];

    const primeros = filtrados.slice(0, 3);
    for (const item of primeros) {
      const nomCorto = (item.persona?.nombre || 'Trabajador').split(' ')[0];
      acciones.push({
        label: `✏️ Modificar a ${nomCorto} en tabla`,
        tipo: 'EDITAR_EN_TABLA',
        payload: { cedula: item.persona?.cedula, nombre: item.persona?.nombre }
      });
      acciones.push({
        label: `📍 Ubicar a ${nomCorto} en tabla`,
        tipo: 'DESPLAZAR_TABLA',
        payload: { cedula: item.persona?.cedula, nombre: item.persona?.nombre }
      });
    }

    return {
      text: `📅 **Personal con ${diasConsultados.map(d => `${d} días`).join(' o ')} en nómina** (${filtrados.length} personas):\n\n` +
        lineas.join('\n\n') + `\n\n` +
        `💡 **Para modificar los días de alguno:**\n` +
        `• Pídeme directamente por aquí: *"Cámbiale los días a [Nombre] a 15"* o *"Ponle 14 turnos a [Nombre]"*.\n` +
        `• O presiona el botón **✏️ Modificar en tabla** para abrir su fila directamente.`,
      acciones
    };
  }

  // ── 0.1 MODIFICACIÓN DE DATOS (SOLO A PETICIÓN EXPLÍCITA) ───────────────────
  // Solo responder con mensaje de ayuda si NO se menciona a ninguna persona ni se especifica una acción concreta
  const esPreguntaInformativaModificar =
    (q === 'modificar datos' || q === 'editar datos' || q === 'como modificar' || q === 'como cambiar datos' || q === 'puedes modificar' || q === 'puedes cambiar datos') ||
    (/^(puedes|como puedo|como se puede)\s*(modificar|cambiar|editar)\s*(datos|trabajadores|personas)?\??$/i.test(q));

  if (esPreguntaInformativaModificar) {
    return {
      text: `🛠️ **Sí, puedo buscar y modificar datos del personal rápidamente.**\n\n` +
        `Para proteger la nómina, **te ubicaré directamente en la fila de la persona en la tabla** y siempre te mostraré una confirmación antes de guardar cambios en Supabase.\n\n` +
        `**Ejemplos de lo que puedes pedirme:**\n` +
        `• *"Modifica los datos de Donella"*\n` +
        `• *"Cámbiale a Juan Pedro la cuenta a 0550018400135358"*\n` +
        `• *"Cámbiale la cédula a Carlos por 100523489"*\n` +
        `• *"Actualiza el valor de turno de Diana a 65000"*\n` +
        `• *"Cambia el banco de Juan a Nequi"*\n` +
        `• *"Pasa a María al parqueadero Carton C"*`
    };
  }

  const cargosDisponibles = [
    'CONTRATISTAS DE ADMINISTRACION', '5 - 6', '6 - 6', 'CARTON C', 'GUACANDA',
    'TERCERA', 'ROZO', '2 - 10', 'MAYORISTA', 'GUABINAS', 'BOLIVAR', 'REMESAS'
  ];

  const mapaBancos: Record<string, string> = {
    'bancolombia': 'Bancolombia',
    'nequi': 'Nequi',
    'daviplata': 'Daviplata',
    'davivienda': 'Davivienda',
    'av villas': 'AV Villas',
    'villas': 'AV Villas',
    'bbva': 'BBVA',
    'banco de bogota': 'Banco de Bogotá',
    'bogota': 'Banco de Bogotá',
    'popular': 'Banco Popular',
    'caja social': 'Caja Social',
    'efectivo': 'Efectivo',
    'transferencia': 'Transferencia'
  };

  const verbosModificar = [
    'cambia', 'cambiar', 'cambiale', 'cambiales', 'cambiame', 'cambialo', 'cambiala', 'cambielos', 'cambielas', 'cambielo', 'cambiela', 'cambien', 'cambienlo',
    'actualiza', 'actualizar', 'actualizale', 'actualizame', 'actualizalo', 'actualizala', 'actualicelo', 'actualicela',
    'modifica', 'modificar', 'modificale', 'modificame', 'modificalo', 'modificala', 'modifiquelo', 'modifiquela',
    'edita', 'editar', 'editale', 'editame', 'editalo', 'editala', 'editele', 'editelo',
    'ponle', 'pon', 'poner', 'ponme', 'ponlo', 'ponla', 'pongale', 'pongalo', 'pongala',
    'asigna', 'asignar', 'asignale', 'asignalor', 'asignalo', 'asignala', 'asigne',
    'fija', 'fijar', 'fijale', 'fijalo', 'fijala',
    'ajusta', 'ajustar', 'ajustale', 'ajustalo', 'ajustala',
    'pasa', 'pasar', 'pasale', 'pasalo', 'pasala', 'paselos', 'paselas', 'paselo', 'pasela', 'pasen', 'pasenlo',
    'mueve', 'mover', 'muevelo', 'muevela', 'muevele', 'traslada', 'trasladar', 'trasladalo', 'trasladala'
  ];

  const esIntentoModificar =
    verbosModificar.some(v => new RegExp(`\\b${v}\\b`, 'i').test(q)) ||
    q.includes('modifica los datos') || q.includes('modificar los datos') ||
    q.includes('cambiar los datos') || q.includes('cambia los datos') ||
    q.includes('editar a') || q.includes('edita a') ||
    q.includes('modificar a') || q.includes('modifica a') ||
    // Si venimos hablando de un trabajador, cualquier mención a cargo, banco, cuenta o tarifa aplica directamente
    (Boolean(context?.ultimoTrabajador) && (
      cargosDisponibles.some(c => q.includes(c.toLowerCase())) ||
      q.includes('banco') || q.includes('cuenta') || q.includes('turno') || q.includes('tarifa') ||
      Object.keys(mapaBancos).some(b => q.includes(b)) ||
      /\b\d{7,25}\b/.test(q)
    ));

  if (esIntentoModificar || context?.campoPendiente) {
    const { data: todosTrabajadores } = await supabase.from('trabajadores').select('*');
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');

    if (todosTrabajadores && todosTrabajadores.length > 0) {
      // 1. Extraer campo y nuevo valor solicitados en el mensaje actual
      let campoDB = '';
      let campoLabel = '';
      let valorNuevo: any = null;

      // Si había un campo pendiente esperando el nombre del trabajador
      if (context?.campoPendiente) {
        campoDB = context.campoPendiente.campo;
        campoLabel = context.campoPendiente.campoLabel;
        valorNuevo = context.campoPendiente.valorNuevo;
      }

      // A. Cédula
      if (!campoDB && (q.includes('cedula') || q.includes('cc') || q.includes('documento') || q.includes('identificacion'))) {
        const matchCedula = q.match(/(?:cedula|cc|documento|identificacion)(?:\s*(?:a|por|en|de|=|:))?\s*([0-9]{6,12})/i);
        if (matchCedula) {
          campoDB = 'cedula';
          campoLabel = 'Número de Cédula';
          valorNuevo = matchCedula[1];
        }
      }

      // B. Banco / Forma de pago
      if (!campoDB) {
        const bancoEncontrado = Object.keys(mapaBancos).find(b => q.includes(b));
        if (bancoEncontrado && (q.includes('banco') || q.includes('pago') || q.includes('forma') || q.includes('medio') || q.includes(`a ${bancoEncontrado}`) || q.includes(`por ${bancoEncontrado}`) || q.includes('cambia') || q.includes('cambiar') || q.includes('pas') || Boolean(context?.ultimoTrabajador))) {
          campoDB = 'forma_pago';
          campoLabel = 'Forma de Pago';
          valorNuevo = mapaBancos[bancoEncontrado];
        }
      }

      // C. Número de Cuenta
      if (!campoDB && (q.includes('cuenta') || q.includes('cta') || q.includes('cuneta') || q.includes('numero') || q.includes('no.') || q.includes('celular'))) {
        const matchCuenta = q.match(/(?:cuenta|cta|cuneta|numero|no\.?|celular)(?:\s*(?:a|por|en|de|=|:))?\s*([0-9]{7,25})/i);
        if (matchCuenta) {
          campoDB = 'numero_cuenta';
          campoLabel = 'Número de Cuenta';
          valorNuevo = matchCuenta[1];
        } else {
          const nums = q.match(/\b([0-9]{7,25})\b/g) || [];
          if (nums.length > 0) {
            campoDB = 'numero_cuenta';
            campoLabel = 'Número de Cuenta';
            valorNuevo = nums[0];
          }
        }
      }

      // D. Valor Turno
      if (!campoDB && (q.includes('turno') || q.includes('tarifa') || q.includes('sueldo') || q.includes('diario'))) {
        const numMatch = q.match(/(?:\$|\b)([0-9]{2,3}(?:[.,][0-9]{3})+|[0-9]{5,6})\b/);
        if (numMatch) {
          campoDB = 'valor_turno';
          campoLabel = 'Valor de Turno';
          valorNuevo = parseInt(numMatch[1].replace(/[.,]/g, ''), 10);
        }
      }

      // E. Valor Hora Adicional
      if (!campoDB && (q.includes('hora') || q.includes('extra') || q.includes('adicional') || q.includes('recargo'))) {
        const numMatch = q.match(/(?:\$|\b)([0-9]{1,2}(?:[.,][0-9]{3})+|[0-9]{4,5})\b/);
        if (numMatch) {
          campoDB = 'valor_hora_adicional';
          campoLabel = 'Valor Hora Adicional';
          valorNuevo = parseInt(numMatch[1].replace(/[.,]/g, ''), 10);
        }
      }

      // F. Parqueadero / Cargo (soporta "pasalo a guacanda", "cambialo a guacanda", "a guabinas", etc.)
      if (!campoDB) {
        const cargoMatch = cargosDisponibles.find(c => q.includes(c.toLowerCase()));
        if (cargoMatch) {
          campoDB = 'cargo';
          campoLabel = 'Parqueadero / Cargo';
          valorNuevo = cargoMatch;
        }
      }

      // G. Días de turno en nómina (ej: "cambiale los dias a 15", "ponle 14 turnos", "a 16 dias", "modifica sus dias a 14")
      if (!campoDB && (q.includes('dia') || q.includes('dias') || q.includes('turno') || q.includes('turnos'))) {
        const matchDias = q.match(/(?:a|por|ponle|con|de|=|:)\s*([0-9]{1,2})\s*(?:dias?|turnos?)?/i) || q.match(/\b([0-9]{1,2})\s*(?:dias|turnos)\b/i);
        if (matchDias) {
          const valNum = parseInt(matchDias[1], 10);
          if (valNum >= 1 && valNum <= 31) {
            campoDB = 'dias_turno_nomina';
            campoLabel = 'Días de Turno en Nómina';
            valorNuevo = valNum;
          }
        }
      }

      // 2. Identificar al trabajador
      let trabajadorEncontrado: any = null;

      // Extraer palabras de la consulta ignorando verbos, pronombres, palabras de control, cargos y bancos
      const palabrasControl = new Set([
        'cambia', 'cambiar', 'cambiale', 'cambiales', 'cambiame', 'cambialo', 'cambiala', 'cambielos', 'cambielas', 'cambielo', 'cambiela', 'cambien', 'cambienlo',
        'actualiza', 'actualizar', 'actualizale', 'actualizame', 'actualizalo', 'actualizala', 'actualicelo', 'actualicela',
        'modifica', 'modificar', 'modificale', 'modificame', 'modificalo', 'modificala', 'modifiquelo', 'modifiquela',
        'edita', 'editar', 'editale', 'editame', 'editalo', 'editala', 'editele', 'editelo',
        'ponle', 'pon', 'poner', 'ponme', 'ponlo', 'ponla', 'pongale', 'pongalo', 'pongala',
        'asigna', 'asignar', 'asignale', 'asignalor', 'asignalo', 'asignala', 'asigne',
        'fija', 'fijar', 'fijale', 'fijalo', 'fijala',
        'ajusta', 'ajustar', 'ajustale', 'ajustalo', 'ajustala',
        'pasa', 'pasar', 'pasale', 'pasalo', 'pasala', 'paselos', 'paselas', 'paselo', 'pasela', 'pasen', 'pasenlo',
        'mueve', 'mover', 'muevelo', 'muevela', 'muevele', 'traslada', 'trasladar', 'trasladalo', 'trasladala',
        'la', 'el', 'los', 'las', 'a', 'al', 'de', 'del', 'en', 'por', 'para',
        'cuenta', 'cta', 'cuneta', 'cedula', 'cc', 'documento', 'banco', 'turno', 'tarifa',
        'hora', 'extra', 'adicional', 'parqueadero', 'cargo', 'datos', 'etc', 'asi', 'un',
        'una', 'su', 'nuevo', 'nueva', 'favor', 'dime', 'quiero', 'que',
        // Cargos y parqueaderos
        'guabinas', 'mayorista', 'carton', 'guacanda', 'tercera', 'rozo', 'bolivar', 'remesas',
        'administracion', 'contratistas',
        // Bancos
        'bancolombia', 'nequi', 'daviplata', 'davivienda', 'villas', 'bbva', 'bogota', 'popular', 'social', 'efectivo', 'transferencia'
      ]);

      const tokensNombre = q.split(/\s+/).filter(w => w.length >= 3 && !palabrasControl.has(w) && !/^\d+$/.test(w));

      if (tokensNombre.length > 0) {
        const candidatos = todosTrabajadores.map(t => {
          const tNorm = t.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          let score = 0;

          if (tokensNombre.every(tk => tNorm.includes(tk))) {
            score = 100 + tokensNombre.length * 10;
          } else {
            const palabrasTrabajador = tNorm.split(/\s+/).filter((w: string) => w.length >= 3);
            for (const tk of tokensNombre) {
              if (palabrasTrabajador.includes(tk)) {
                score += 20;
              } else {
                // Tolerancia a 1 letra de diferencia (dedazo como perdro -> pedro)
                for (const pw of palabrasTrabajador) {
                  if (Math.abs(pw.length - tk.length) <= 1) {
                    let diff = 0;
                    const minLen = Math.min(pw.length, tk.length);
                    for (let i = 0; i < minLen; i++) {
                      if (pw[i] !== tk[i]) diff++;
                    }
                    diff += Math.abs(pw.length - tk.length);
                    if (diff <= 1) {
                      score += 15;
                      break;
                    }
                  }
                }
              }
            }
          }

          return { t, score };
        }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);

        if (candidatos.length > 0 && candidatos[0].score >= 15) {
          trabajadorEncontrado = candidatos[0].t;
        }
      }

      // Prioridad por cédula si no se encontró por nombre
      if (!trabajadorEncontrado) {
        const cedulaEnQuery = q.match(/\b\d{6,11}\b/);
        if (cedulaEnQuery && campoDB !== 'cedula') {
          trabajadorEncontrado = todosTrabajadores.find(t => String(t.cedula).trim() === cedulaEnQuery[0]);
        }
      }

      // Prioridad por memoria de contexto: si el usuario no dijo el nombre pero venía hablando de alguien
      if (!trabajadorEncontrado && context?.ultimoTrabajador) {
        trabajadorEncontrado = todosTrabajadores.find(t =>
          String(t.cedula).trim() === String(context.ultimoTrabajador.cedula).trim() ||
          t.id === context.ultimoTrabajador.id
        ) || context.ultimoTrabajador;
      }

      // CASO A: Si no hay trabajador identificado pero sí se indicó un campo/valor a cambiar
      // (Ej: "cambia aparquedero a guabinas" sin contexto previo)
      if (!trabajadorEncontrado) {
        if (campoDB && valorNuevo !== null) {
          let promptQuien = '';
          if (campoDB === 'cargo') {
            promptQuien = `🏢 Entendí que deseas cambiar el parqueadero a **${valorNuevo}**.\n\n¿A qué persona o trabajador deseas pasarlo a **${valorNuevo}**? (Ej: escribe *"a Donella"*, *"a Carlos"*, o *"pasa a Diana a ${valorNuevo}"*).`;
          } else if (campoDB === 'numero_cuenta') {
            promptQuien = `💳 Entendí que deseas registrar la cuenta **\`${valorNuevo}\`**.\n\n¿A qué trabajador le asigno este número de cuenta? (Ej: *"a Juan Pedro"*, *"a Donella"*...).`;
          } else if (campoDB === 'forma_pago') {
            promptQuien = `🏦 Entendí que deseas cambiar la forma de pago a **${valorNuevo}**.\n\n¿A qué trabajador deseas asignarle **${valorNuevo}**? (Ej: *"a Carlos"*, *"a Donella"*...).`;
          } else if (campoDB === 'valor_turno') {
            promptQuien = `💰 Entendí que deseas actualizar la tarifa de turno a **${fmt(valorNuevo)}**.\n\n¿A qué trabajador deseas aplicársela?`;
          } else if (campoDB === 'cedula') {
            promptQuien = `🆔 Entendí que deseas registrar la cédula **\`${valorNuevo}\`**.\n\n¿A qué trabajador pertenece?`;
          }

          if (promptQuien) {
            return {
              text: promptQuien,
              nuevoContexto: {
                campoPendiente: {
                  campo: campoDB,
                  campoLabel: campoLabel,
                  valorNuevo: valorNuevo
                }
              }
            };
          }
        }
      }

      // CASO B: Trabajador identificado
      if (trabajadorEncontrado) {
        const enNomina = (historial || []).find(h => String(h.persona?.cedula || '').trim() === String(trabajadorEncontrado.cedula).trim());

        // B.1 Se especificó campo y nuevo valor
        if (campoDB && valorNuevo !== null) {
          if (campoDB === 'dias_turno_nomina') {
            if (!enNomina) {
              return {
                text: `ℹ️ **${trabajadorEncontrado.nombre}** no se encuentra actualmente en el cuadro de nómina activa.\n\n` +
                  `• Si deseas ingresarlo con **${valorNuevo} turnos**, puedes pedirme:\n` +
                  `  *"Liquida a ${trabajadorEncontrado.nombre.split(' ')[0]} con ${valorNuevo} turnos"*`
              };
            }

            const diasActuales = Number(enNomina.form?.diasTurno || enNomina.form?.turnos || 0);
            if (diasActuales === valorNuevo) {
              return {
                text: `ℹ️ **${trabajadorEncontrado.nombre}** ya tiene asignados exactamente **${valorNuevo} turnos** en el cuadro de nómina. No es necesario realizar cambios.`,
                acciones: [
                  {
                    label: `📍 Ubicar a ${trabajadorEncontrado.nombre.split(' ')[0]} en la tabla`,
                    tipo: 'DESPLAZAR_TABLA',
                    payload: { cedula: trabajadorEncontrado.cedula, nombre: trabajadorEncontrado.nombre }
                  }
                ]
              };
            }

            const valorTurno = Number(enNomina.persona?.valorTurno) || 0;
            const subtotalTurnos = valorNuevo * valorTurno;
            const horasAdic = Number(enNomina.form?.horasAdicionales || 0) * (Number(enNomina.persona?.valorHoraAdicional) || 0);
            const bono = Number(enNomina.form?.bono || 0);
            const arl = !enNomina.sinARL && valorNuevo > 0 ? calcularDescuentoARLPila(valorNuevo) : 0;
            const prestamo = Number(enNomina.form?.valorDescuentoPrestamo || 0);
            const nuevoNeto = (subtotalTurnos + horasAdic + bono + arl) - (arl + prestamo);

            return {
              text: `📍 *Te he ubicado en la fila de ${trabajadorEncontrado.nombre} en la tabla.*\n\n` +
                `📝 **Solicitud de Modificación de Días de Turno**:\n\n` +
                `• 👤 **Trabajador**: **${trabajadorEncontrado.nombre}** (C.C. \`${trabajadorEncontrado.cedula}\`)\n` +
                `• 🏢 **Parqueadero**: ${trabajadorEncontrado.cargo || 'General'}\n` +
                `• ⚠️ **Días actuales**: ${diasActuales} turnos (Neto: ${fmt(enNomina.resultado?.neto || 0)})\n` +
                `• ✨ **Nuevos días solicitados**: **${valorNuevo} turnos** (Nuevo Neto estimado: **${fmt(nuevoNeto)}**)\n\n` +
                `*Presiona el botón a continuación para aplicar el cambio y sincronizar el cuadro:*`,
              acciones: [
                {
                  label: `⚡ Confirmar cambio a ${valorNuevo} turnos (${fmt(nuevoNeto)})`,
                  tipo: 'MODIFICAR_TURNOS',
                  payload: {
                    historialId: enNomina.id,
                    nombre: trabajadorEncontrado.nombre,
                    cedula: trabajadorEncontrado.cedula,
                    nuevosDias: valorNuevo
                  }
                },
                {
                  label: `✏️ Abrir editor en tabla`,
                  tipo: 'EDITAR_EN_TABLA',
                  payload: { cedula: trabajadorEncontrado.cedula, nombre: trabajadorEncontrado.nombre }
                },
                {
                  label: `📍 Ubicar en tabla`,
                  tipo: 'DESPLAZAR_TABLA',
                  payload: { cedula: trabajadorEncontrado.cedula, nombre: trabajadorEncontrado.nombre }
                }
              ],
              nuevoContexto: {
                ultimoTrabajador: trabajadorEncontrado,
                campoPendiente: undefined
              }
            };
          }

          if (trabajadorEncontrado[campoDB] === valorNuevo) {
            const valorActualFmt = typeof valorNuevo === 'number' ? fmt(valorNuevo) : `\`${valorNuevo}\``;
            return {
              text: `ℹ️ **${trabajadorEncontrado.nombre}** ya tiene registrado ese mismo dato en **${campoLabel}** (${valorActualFmt}). No es necesario realizar ningún cambio.`,
              acciones: [
                {
                  label: `📍 Ubicar a ${trabajadorEncontrado.nombre.split(' ')[0]} en la tabla`,
                  tipo: 'DESPLAZAR_TABLA',
                  payload: {
                    cedula: trabajadorEncontrado.cedula,
                    nombre: trabajadorEncontrado.nombre
                  }
                }
              ],
              nuevoContexto: {
                ultimoTrabajador: trabajadorEncontrado,
                campoPendiente: undefined
              }
            };
          }

          const valorAnteriorFmt = typeof trabajadorEncontrado[campoDB] === 'number'
            ? fmt(trabajadorEncontrado[campoDB] || 0)
            : (trabajadorEncontrado[campoDB] ? `\`${trabajadorEncontrado[campoDB]}\`` : '*Sin registrar*');

          const valorNuevoFmt = typeof valorNuevo === 'number'
            ? fmt(valorNuevo)
            : `\`${valorNuevo}\``;

          const valorNuevoBoton = typeof valorNuevo === 'number'
            ? fmt(valorNuevo)
            : valorNuevo;

          return {
            text: `📍 *Te he ubicado en la fila de ${trabajadorEncontrado.nombre} en la tabla.*\n\n` +
              `📝 **Solicitud de Modificación de Datos:**\n\n` +
              `• 👤 **Trabajador**: **${trabajadorEncontrado.nombre}** (C.C. \`${trabajadorEncontrado.cedula}\`)\n` +
              `• 🏢 **Parqueadero**: ${trabajadorEncontrado.cargo || 'No asignado'}\n` +
              `• 🔄 **Campo a modificar**: **${campoLabel}**\n` +
              `• ⚠️ **Valor actual**: ${valorAnteriorFmt}\n` +
              `• ✨ **Nuevo valor**: ${valorNuevoFmt}\n\n` +
              `*Presiona el botón a continuación para aplicar el cambio:*`,
            acciones: [
              {
                label: `⚡ Confirmar cambio: ${campoLabel} → ${valorNuevoBoton}`,
                tipo: 'MODIFICAR_DATO',
                payload: {
                  trabajadorId: trabajadorEncontrado.id,
                  nombre: trabajadorEncontrado.nombre,
                  campo: campoDB,
                  campoLabel: campoLabel,
                  valorNuevo: valorNuevo,
                  valorAnterior: trabajadorEncontrado[campoDB],
                  cedulaAnterior: trabajadorEncontrado.cedula
                }
              },
              {
                label: `📍 Ubicar a ${trabajadorEncontrado.nombre.split(' ')[0]} en la tabla`,
                tipo: 'DESPLAZAR_TABLA',
                payload: {
                  cedula: trabajadorEncontrado.cedula,
                  nombre: trabajadorEncontrado.nombre
                }
              }
            ],
            nuevoContexto: {
              ultimoTrabajador: trabajadorEncontrado,
              campoPendiente: undefined
            }
          };
        }

        // B.2 Se identificó al trabajador pero no el campo a cambiar
        const turnos = enNomina ? (enNomina.form?.diasTurno || 0) : 0;
        const neto = enNomina ? (enNomina.resultado?.neto || 0) : 0;
        const estadoIcon = enNomina ? (enNomina.estado === 'Pagado' ? '✅ Pagado' : '⏳ Pendiente') : '';

        return {
          text: `📍 **He ubicado a ${trabajadorEncontrado.nombre} en la tabla.**\n\n` +
            `👤 **Datos actuales de ${trabajadorEncontrado.nombre}**:\n` +
            `• 🆔 **Cédula**: \`${trabajadorEncontrado.cedula}\`\n` +
            `• 🏢 **Parqueadero**: ${trabajadorEncontrado.cargo || 'No asignado'}\n` +
            `• 💳 **Forma de Pago**: ${trabajadorEncontrado.forma_pago || 'No definida'} | **Cuenta**: ${trabajadorEncontrado.numero_cuenta ? `\`${trabajadorEncontrado.numero_cuenta}\`` : '*Sin registrar*'}\n` +
            `• 💰 **Tarifas**: Turno ${fmt(trabajadorEncontrado.valor_turno || 0)} | Hora Extra ${fmt(trabajadorEncontrado.valor_hora_adicional || 0)}\n` +
            (enNomina ? `• 📊 **Estado en Nómina**: **${turnos} turnos** → **${fmt(neto)}** (${estadoIcon})\n\n` : '\n') +
            `💬 **¿Qué dato deseas cambiarle? Puedes pedirme por ejemplo:**\n` +
            `• *"Cámbiale la cuenta a [número]"*\n` +
            `• *"Cámbiale la cédula a [número]"*\n` +
            `• *"Cambia su banco a Bancolombia"* (o Nequi, Daviplata, etc.)\n` +
            `• *"Actualiza su turno a 40000"*\n` +
            `• *"Pásalo al parqueadero Carton C"*\n\n` +
            `*(También puedes presionar el botón de abajo para abrir la edición directamente en su fila de la tabla).*`,
          acciones: [
            {
              label: `✏️ Abrir editor de ${trabajadorEncontrado.nombre.split(' ')[0]} en tabla`,
              tipo: 'EDITAR_EN_TABLA',
              payload: {
                cedula: trabajadorEncontrado.cedula,
                nombre: trabajadorEncontrado.nombre
              }
            },
            {
              label: `📍 Ubicar a ${trabajadorEncontrado.nombre.split(' ')[0]} en la tabla`,
              tipo: 'DESPLAZAR_TABLA',
              payload: {
                cedula: trabajadorEncontrado.cedula,
                nombre: trabajadorEncontrado.nombre
              }
            }
          ],
          nuevoContexto: {
            ultimoTrabajador: trabajadorEncontrado,
            campoPendiente: undefined
          }
        };
      }
    }
  }

  // ── 1. CÓMO SE CALCULA / FÓRMULAS ──────────────────────────────────────────
  if (q.includes('como se calcula') || q.includes('formula') || q.includes('calcular turno') || q.includes('horas extra') || q.includes('horas adicionales')) {
    return {
      text: `🧮 **Fórmulas del Sistema de Liquidación Fundamiga**:\n\n` +
        `• **Subtotal Turnos**: \`Días Turno × Valor del Turno\`\n` +
        `• **Subtotal Turnos Adicionales**: \`Turnos Adicionales × Valor del Turno\`\n` +
        `• **Subtotal Horas Adicionales**: \`Horas Adicionales × Valor Hora\` (usualmente \`Valor Turno ÷ 8\`)\n` +
        `• **Total Bruto**: \`Turnos + Turnos Adic. + Horas Adic. + Bono + ARL\`\n` +
        `• **Total Descuentos**: \`Descuento ARL (PILA) + Descuento Préstamo/Aportes\`\n` +
        `• **Neto a Pagar**: \`Total Bruto − Total Descuentos\`\n\n` +
        `💡 *Nota: El valor de ARL se suma en el bruto y se descuenta exactamente igual en los descuentos para reflejar la cotización sin alterar el neto de los turnos laborados.*`
    };
  }

  // ── 2. CONSULTAS DEL CUADRO DE NÓMINA EN VIVO ──────────────────────────────
  const cargosConocidos = [
    'CONTRATISTAS DE ADMINISTRACION', '5 - 6', '6 - 6', 'CARTON C', 'GUACANDA',
    'TERCERA', 'ROZO', '2 - 10', 'MAYORISTA', 'GUABINAS', 'BOLIVAR', 'REMESAS'
  ];
  const cargoMencionadoEnNomina = cargosConocidos.find(c => q.includes(c.toLowerCase()));

  // Palabras clave semánticas para matching flexible y tolerante a dedazos
  const tienePalabraCuantos = /\b(cuant[oa]s?|total|numero\s*de)\b/.test(q);
  const tienePalabraEntidad = /\b(personas?|gente|trabajadores?|empleados?|liquidad[oa]s?|registros?)\b/.test(q);
  const tienePalabraLugar = /\b(tabla|cuadro|nomina|informe|planilla|lista|sistema)\b/.test(q);
  const tienePalabraAccion = /\b(llevo|llevamos|van|hay|metid[oa]s?|ingresad[oa]s?|registrad[oa]s?)\b/.test(q);
  const tienePalabraQuienes = /\b(quien|quienes|cuales)\b/.test(q);
  const tienePalabraEstar = /\b(van|estan|llevo|llevamos|meti|metidos|ingrese|ingresados|liquide|liquidados|tengo|hay)\b/.test(q);
  const tienePalabraFaltar = /\b(falta|faltan|faltante|faltantes)\b/.test(q);

  // 2.1 ¿Ya metí a X? / ¿Está X en la nómina?
  const esPreguntaYaIngresado =
    /\b(ya\s*(meti|ingrese|liquide|agregue|esta|aparece))\b/.test(q) ||
    /\b(esta\s*en\s*la\s*(nomina|tabla|cuadro|lista))\b/.test(q) ||
    /\b(aparece\s*en\s*la\s*(nomina|tabla|cuadro|lista))\b/.test(q) ||
    (q.includes('esta en la nomina') || q.includes('esta en el cuadro') || q.includes('esta en la tabla'));

  if (esPreguntaYaIngresado) {
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');
    const { data: trabajadores } = await supabase.from('trabajadores').select('*');

    const palabrasIgnoradas = new Set([
      'ya', 'meti', 'metido', 'ingrese', 'ingresado', 'ingresada', 'liquide', 'liquidado',
      'agregue', 'agregado', 'esta', 'en', 'la', 'el', 'nomina', 'cuadro', 'lista', 'de',
      'a', 'al', 'o', 'y', 'por', 'favor', 'dime', 'si', 'aparece', 'persona', 'tabla'
    ]);

    const tokens = q.split(/\s+/).filter(t => t.length >= 3 && !palabrasIgnoradas.has(t));

    if (tokens.length > 0) {
      const enNomina = (historial || []).find(h => {
        const nom = (h.persona?.nombre || '').toLowerCase();
        const ced = (h.persona?.cedula || '').toLowerCase();
        return tokens.some(tk => nom.includes(tk) || ced.includes(tk));
      });

      if (enNomina) {
        const turnos = enNomina.form?.diasTurno || 0;
        const horas = enNomina.form?.horasAdicionales || 0;
        const neto = enNomina.resultado?.neto || 0;
        const estado = enNomina.estado || 'Pendiente';
        const estadoIcon = estado === 'Pagado' ? '✅ Pagado' : '⏳ Pendiente de pago';

        return {
          text: `✅ **Sí, ${enNomina.persona?.nombre} ya está en el cuadro de nómina.**\n\n` +
            `• 👤 **Cédula**: \`${enNomina.persona?.cedula}\`\n` +
            `• 🏢 **Parqueadero**: ${enNomina.persona?.cargo || 'No asignado'}\n` +
            `• 📅 **Días turno liquidados**: **${turnos} días**\n` +
            (horas > 0 ? `• ⏱️ **Horas adicionales**: ${horas} hrs\n` : '') +
            `• 💵 **Neto a pagar**: **${fmt(neto)}**\n` +
            `• 📌 **Estado**: ${estadoIcon}\n` +
            `• 💳 **Forma de pago**: ${enNomina.persona?.formaPago || 'No definida'} (${enNomina.persona?.numeroCuenta || 'Sin cuenta'})`,
          acciones: [
            {
              label: `📍 Ubicar a ${enNomina.persona?.nombre.split(' ')[0]} en la tabla`,
              tipo: 'DESPLAZAR_TABLA',
              payload: {
                cedula: enNomina.persona?.cedula,
                nombre: enNomina.persona?.nombre
              }
            }
          ],
          nuevoContexto: {
            ultimoTrabajador: (trabajadores || []).find(t => String(t.cedula).trim() === String(enNomina.persona?.cedula || '').trim()) || {
              nombre: enNomina.persona?.nombre,
              cedula: enNomina.persona?.cedula,
              cargo: enNomina.persona?.cargo,
              forma_pago: enNomina.persona?.formaPago,
              numero_cuenta: enNomina.persona?.numeroCuenta,
              valor_turno: enNomina.persona?.valorTurno,
              valor_hora_adicional: enNomina.persona?.valorHoraAdicional
            },
            campoPendiente: undefined
          }
        };
      }

      const enTrabajadores = (trabajadores || []).find(t => {
        const nom = (t.nombre || '').toLowerCase();
        const ced = (t.cedula || '').toLowerCase();
        return tokens.some(tk => nom.includes(tk) || ced.includes(tk));
      });

      if (enTrabajadores) {
        return {
          text: `❌ **No, ${enTrabajadores.nombre} (C.C. \`${enTrabajadores.cedula}\`) aún NO ha sido ingresado en la nómina.**\n\n` +
            `• 🏢 **Parqueadero / Cargo**: ${enTrabajadores.cargo || 'No asignado'}\n` +
            `• 💰 **Valor de Turno registrado**: ${fmt(enTrabajadores.valor_turno || 0)}\n` +
            `• 💳 **Forma de Pago**: ${enTrabajadores.forma_pago || 'No definida'}\n\n` +
            `💡 *Puedes liquidarlo seleccionándolo en el formulario de la pantalla.*`,
          nuevoContexto: {
            ultimoTrabajador: enTrabajadores,
            campoPendiente: undefined
          }
        };
      }

      return {
        text: `🔍 No encontré a nadie con los términos *" ${tokens.join(' ')}"* ni en la nómina activa ni en la lista de trabajadores de Fundamiga.`
      };
    }
  }

  // 2.2 ¿Quién fue el último ingresado? / ¿Últimos que metí?
  const esPreguntaUltimos =
    q.includes('ultimo que meti') || q.includes('a quien meti de ultimo') ||
    q.includes('ultimos ingresados') || q.includes('ultimas personas') ||
    q.includes('ultimo ingresado') || q.includes('ultimos agregados') ||
    q.includes('quien fue el ultimo');

  if (esPreguntaUltimos) {
    const { data: historial } = await supabase
      .from('historial_liquidaciones')
      .select('*')
      .order('creado_at', { ascending: false });

    if (!historial || historial.length === 0) {
      return { text: `📋 Aún no has ingresado a ninguna persona al cuadro de nómina.` };
    }

    const ultimos = historial.slice(0, 5);
    let txt = `🕒 **Últimas personas ingresadas al cuadro (${ultimos.length})**:\n\n`;

    ultimos.forEach((item, idx) => {
      txt += `${idx + 1}. 👤 **${item.persona?.nombre}** (${item.persona?.cargo || 'General'})\n` +
        `   • Turnos: **${item.form?.diasTurno || 0} días** | Neto: **${fmt(item.resultado?.neto || 0)}** | Estado: *${item.estado || 'Pendiente'}*\n`;
    });

    return { text: txt.trim() };
  }

  // 2.3 ¿Quiénes faltan por liquidar / ingresar?
  const esPreguntaFaltan =
    tienePalabraFaltar ||
    q.includes('quienes faltan') || q.includes('quien falta') ||
    q.includes('quienes no estan') || q.includes('falta por meter') ||
    q.includes('faltan por meter') || q.includes('faltan por liquidar') ||
    q.includes('faltan por ingresar') || q.includes('quien no esta');

  if (esPreguntaFaltan) {
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');
    const { data: trabajadores } = await supabase.from('trabajadores').select('*').order('nombre');

    if (!trabajadores || trabajadores.length === 0) {
      return { text: `No hay trabajadores registrados en la base de datos.` };
    }

    const cedulasLiquidadas = new Set((historial || []).map(h => String(h.persona?.cedula || '').trim()));
    let faltantes = trabajadores.filter(t => !cedulasLiquidadas.has(String(t.cedula || '').trim()));

    if (cargoMencionadoEnNomina) {
      faltantes = faltantes.filter(t => t.cargo === cargoMencionadoEnNomina);
    }

    if (faltantes.length === 0) {
      return {
        text: `🎉 **¡Excelente! No falta ningún trabajador por liquidar**` +
          (cargoMencionadoEnNomina ? ` en **${cargoMencionadoEnNomina}**.` : `.\n\nTodos los ${trabajadores.length} trabajadores registrados en el sistema ya están en el cuadro de nómina.`)
      };
    }

    const agrupadosPorCargo: Record<string, typeof faltantes> = {};
    for (const f of faltantes) {
      const c = f.cargo || 'SIN PARQUEADERO';
      if (!agrupadosPorCargo[c]) agrupadosPorCargo[c] = [];
      agrupadosPorCargo[c].push(f);
    }

    let txt = `⏳ **Faltan por ingresar ${faltantes.length} trabajador(es)**` +
      (cargoMencionadoEnNomina ? ` en **${cargoMencionadoEnNomina}**` : ` (Llevas ${historial?.length || 0} de ${trabajadores.length})`) +
      `:\n\n`;

    Object.entries(agrupadosPorCargo).forEach(([cargo, lista]) => {
      txt += `🏢 **${cargo}** (${lista.length}):\n`;
      lista.forEach(t => {
        txt += `   • **${t.nombre}** (C.C. \`${t.cedula}\`) — Turno: ${fmt(t.valor_turno || 0)}\n`;
      });
      txt += `\n`;
    });

    return { text: txt.trim() };
  }

  // 2.4 ¿Quiénes van? / ¿A quiénes he metido? / ¿Quiénes están?
  const esPreguntaQuienesVan =
    (tienePalabraQuienes && (tienePalabraEstar || tienePalabraLugar)) ||
    q.includes('quienes van') || q.includes('quienes estan') ||
    q.includes('a quienes he metido') || q.includes('quienes llevo') ||
    q.includes('a quienes meti') || q.includes('quienes ya meti') ||
    q.includes('lista de ingresados') || q.includes('personas ingresadas') ||
    q.includes('quienes tengo') || q.includes('a quien llevo') ||
    (q.includes('quienes') && (q.includes('cuadro') || q.includes('tabla') || q.includes('nomina')));

  if (esPreguntaQuienesVan) {
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');

    if (!historial || historial.length === 0) {
      return {
        text: `📋 **El cuadro de nómina está vacío actualmente.**\n\nNo has ingresado a ninguna persona todavía. Puedes seleccionarlos en el formulario para empezar a liquidar.`
      };
    }

    let listaItems = historial;
    if (cargoMencionadoEnNomina) {
      listaItems = historial.filter(h => h.persona?.cargo === cargoMencionadoEnNomina);
      if (listaItems.length === 0) {
        return {
          text: `ℹ️ Aún no has ingresado a ningún trabajador del parqueadero **${cargoMencionadoEnNomina}** en el cuadro de nómina.`
        };
      }
    }

    const agrupadosPorCargo: Record<string, typeof listaItems> = {};
    for (const item of listaItems) {
      const c = item.persona?.cargo || 'SIN PARQUEADERO';
      if (!agrupadosPorCargo[c]) agrupadosPorCargo[c] = [];
      agrupadosPorCargo[c].push(item);
    }

    const totalNetoParcial = listaItems.reduce((acc, i) => acc + (i.resultado?.neto || 0), 0);

    let txt = `👥 **Personas ingresadas al cuadro (${listaItems.length} trabajadores)**:\n\n`;

    Object.entries(agrupadosPorCargo).forEach(([cargo, lista]) => {
      txt += `🏢 **${cargo}** (${lista.length}):\n`;
      lista.forEach(i => {
        const turnos = i.form?.diasTurno || 0;
        const neto = i.resultado?.neto || 0;
        const estadoBadge = i.estado === 'Pagado' ? '✅' : '⏳';
        txt += `   • **${i.persona?.nombre}**: ${turnos} turnos → **${fmt(neto)}** ${estadoBadge}\n`;
      });
      txt += `\n`;
    });

    txt += `💰 **Total Neto de este grupo**: **${fmt(totalNetoParcial)}**`;
    return { text: txt };
  }

  // 2.5 ¿Cuántos llevo? / ¿Cómo va la nómina? / Resumen general del cuadro / Informe ejecutivo
  const esPeticionResumenOInforme =
    (tienePalabraCuantos && (tienePalabraEntidad || tienePalabraLugar || tienePalabraAccion)) ||
    (/\b(resumen|informe|reporte|estado)\b/i.test(q) && (
      q.includes('nomina') || q.includes('cuadro') || q.includes('tabla') || q.includes('liquidacion') ||
      q.includes('general') || q.includes('rapido') || q.includes('rapida') || q.includes('como va') ||
      q.includes('como vamos') || q.includes('actual') || q.includes('hoy') || q.trim() === 'resumen' ||
      q.trim() === 'informe' || q.trim() === 'reporte' || q.includes('dame un resumen') || q.includes('dame un informe')
    )) ||
    /\b(como\s*va\s*(la|el)?\s*(nomina|cuadro|tabla))\b/i.test(q) ||
    /\b(como\s*vamos\s*(en|con)?\s*(la|el)?\s*(nomina|cuadro|tabla)?)\b/i.test(q) ||
    q.includes('cuantos llevo') || q.includes('cuantas personas van') ||
    q.includes('cuantos van') || q.includes('como voy') ||
    q.includes('cuantos hay en la nomina') || q.includes('cuantos ingresados') ||
    q.includes('cuantos metidos') || q.includes('informacion rapida') ||
    q.includes('resumen nomina') || q.includes('nomina actual') ||
    q.includes('informe liquidacion') || q.includes('total pagado') ||
    q.includes('total pendiente') || (q.includes('resumen') && !q.includes('remesa')) ||
    (q.includes('informe') && !q.includes('remesa') && !q.includes('arl'));

  if (esPeticionResumenOInforme) {
    const { data: historial, error } = await supabase.from('historial_liquidaciones').select('*').order('creado_at', { ascending: false });
    const { data: todosTrabajadores } = await supabase.from('trabajadores').select('id, nombre, cedula, cargo');

    if (error) return { text: `❌ Error al consultar la nómina en Supabase: ${error.message}` };

    if (!historial || historial.length === 0) {
      return {
        text: `📋 **Informe y Resumen en Vivo del Cuadro de Nómina**:\n\n` +
          `Actualmente no hay ninguna liquidación registrada en el cuadro activo.\n` +
          `• **Trabajadores registrados en sistema**: ${todosTrabajadores?.length || 0}\n` +
          `• **Liquidaciones en tabla**: 0\n\n` +
          `💡 *Puedes empezar liquidando al primer trabajador escribiendo por ejemplo:*\n` +
          `• *"Liquida a [Nombre] con 15 turnos"*`,
        acciones: [
          {
            label: `⏳ Ver quiénes están disponibles para liquidar`,
            tipo: 'CONSULTAR_DETALLE',
            payload: '¿Quiénes faltan por liquidar?'
          }
        ]
      };
    }

    const totalRegistros = historial.length;
    const totalDisponibles = todosTrabajadores?.length || 0;
    const pct = totalDisponibles > 0 ? Math.round((totalRegistros / totalDisponibles) * 100) : 0;

    const totalNeto = historial.reduce((acc, i) => acc + (Number(i.resultado?.neto) || 0), 0);
    const pagados = historial.filter(i => i.estado === 'Pagado');
    const pendientes = historial.filter(i => i.estado !== 'Pagado');
    const totalPagado = pagados.reduce((acc, i) => acc + (Number(i.resultado?.neto) || 0), 0);
    const totalPendiente = pendientes.reduce((acc, i) => acc + (Number(i.resultado?.neto) || 0), 0);
    const totalTurnos = historial.reduce((acc, i) => acc + (Number(i.form?.diasTurno || i.form?.turnos) || 0), 0);
    const totalHoras = historial.reduce((acc, i) => acc + (Number(i.form?.horasAdicionales) || 0), 0);
    const totalArl = historial.reduce((acc, i) => acc + (Number(i.resultado?.descuentoSeguridad) || 0), 0);
    const totalPrestamos = historial.reduce((acc, i) => acc + (Number(i.resultado?.descuentoPrestamo) || 0), 0);

    // Agrupación por Parqueadero / Cargo
    const conteoParqueaderos: Record<string, { count: number; neto: number }> = {};
    for (const item of historial) {
      const cargo = (item.persona?.cargo || 'General').toUpperCase().trim();
      if (!conteoParqueaderos[cargo]) {
        conteoParqueaderos[cargo] = { count: 0, neto: 0 };
      }
      conteoParqueaderos[cargo].count++;
      conteoParqueaderos[cargo].neto += Number(item.resultado?.neto) || 0;
    }

    const listaParqueaderos = Object.entries(conteoParqueaderos)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([cargo, data]) => `  • **${cargo}**: ${data.count} personas (${fmt(data.neto)})`)
      .slice(0, 6);

    // Agrupación por Banco / Método de pago
    const conteoBancos: Record<string, { count: number; neto: number }> = {};
    for (const item of historial) {
      const banco = (item.persona?.formaPago || item.persona?.forma_pago || 'Efectivo').trim();
      if (!conteoBancos[banco]) {
        conteoBancos[banco] = { count: 0, neto: 0 };
      }
      conteoBancos[banco].count++;
      conteoBancos[banco].neto += Number(item.resultado?.neto) || 0;
    }

    const listaBancos = Object.entries(conteoBancos)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([banco, data]) => `  • **${banco}**: ${data.count} pers. (${fmt(data.neto)})`)
      .slice(0, 5);

    const ultimo = historial[0];
    const faltantes = Math.max(0, totalDisponibles - totalRegistros);

    const reportText =
      `📊 **Informe Ejecutivo y Resumen en Vivo de la Nómina**:\n\n` +
      `• 👥 **Progreso**: **${totalRegistros} trabajadores ingresados**` + (totalDisponibles > 0 ? ` de ${totalDisponibles} registrados (**${pct}%**)` : '') + `\n` +
      `• 📅 **Días turno liquidados**: **${totalTurnos} días**` + (totalHoras > 0 ? ` | Horas extra: **${totalHoras} hrs**` : '') + `\n` +
      `• 💰 **Total Neto Nómina**: **${fmt(totalNeto)}**\n\n` +
      `💵 **Estado de Pagos**:\n` +
      `• ⏳ **Pendiente por pagar**: **${fmt(totalPendiente)}** (${pendientes.length} personas)\n` +
      `• ✅ **Pagado efectivamente**: **${fmt(totalPagado)}** (${pagados.length} personas)\n\n` +
      (listaParqueaderos.length > 0 ? `🏢 **Distribución por Parqueaderos (Top)**:\n${listaParqueaderos.join('\n')}\n\n` : '') +
      (listaBancos.length > 0 ? `💳 **Distribución por Formas de Pago**:\n${listaBancos.join('\n')}\n\n` : '') +
      (totalArl > 0 || totalPrestamos > 0
        ? `🛡️ **Deducciones**: ${totalArl > 0 ? `ARL PILA: ${fmt(totalArl)}` : ''}` + (totalPrestamos > 0 ? ` | Préstamos: ${fmt(totalPrestamos)}` : '') + `\n\n`
        : '') +
      (ultimo ? `🕒 **Última liquidación agregada**: **${ultimo.persona?.nombre}** (${fmt(ultimo.resultado?.neto || 0)})\n` : '') +
      (faltantes > 0 ? `\n⏳ *Faltan por ingresar **${faltantes} personas** a la nómina.*` : `\n🎉 *¡Todos los trabajadores registrados ya están ingresados en la nómina!*`);

    const acciones: ChatAction[] = [];

    if (faltantes > 0) {
      acciones.push({
        label: `⏳ Ver quiénes faltan por liquidar (${faltantes})`,
        tipo: 'CONSULTAR_DETALLE',
        payload: '¿Quiénes faltan por liquidar?'
      });
    }

    acciones.push({
      label: `🛡️ Auditar anomalías del cuadro`,
      tipo: 'CONSULTAR_DETALLE',
      payload: 'Auditar nómina y cuentas repetidas'
    });

    if (pendientes.length > 0) {
      acciones.push({
        label: `🔍 Ver solo los pendientes en tabla (${pendientes.length})`,
        tipo: 'APLICAR_FILTROS',
        payload: { busqueda: '', cargo: '', banco: '' }
      });
    }

    return {
      text: reportText,
      acciones
    };
  }

  // ── 3. CONSULTAS DE SEGURIDAD SOCIAL / ARL ─────────────────────────────────
  const esConsultaARL =
    /\b(arl)\b/i.test(q) ||
    /\b(pila)\b/i.test(q) ||
    q.includes('seguridad social') ||
    q.includes('descuento arl') ||
    q.includes('control arl') ||
    q.includes('modulo arl');

  if (esConsultaARL) {
    // Si pregunta por valores de descuento ARL
    if (q.includes('cuanto es') || q.includes('descuento') || q.includes('tabla')) {
      return {
        text: `🛡️ **Tabla de Descuentos ARL PILA**:\n\n` +
          `• **1 a 7 días**: ${fmt(calcularDescuentoARLPila(5))}\n` +
          `• **8 a 14 días**: ${fmt(calcularDescuentoARLPila(10))}\n` +
          `• **15 a 21 días**: ${fmt(calcularDescuentoARLPila(18))}\n` +
          `• **22 a 30 días (Mes Completo)**: ${fmt(calcularDescuentoARLPila(30))}\n\n` +
          `*El sistema calcula automáticamente los días cotizados y aplica la tarifa correspondiente.*`
      };
    }

    const { count, error } = await supabaseRemesas.from('registros_arl').select('*', { count: 'exact', head: true });
    return {
      text: `🛡️ **Módulo de Control ARL**:\n\n` +
        `• Registros de novedades ARL en sistema: **${count || 0} movimientos**\n` +
        `• Puedes ingresar al módulo **Control ARL** desde la pestaña superior para gestionar altas, bajas y re-ingresos.`
    };
  }

  // ── 4. CONSULTAS DE REMESAS ────────────────────────────────────────────────
  const esConsultaRemesas =
    /\b(remesa|remesas)\b/i.test(q) &&
    (q.includes('personal') || q.includes('control') || q.includes('modulo') || q.includes('tabla') || q.includes('lista') || q.trim() === 'remesas' || q.trim() === 'remesa');

  if (esConsultaRemesas) {
    const { data: trabajadoresRemesas } = await supabase
      .from('trabajadores')
      .select('nombre, cedula, valor_turno, numero_cuenta')
      .eq('cargo', 'REMESAS');

    const lista = (trabajadoresRemesas || []).map(t => `• **${t.nombre}** (CC: ${t.cedula}) - Cuenta: ${t.numero_cuenta || 'Sin cuenta'}`).join('\n');

    return {
      text: `🚚 **Personal Asignado a Remesas** (${trabajadoresRemesas?.length || 0} trabajadores):\n\n` +
        (lista || 'No hay trabajadores con cargo REMESAS actualmente.')
    };
  }

  // ── 5. CONSULTA DE BANCOS / FORMAS DE PAGO ──────────────────────────────────
  const bancosConocidos = ['bancolombia', 'nequi', 'daviplata', 'davivienda', 'bbva', 'banco de bogota', 'banco popular', 'av villas', 'caja social', 'efectivo'];
  const bancoMencionado = bancosConocidos.find(b => q.includes(b));
  if (bancoMencionado && (q.includes('quienes') || q.includes('tienen') || q.includes('cobran') || q.includes('banco') || q.includes('cuenta'))) {
    const { data: trabsBanco } = await supabase
      .from('trabajadores')
      .select('nombre, cedula, cargo, numero_cuenta, forma_pago')
      .ilike('forma_pago', `%${bancoMencionado}%`);

    if (!trabsBanco || trabsBanco.length === 0) {
      return { text: `No se encontraron trabajadores registrados con pago por **${bancoMencionado.toUpperCase()}**.` };
    }

    const lista = trabsBanco.slice(0, 10).map(t => `• **${t.nombre}** - ${t.forma_pago}: \`${t.numero_cuenta || 'Sin número'}\``).join('\n');
    return {
      text: `💳 **Trabajadores con pago en ${bancoMencionado.toUpperCase()}** (${trabsBanco.length} personas):\n\n${lista}` +
        (trabsBanco.length > 10 ? `\n\n*(Mostrando 10 de ${trabsBanco.length})*` : '')
    };
  }

  // ── 5.1 AUDITORÍA DE CUENTAS BANCARIAS REPETIDAS ────────────────────────────
  if (
    q.includes('cuenta repetida') || q.includes('cuentas repetidas') ||
    q.includes('cuenta duplicada') || q.includes('cuentas duplicadas') ||
    q.includes('mismo numero de cuenta') || q.includes('misma cuenta') ||
    q.includes('cuentas compartidas') || q.includes('cuenta compartida') ||
    q.includes('auditar cuentas') || q.includes('auditoria de cuentas') ||
    q.includes('repetidas') || q.includes('duplicadas') ||
    (q.includes('cuenta') && (q.includes('duplicad') || q.includes('repetid') || q.includes('igual')))
  ) {
    const { data: todosTrabajadores, error } = await supabase
      .from('trabajadores')
      .select('id, nombre, cedula, cargo, numero_cuenta, forma_pago');

    if (error) {
      return { text: `Error al consultar la base de datos de trabajadores: ${error.message}` };
    }

    // Normalizar cuentas y agrupar
    const mapaCuentas = new Map<string, typeof todosTrabajadores>();

    for (const trab of (todosTrabajadores || [])) {
      if (trab.forma_pago === 'Efectivo') continue;
      const raw = (trab.numero_cuenta || '').trim();
      const limpia = raw.replace(/[\s\-\.]/g, '');
      // Filtrar números de cuenta válidos
      if (limpia && limpia.length >= 4 && !/^(0+|sin|no|na|none|null)$/i.test(limpia)) {
        if (!mapaCuentas.has(limpia)) {
          mapaCuentas.set(limpia, []);
        }
        mapaCuentas.get(limpia)!.push(trab);
      }
    }

    const duplicadas = Array.from(mapaCuentas.entries()).filter(([_, lista]) => lista.length > 1);

    if (duplicadas.length === 0) {
      return {
        text: `✅ **Auditoría de Cuentas Exitosa**:\n\n` +
          `No se detectaron cuentas bancarias repetidas en el sistema.\n` +
          `Cada trabajador registrado cuenta con un número de cuenta bancaria único.`
      };
    }

    let respuesta = `🚨 **Alerta de Auditoría: Se encontraron ${duplicadas.length} cuenta(s) bancaria(s) compartida(s)**:\n\n`;

    duplicadas.forEach(([cuenta, lista], idx) => {
      respuesta += `**${idx + 1}. No. Cuenta: \`${cuenta}\`** (${lista[0]?.forma_pago || 'Bancaria'})\n`;
      lista.forEach(t => {
        respuesta += `   • 👤 **${t.nombre}** (CC: \`${t.cedula}\`) — Cargo: *${t.cargo || 'No asignado'}*\n`;
      });
      respuesta += `\n`;
    });

    respuesta += `⚠️ *Nota: Verifica si estas personas son familiares que autorizaron el pago a la misma cuenta o si se trata de un error de digitación al crear al trabajador.*`;

    return { text: respuesta.trim() };
  }

  // ── 6. BÚSQUEDA DE TRABAJADOR POR NOMBRE, CÉDULA O CARGO ───────────────────
  const palabrasIgnoradas = new Set([
    'busca', 'buscar', 'dame', 'info', 'informacion', 'telefono', 'correo', 'cedula',
    'de', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'hola', 'buenos', 'dias', 'tardes', 'noches',
    'por', 'favor', 'quien', 'es', 'ver', 'datos', 'trabajador', 'persona', 'personas', 'cuenta', 'cuanto', 'gana',
    'esta', 'estan', 'estara', 'estaran', 'aparece', 'aparecen', 'ya', 'meti', 'metido', 'metida', 'ingrese',
    'ingresado', 'ingresada', 'liquide', 'liquidado', 'agregue', 'agregado', 'en', 'tabla', 'cuadro', 'nomina',
    'planilla', 'lista', 'informe', 'sistema', 'dime', 'saber', 'si', 'que', 'como', 'donde', 'cuando', 'va', 'van',
    'lleva', 'llevan', 'tiene', 'tienen', 'hay', 'pago', 'pagado', 'pagada', 'pendiente', 'pendientes'
  ]);

  const tokens = q
    .replace(/[?¿!¡.,:;]/g, '')
    .split(/\s+/)
    .filter(palabra => palabra.length >= 2 && !palabrasIgnoradas.has(palabra));

  if (tokens.length > 0) {
    let queryAnd = supabase.from('trabajadores').select('*');
    for (const t of tokens) {
      queryAnd = queryAnd.ilike('nombre', `%${t}%`);
    }
    const { data: resAnd } = await queryAnd.limit(5);
    let resultados = resAnd || [];

    // Fallback: si no encontró todos los tokens juntos (ej: orden inverso o segundo nombre no registrado), buscar por token individual
    if (resultados.length === 0 && tokens.length > 1) {
      for (const t of tokens) {
        const { data: resToken } = await supabase
          .from('trabajadores')
          .select('*')
          .ilike('nombre', `%${t}%`)
          .limit(5);
        if (resToken && resToken.length > 0) {
          resultados = resToken;
          break;
        }
      }
    }

    // Fallback: buscar directamente en el historial de nómina
    if (resultados.length === 0) {
      const { data: hist } = await supabase.from('historial_liquidaciones').select('*');
      const histMatches = (hist || []).filter(h => {
        const nom = (h.persona?.nombre || '').toLowerCase();
        return tokens.some(tk => nom.includes(tk));
      });
      if (histMatches.length > 0) {
        resultados = histMatches.slice(0, 5).map(h => ({
          id: h.id,
          nombre: h.persona?.nombre || '',
          cedula: h.persona?.cedula || '',
          cargo: h.persona?.cargo || '',
          valor_turno: h.persona?.valorTurno || 0,
          valor_hora_adicional: h.persona?.valorHoraAdicional || 0,
          forma_pago: h.persona?.formaPago || '',
          numero_cuenta: h.persona?.numeroCuenta || ''
        }));
      }
    }

    // Búsqueda por cédula si son dígitos
    if (resultados.length === 0 && /^\d+$/.test(tokens.join(''))) {
      const { data: resCedula } = await supabase
        .from('trabajadores')
        .select('*')
        .ilike('cedula', `%${tokens.join('')}%`)
        .limit(5);
      resultados = resCedula || [];
    }

    // Búsqueda por cargo / parqueadero
    if (resultados.length === 0) {
      const term = tokens.join(' ');
      const { data: resCargo } = await supabase
        .from('trabajadores')
        .select('*')
        .ilike('cargo', `%${term}%`)
        .limit(8);
      resultados = resCargo || [];
    }

    if (resultados.length > 0) {
      const { data: historial } = await supabase.from('historial_liquidaciones').select('*');

      let respuesta = `🔎 **Información encontrada (${resultados.length})**:\n\n`;
      const accionesList: ChatAction[] = [];

      for (const t of resultados) {
        // Verificar si ya está ingresado en el cuadro de nómina actual
        const enNomina = (historial || []).find(h => String(h.persona?.cedula || '').trim() === String(t.cedula).trim());

        respuesta += `👤 **${t.nombre}** (C.C. \`${t.cedula}\`)\n`;
        respuesta += `   • **Parqueadero / Cargo**: ${t.cargo || 'No asignado'}\n`;

        if (enNomina) {
          const turnos = enNomina.form?.diasTurno || 0;
          const neto = enNomina.resultado?.neto || 0;
          const estadoIcon = enNomina.estado === 'Pagado' ? '✅ Pagado' : '⏳ Pendiente';
          respuesta += `   • 📊 **Estado en Nómina**: **${turnos} turnos** → **${fmt(neto)}** (${estadoIcon})\n`;

          accionesList.push({
            label: `📍 Ubicar a ${t.nombre.split(' ')[0]} en la tabla`,
            tipo: 'DESPLAZAR_TABLA',
            payload: {
              cedula: t.cedula,
              nombre: t.nombre
            }
          });
        } else {
          respuesta += `   • 📊 **Estado en Nómina**: ❌ *Aún no ingresado en el cuadro actual*\n`;
          accionesList.push({
            label: `📍 Ubicar a ${t.nombre.split(' ')[0]} en el sistema`,
            tipo: 'DESPLAZAR_TABLA',
            payload: {
              cedula: t.cedula,
              nombre: t.nombre
            }
          });
        }

        respuesta += `   • **Valor Turno**: ${fmt(t.valor_turno || 0)} | **Hora Extra**: ${fmt(t.valor_hora_adicional || 0)}\n`;
        respuesta += `   • **Forma de Pago**: ${t.forma_pago || 'No definida'}\n`;
        respuesta += `   • **No. Cuenta**: ${t.numero_cuenta ? `\`${t.numero_cuenta}\`` : '⚠️ Sin cuenta registrada'}\n\n`;

        if (t.numero_cuenta) {
          accionesList.push({
            label: `📋 Copiar Cuenta de ${t.nombre.split(' ')[0]}`,
            tipo: 'COPIAR',
            payload: t.numero_cuenta
          });
        }
      }

      return {
        text: respuesta.trim(),
        acciones: accionesList,
        nuevoContexto: {
          ultimoTrabajador: resultados[0],
          campoPendiente: undefined
        }
      };
    }
  }

  // ── 7. RESPUESTA POR DEFECTO ───────────────────────────────────────────────
  return {
    text: `🤖 No encontré resultados para "${query}".\n\n` +
      `Prueba buscando por:\n` +
      `• **Nombre o apellido** (ej: *Carlos*, *Diana Arias*)\n` +
      `• **Cédula** (ej: *1005*)\n` +
      `• **Parqueadero** (ej: *Carton C*, *Guacanda*, *Mayorista*)\n` +
      `• **Consultas**: *"resumen nomina"*, *"tabla ARL"*, *"personal de remesas"*`
  };
}
