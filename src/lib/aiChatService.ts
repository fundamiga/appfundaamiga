import { supabase } from '@/lib/supabase';
import { supabaseRemesas } from '@/lib/supabaseRemesas';
import { calcularDescuentoARLPila } from '@/utils/calcularDescuentoARL';

export interface ChatAction {
  label: string;
  tipo: 'COPIAR' | 'CONSULTAR_DETALLE' | 'CALCULAR_TURNO' | 'MODIFICAR_DATO' | 'DESPLAZAR_TABLA' | 'EDITAR_EN_TABLA';
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
  let q = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¨´`^~¿?¡!.,:;_"*()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Corrección inteligente de dedazos y variaciones ortográficas frecuentes
  q = q
    .replace(/\b(quienen|quiene|quieness|kien|kienes|kienen)\b/g, 'quienes')
    .replace(/\b(perosnas|pesonas|personass|pesona|personad|perosna|persoas)\b/g, 'personas')
    .replace(/\b(trabajadore|trabajadorse|trabajadoers)\b/g, 'trabajadores')
    .replace(/\b(nominaa|nmina|monina|nomnia)\b/g, 'nomina')
    .replace(/\b(tabal|tbala|tavla)\b/g, 'tabla')
    .replace(/\b(cuadroo|cudaros?|cuadroa)\b/g, 'cuadro')
    .replace(/\b(cuant[ao]ss?|cuantoa|cuntos|cuatas)\b/g, 'cuantos');

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

  const verbosModificar = [
    'cambia', 'cambiar', 'cambiale', 'cambiales', 'cambiame',
    'actualiza', 'actualizar', 'actualizale', 'actualizame',
    'modifica', 'modificar', 'modificale', 'modificame',
    'edita', 'editar', 'editale', 'editame',
    'ponle', 'pon', 'poner', 'ponme',
    'asigna', 'asignar', 'asignale',
    'fija', 'fijar', 'fijale',
    'ajusta', 'ajustar', 'ajustale',
    'pasa', 'pasar', 'pasale'
  ];

  const esIntentoModificar =
    verbosModificar.some(v => new RegExp(`\\b${v}\\b`, 'i').test(q)) ||
    q.includes('modifica los datos') || q.includes('modificar los datos') ||
    q.includes('cambiar los datos') || q.includes('cambia los datos') ||
    q.includes('editar a') || q.includes('edita a') ||
    q.includes('modificar a') || q.includes('modifica a');

  if (esIntentoModificar) {
    const { data: todosTrabajadores } = await supabase.from('trabajadores').select('*');
    const { data: historial } = await supabase.from('historial_liquidaciones').select('*');

    if (todosTrabajadores && todosTrabajadores.length > 0) {
      // 1. Identificar al trabajador con tolerancia a orden de nombres y dedazos
      let trabajadorEncontrado: any = null;

      // Prioridad 1: Búsqueda por cédula si hay dígitos de 6 a 11 números en la consulta y corresponden a alguien existente
      const cedulaEnQuery = q.match(/\b\d{6,11}\b/);
      if (cedulaEnQuery) {
        const porCedula = todosTrabajadores.find(t => String(t.cedula).trim() === cedulaEnQuery[0]);
        // Solo si la query no dice explícitamente "cedula a 12345"
        if (porCedula && !/cedula\s*(?:a|por|en|=)?\s*\d+/i.test(q)) {
          trabajadorEncontrado = porCedula;
        }
      }

      // Prioridad 2: Coincidencia inteligente por nombre con tolerancia a dedazos (ej: perdro -> pedro)
      if (!trabajadorEncontrado) {
        // Extraer palabras de la consulta ignorando verbos y palabras de control
        const palabrasControl = new Set([
          'cambia', 'cambiar', 'cambiale', 'cambiales', 'cambiame', 'actualiza', 'actualizar',
          'actualizale', 'actualizame', 'modifica', 'modificar', 'modificale', 'modificame',
          'edita', 'editar', 'editale', 'editame', 'ponle', 'pon', 'poner', 'asigna', 'pasa',
          'pasar', 'la', 'el', 'los', 'las', 'a', 'al', 'de', 'del', 'en', 'por', 'para',
          'cuenta', 'cta', 'cuneta', 'cedula', 'cc', 'documento', 'banco', 'turno', 'tarifa',
          'hora', 'extra', 'adicional', 'parqueadero', 'cargo', 'datos', 'etc', 'asi', 'un',
          'una', 'su', 'nuevo', 'nueva', 'favor', 'dime', 'quiero', 'que'
        ]);

        const tokensNombre = q.split(/\s+/).filter(w => w.length >= 3 && !palabrasControl.has(w));

        const candidatos = todosTrabajadores.map(t => {
          const tNorm = t.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          let score = 0;

          if (tokensNombre.length > 0 && tokensNombre.every(tk => tNorm.includes(tk))) {
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

        if (candidatos.length === 1) {
          trabajadorEncontrado = candidatos[0].t;
        } else if (candidatos.length > 1 && candidatos[0].score > candidatos[1].score) {
          trabajadorEncontrado = candidatos[0].t;
        } else if (candidatos.length > 1 && candidatos[0].score === candidatos[1].score && candidatos[0].score >= 20) {
          trabajadorEncontrado = candidatos[0].t;
        }
      }

      if (trabajadorEncontrado) {
        // Verificar si la persona está actualmente en el cuadro de nómina
        const enNomina = (historial || []).find(h => String(h.persona?.cedula || '').trim() === String(trabajadorEncontrado.cedula).trim());

        // 2. Identificar el campo y el nuevo valor
        let campoDB = '';
        let campoLabel = '';
        let valorNuevo: any = null;

        // A. Cédula
        if (q.includes('cedula') || q.includes('cc') || q.includes('documento') || q.includes('identificacion')) {
          const matchCedula = q.match(/(?:cedula|cc|documento|identificacion)(?:\s*(?:a|por|en|de|=|:))?\s*([0-9]{6,12})/i);
          if (matchCedula) {
            campoDB = 'cedula';
            campoLabel = 'Número de Cédula';
            valorNuevo = matchCedula[1];
          } else {
            const nums = q.match(/\b([0-9]{6,12})\b/g) || [];
            const nuevaCed = nums.find(n => n !== trabajadorEncontrado.cedula);
            if (nuevaCed) {
              campoDB = 'cedula';
              campoLabel = 'Número de Cédula';
              valorNuevo = nuevaCed;
            }
          }
        }

        // B. Banco / Forma de pago
        if (!campoDB) {
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

          const bancoEncontrado = Object.keys(mapaBancos).find(b => q.includes(b));
          if (bancoEncontrado && (q.includes('banco') || q.includes('pago') || q.includes('forma') || q.includes('medio') || q.includes(`a ${bancoEncontrado}`) || q.includes(`por ${bancoEncontrado}`))) {
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
            const cuentaCandidata = nums.find(n => n !== trabajadorEncontrado.cedula);
            if (cuentaCandidata) {
              campoDB = 'numero_cuenta';
              campoLabel = 'Número de Cuenta';
              valorNuevo = cuentaCandidata;
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

        // F. Parqueadero / Cargo
        if (!campoDB) {
          const cargosDisponibles = [
            'CONTRATISTAS DE ADMINISTRACION', '5 - 6', '6 - 6', 'CARTON C', 'GUACANDA',
            'TERCERA', 'ROZO', '2 - 10', 'MAYORISTA', 'GUABINAS', 'BOLIVAR', 'REMESAS'
          ];
          if (q.includes('parqueadero') || q.includes('cargo') || q.includes('lugar') || q.includes('pasa') || q.includes('pasar') || q.includes('asigna') || q.includes('asignar')) {
            const cargoMatch = cargosDisponibles.find(c => q.includes(c.toLowerCase()));
            if (cargoMatch) {
              campoDB = 'cargo';
              campoLabel = 'Parqueadero / Cargo';
              valorNuevo = cargoMatch;
            }
          }
        }

        // CASO 1: Se especificó campo y nuevo valor
        if (campoDB && valorNuevo !== null) {
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
              ]
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
            ]
          };
        }

        // CASO 2: Se identificó a la persona pero no el campo/valor exacto (ej: "modifica los datos de Donella")
        // Desplazamos a la persona, abrimos el editor en la tabla y le damos opciones claras
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
          ]
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
          ]
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
            `💡 *Puedes liquidarlo seleccionándolo en el formulario de la pantalla.*`
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

  // 2.5 ¿Cuántos llevo? / ¿Cómo va la nómina? / Resumen general del cuadro
  const esPreguntaCuantosLlevo =
    (tienePalabraCuantos && (tienePalabraEntidad || tienePalabraLugar || tienePalabraAccion)) ||
    q.includes('cuantos llevo') || q.includes('cuantas personas van') ||
    q.includes('cuantos van') || q.includes('como voy') ||
    q.includes('como vamos') || q.includes('como va la nomina') ||
    q.includes('como va el cuadro') || q.includes('cuantos hay en la nomina') ||
    q.includes('cuantos ingresados') || q.includes('cuantos metidos') ||
    q.includes('resumen nomina') || q.includes('nomina actual') ||
    q.includes('informe liquidacion') || q.includes('total pagado') ||
    q.includes('total pendiente') || (q.includes('resumen') && !q.includes('remesa'));

  if (esPreguntaCuantosLlevo) {
    const { data: historial, error } = await supabase.from('historial_liquidaciones').select('*').order('creado_at', { ascending: false });
    const { data: trabajadores } = await supabase.from('trabajadores').select('id');

    if (error) return { text: `Error al consultar la nómina en Supabase: ${error.message}` };

    if (!historial || historial.length === 0) {
      return {
        text: `📋 **Estado del Cuadro de Nómina**:\n\n` +
          `Actualmente no hay ninguna liquidación registrada en el informe general.\n` +
          `Llevas **0 trabajadores ingresados**.`
      };
    }

    const totalRegistros = historial.length;
    const totalDisponibles = trabajadores?.length || 0;
    const pct = totalDisponibles > 0 ? Math.round((totalRegistros / totalDisponibles) * 100) : 0;

    const totalNeto = historial.reduce((acc, i) => acc + (i.resultado?.neto || 0), 0);
    const pagados = historial.filter(i => i.estado === 'Pagado');
    const pendientes = historial.filter(i => i.estado !== 'Pagado');
    const totalPagado = pagados.reduce((acc, i) => acc + (i.resultado?.neto || 0), 0);
    const totalPendiente = pendientes.reduce((acc, i) => acc + (i.resultado?.neto || 0), 0);
    const totalTurnos = historial.reduce((acc, i) => acc + (i.form?.diasTurno || 0), 0);
    const totalHoras = historial.reduce((acc, i) => acc + (i.form?.horasAdicionales || 0), 0);
    const totalArl = historial.reduce((acc, i) => acc + (i.resultado?.descuentoSeguridad || 0), 0);

    const ultimo = historial[0];

    return {
      text: `📊 **Estado en Vivo del Cuadro de Nómina**:\n\n` +
        `• 👥 **Progreso**: Llevas **${totalRegistros} personas ingresadas**` + (totalDisponibles > 0 ? ` de ${totalDisponibles} (${pct}% completado)` : '') + `\n` +
        `• 📅 **Días turno acumulados**: **${totalTurnos} días**\n` +
        (totalHoras > 0 ? `• ⏱️ **Horas adicionales**: **${totalHoras} hrs**\n` : '') +
        `• 💰 **Total Neto a pagar**: **${fmt(totalNeto)}**\n` +
        `• ⏳ **Pendientes**: ${fmt(totalPendiente)} (${pendientes.length} personas)\n` +
        `• ✅ **Pagados**: ${fmt(totalPagado)} (${pagados.length} personas)\n` +
        (totalArl > 0 ? `• 🛡️ **Seguridad Social (ARL)**: ${fmt(totalArl)}\n` : '') +
        (ultimo ? `\n🕒 **Última persona agregada**: **${ultimo.persona?.nombre}** (${fmt(ultimo.resultado?.neto || 0)})\n` : '') +
        `\n💡 *Puedes preguntarme "¿Quiénes van?", "¿Quiénes faltan?" o por alguien en particular (ej: "¿Ya metí a Diana?").*`
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
