import { supabase } from '@/lib/supabase';
import { supabaseRemesas } from '@/lib/supabaseRemesas';
import { calcularDescuentoARLPila } from '@/utils/calcularDescuentoARL';

export interface ChatAction {
  label: string;
  tipo: 'COPIAR' | 'CONSULTAR_DETALLE' | 'CALCULAR_TURNO' | 'MODIFICAR_DATO';
  payload?: any;
}

export interface ChatResponse {
  text: string;
  acciones?: ChatAction[];
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
}): Promise<{ success: boolean; message: string }> {
  try {
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

    const valorMostrar = typeof payload.valorNuevo === 'number'
      ? fmt(payload.valorNuevo)
      : `\`${payload.valorNuevo}\``;

    return {
      success: true,
      message: `✅ **¡Dato actualizado exitosamente en Supabase!**\n\n` +
        `• 👤 **Trabajador**: **${payload.nombre}**\n` +
        `• 🔄 **${payload.campoLabel || payload.campo}**: Guardado como ${valorMostrar}.`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `❌ Error de red o conexión: ${err?.message || 'Error desconocido'}`
    };
  }
}

export async function processAIChatMessage(message: string): Promise<ChatResponse> {
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
  return await processFundamigaQuery(cleanMsg);
}

async function processFundamigaQuery(query: string): Promise<ChatResponse> {
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

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

  // ── 0.1 MODIFICACIÓN DE DATOS (SOLO A PETICIÓN EXPLÍCITA) ───────────────────
  if (
    q.includes('puedes modificar') || q.includes('como modificar') ||
    q.includes('como cambiar datos') || q.includes('puedes cambiar datos') ||
    q.includes('editar datos') || q.includes('modificar datos')
  ) {
    return {
      text: `🛠️ **Sí, puedo buscar y modificar datos del personal rápidamente.**\n\n` +
        `Para proteger la nómina, **solo realizo cambios si tú me lo pides con datos específicos** y siempre te mostraré una vista previa con un botón de confirmación antes de guardar en Supabase.\n\n` +
        `**Ejemplos de lo que puedes pedirme:**\n` +
        `• *"Cambia la cuenta de Carlos a 100523489"*\n` +
        `• *"Actualiza el valor de turno de Diana a 65000"*\n` +
        `• *"Cambia el banco de Juan a Nequi"*\n` +
        `• *"Actualiza la hora adicional de Pedro a 8500"*\n` +
        `• *"Pasa a María al parqueadero Carton C"*`
    };
  }

  const verbosModificar = ['cambia', 'cambiar', 'actualiza', 'actualizar', 'modifica', 'modificar', 'ponle', 'pon', 'asigna', 'asignar', 'fija', 'fijar', 'ajusta', 'ajustar', 'pasa', 'pasar'];
  const esIntentoModificar = verbosModificar.some(v => new RegExp(`\\b${v}\\b`, 'i').test(q));

  if (esIntentoModificar) {
    const { data: todosTrabajadores } = await supabase.from('trabajadores').select('*');

    if (todosTrabajadores && todosTrabajadores.length > 0) {
      // 1. Identificar al trabajador
      let trabajadorEncontrado: any = null;

      // Prioridad 1: Búsqueda por cédula si hay dígitos largos en la consulta
      const cedulaEnQuery = q.match(/\b\d{6,11}\b/);
      if (cedulaEnQuery) {
        trabajadorEncontrado = todosTrabajadores.find(t => t.cedula === cedulaEnQuery[0]);
      }

      // Prioridad 2: Coincidencia por nombre completo o partes de nombre
      if (!trabajadorEncontrado) {
        const candidatos = todosTrabajadores.map(t => {
          const tNorm = t.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          let score = 0;
          if (q.includes(tNorm)) {
            score = 100;
          } else {
            const tokens = tNorm.split(/\s+/).filter((k: string) => k.length >= 3);
            for (const tk of tokens) {
              const reg = new RegExp(`\\b${tk}\\b`, 'i');
              if (reg.test(q)) score += 10;
            }
          }
          return { t, score };
        }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);

        if (candidatos.length === 1) {
          trabajadorEncontrado = candidatos[0].t;
        } else if (candidatos.length > 1 && candidatos[0].score > candidatos[1].score) {
          trabajadorEncontrado = candidatos[0].t;
        } else if (candidatos.length > 1 && candidatos[0].score === candidatos[1].score) {
          const nombres = candidatos.slice(0, 3).map(c => `• **${c.t.nombre}** (C.C. ${c.t.cedula}) — ${c.t.cargo}`).join('\n');
          return {
            text: `⚠️ Encontré más de un trabajador que coincide con esa búsqueda:\n\n${nombres}\n\nPor favor especifica su nombre completo o número de cédula para modificar el dato con total seguridad.`
          };
        }
      }

      if (trabajadorEncontrado) {
        // 2. Identificar el campo y el nuevo valor
        let campoDB = '';
        let campoLabel = '';
        let valorNuevo: any = null;

        // A. Banco / Forma de pago
        const mapaBancos: Record<string, string> = {
          'bancolombia': 'Bancolombia',
          'nequi': 'Nequi',
          'daviplata': 'Daviplata',
          'davivienda': 'Davivienda',
          'av villas': 'AV Villas',
          'villas': 'AV Villas',
          'efectivo': 'Efectivo',
          'transferencia': 'Transferencia'
        };

        const bancoEncontrado = Object.keys(mapaBancos).find(b => q.includes(b));
        if (bancoEncontrado && (q.includes('banco') || q.includes('pago') || q.includes('forma') || q.includes('medio') || q.includes(`a ${bancoEncontrado}`) || q.includes(`por ${bancoEncontrado}`))) {
          campoDB = 'forma_pago';
          campoLabel = 'Forma de Pago';
          valorNuevo = mapaBancos[bancoEncontrado];
        }

        // B. Valor Hora Adicional
        if (!campoDB && (q.includes('hora') || q.includes('extra') || q.includes('adicional'))) {
          const numMatch = q.match(/(?:\$|\b)([0-9]{1,2}(?:[.,][0-9]{3})+|[0-9]{4,5})\b/);
          if (numMatch) {
            campoDB = 'valor_hora_adicional';
            campoLabel = 'Valor Hora Adicional';
            valorNuevo = parseInt(numMatch[1].replace(/[.,]/g, ''), 10);
          }
        }

        // C. Valor Turno
        if (!campoDB && (q.includes('turno') || q.includes('tarifa') || q.includes('sueldo') || q.includes('diario'))) {
          const numMatch = q.match(/(?:\$|\b)([0-9]{2,3}(?:[.,][0-9]{3})+|[0-9]{5,6})\b/);
          if (numMatch) {
            campoDB = 'valor_turno';
            campoLabel = 'Valor de Turno';
            valorNuevo = parseInt(numMatch[1].replace(/[.,]/g, ''), 10);
          }
        }

        // D. Parqueadero / Cargo
        const cargosDisponibles = [
          'CONTRATISTAS DE ADMINISTRACION', '5 - 6', '6 - 6', 'CARTON C', 'GUACANDA',
          'TERCERA', 'ROZO', '2 - 10', 'MAYORISTA', 'GUABINAS', 'BOLIVAR', 'REMESAS'
        ];
        if (!campoDB && (q.includes('parqueadero') || q.includes('cargo') || q.includes('lugar') || q.includes('pasa') || q.includes('pasar') || q.includes('asigna') || q.includes('asignar'))) {
          const cargoMatch = cargosDisponibles.find(c => q.includes(c.toLowerCase()));
          if (cargoMatch) {
            campoDB = 'cargo';
            campoLabel = 'Parqueadero / Cargo';
            valorNuevo = cargoMatch;
          }
        }

        // E. Número de Cuenta
        if (!campoDB && (q.includes('cuenta') || q.includes('cta') || q.includes('numero') || q.includes('no.'))) {
          const nums = q.match(/\b([0-9]{5,25})\b/g) || [];
          const cuentaCandidata = nums.find(n => n !== trabajadorEncontrado.cedula);
          if (cuentaCandidata) {
            campoDB = 'numero_cuenta';
            campoLabel = 'Número de Cuenta';
            valorNuevo = cuentaCandidata;
          }
        }

        if (campoDB && valorNuevo !== null) {
          if (trabajadorEncontrado[campoDB] === valorNuevo) {
            const valorActualFmt = typeof valorNuevo === 'number' ? fmt(valorNuevo) : `\`${valorNuevo}\``;
            return {
              text: `ℹ️ **${trabajadorEncontrado.nombre}** ya tiene registrado ese mismo dato en **${campoLabel}** (${valorActualFmt}). No es necesario realizar ningún cambio.`
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
            text: `📝 **Solicitud de Modificación de Datos**\n\n` +
              `• 👤 **Trabajador**: **${trabajadorEncontrado.nombre}** (C.C. \`${trabajadorEncontrado.cedula}\`)\n` +
              `• 🏢 **Parqueadero**: ${trabajadorEncontrado.cargo || 'No asignado'}\n` +
              `• 🔄 **Campo a modificar**: **${campoLabel}**\n` +
              `• ⚠️ **Valor actual**: ${valorAnteriorFmt}\n` +
              `• ✨ **Nuevo valor**: ${valorNuevoFmt}\n\n` +
              `*Por seguridad, presiona el botón a continuación para guardar el cambio en Supabase:*`,
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
                  valorAnterior: trabajadorEncontrado[campoDB]
                }
              }
            ]
          };
        } else {
          return {
            text: `⚠️ Identifiqué al trabajador **${trabajadorEncontrado.nombre}**, pero no entendí con claridad qué campo o valor deseas modificarle.\n\n` +
              `Prueba escribiendo por ejemplo:\n` +
              `• *"Cambia la cuenta de ${trabajadorEncontrado.nombre.split(' ')[0]} a 05500123456"*\n` +
              `• *"Actualiza el valor de turno de ${trabajadorEncontrado.nombre.split(' ')[0]} a 65000"*\n` +
              `• *"Cambia el banco de ${trabajadorEncontrado.nombre.split(' ')[0]} a Nequi"*\n` +
              `• *"Pasa a ${trabajadorEncontrado.nombre.split(' ')[0]} al parqueadero Carton C"*`
          };
        }
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

  // ── 2. RESUMEN DE NÓMINA / HISTORIAL DE LIQUIDACIONES ──────────────────────
  if (q.includes('resumen nomina') || q.includes('nomina actual') || q.includes('informe liquidacion') || q.includes('total pagado') || q.includes('total pendiente') || (q.includes('resumen') && !q.includes('remesa'))) {
    const { data: historial, error } = await supabase.from('historial_liquidaciones').select('*');
    if (error) return { text: `Error al consultar la nómina en Supabase: ${error.message}` };

    if (!historial || historial.length === 0) {
      return { text: `📋 **Informe de Nómina**:\n\nActualmente no hay liquidaciones registradas en el informe general.` };
    }

    const totalRegistros = historial.length;
    const totalNeto = historial.reduce((acc, i) => acc + (i.resultado?.neto || 0), 0);
    const pagados = historial.filter(i => i.estado === 'Pagado');
    const pendientes = historial.filter(i => i.estado !== 'Pagado');
    const totalPagado = pagados.reduce((acc, i) => acc + (i.resultado?.neto || 0), 0);
    const totalPendiente = pendientes.reduce((acc, i) => acc + (i.resultado?.neto || 0), 0);
    const totalTurnos = historial.reduce((acc, i) => acc + (i.form?.diasTurno || 0), 0);

    return {
      text: `📊 **Resumen General de Nómina Activa**:\n\n` +
        `• **Registros totales**: ${totalRegistros} personas liquidadas\n` +
        `• **Días turno acumulados**: ${totalTurnos} días\n` +
        `• **Total Neto a pagar**: **${fmt(totalNeto)}**\n` +
        `• ✅ **Total Pagado**: ${fmt(totalPagado)} (${pagados.length} personas)\n` +
        `• ⏳ **Total Pendiente**: ${fmt(totalPendiente)} (${pendientes.length} personas)\n\n` +
        `Puedes preguntarme por una persona en específico para ver su desglose individual.`
    };
  }

  // ── 3. CONSULTAS DE SEGURIDAD SOCIAL / ARL ─────────────────────────────────
  if (q.includes('arl') || q.includes('seguridad social') || q.includes('descuento arl') || q.includes('pila')) {
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
  if (q.includes('remesa') || q.includes('remesas')) {
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
    'de', 'el', 'la', 'los', 'las', 'un', 'una', 'hola', 'buenos', 'dias', 'tardes', 'noches',
    'por', 'favor', 'quien', 'es', 'ver', 'datos', 'trabajador', 'persona', 'cuenta', 'cuanto', 'gana'
  ]);

  const tokens = q
    .split(/\s+/)
    .filter(palabra => palabra.length >= 2 && !palabrasIgnoradas.has(palabra));

  if (tokens.length > 0) {
    let queryAnd = supabase.from('trabajadores').select('*');
    for (const t of tokens) {
      queryAnd = queryAnd.ilike('nombre', `%${t}%`);
    }
    const { data: resAnd } = await queryAnd.limit(5);
    let resultados = resAnd || [];

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
      let respuesta = `🔎 **Resultados encontrados (${resultados.length})**:\n\n`;
      const accionesList: ChatAction[] = [];

      for (const t of resultados) {
        respuesta += `👤 **${t.nombre}**\n`;
        respuesta += `   • **Cédula**: ${t.cedula}\n`;
        respuesta += `   • **Parqueadero / Cargo**: ${t.cargo || 'No asignado'}\n`;
        respuesta += `   • **Valor Turno**: ${fmt(t.valor_turno || 0)}\n`;
        respuesta += `   • **Valor Hora Adicional**: ${fmt(t.valor_hora_adicional || 0)}\n`;
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
        acciones: accionesList
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
