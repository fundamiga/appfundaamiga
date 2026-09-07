'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, ChevronDown, Check, Copy, Calculator, Shield, Users, HelpCircle, RefreshCw, Zap, MapPin, Pencil, Trash2 } from 'lucide-react';
import { processAIChatMessage, ChatMessage, ChatAction, executeUpdateTrabajador, executeLiquidacionDirecta, executePagoMasivo, executeCrearTrabajador, executeEliminarDeNomina, executeModificarTurnosLiquidacion, ChatContext } from '@/lib/aiChatService';

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [copiadoIdx, setCopiadoIdx] = useState<string | null>(null);
  const [chatContext, setChatContext] = useState<ChatContext>({});
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy tu **Asistente Fundamiga**. ¿Qué información de nómina, trabajadores o seguridad social deseas consultar hoy?',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Mostrar aviso emergente después de 1.5 segundos
    const timerShow = setTimeout(() => {
      setShowTooltip(true);
    }, 1500);

    // Ocultar aviso automáticamente después de 8 segundos
    const timerHide = setTimeout(() => {
      setShowTooltip(false);
    }, 8000);

    return () => {
      clearTimeout(timerShow);
      clearTimeout(timerHide);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    try {
      const responseObj = await processAIChatMessage(query, chatContext);

      if (responseObj.nuevoContexto) {
        setChatContext(prev => ({
          ...prev,
          ...responseObj.nuevoContexto
        }));
      }

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: responseObj.text,
        timestamp: new Date(),
        acciones: responseObj.acciones
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Si la respuesta incluye ubicar en la tabla, auto-desplazar automáticamente
      const accionDesplazar = responseObj.acciones?.find(a => a.tipo === 'DESPLAZAR_TABLA');
      if (accionDesplazar?.payload) {
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('fundamiga:desplazar-a-trabajador', {
              detail: accionDesplazar.payload
            }));
          }
        }, 250);
      }

      // Si la respuesta incluye aplicar filtros en la tabla, auto-aplicar
      const accionFiltros = responseObj.acciones?.find(a => a.tipo === 'APLICAR_FILTROS');
      if (accionFiltros?.payload) {
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('fundamiga:aplicar-filtros', {
              detail: accionFiltros.payload
            }));
          }
        }, 200);
      }

      // Si la respuesta incluye abrir edición en la tabla, auto-abrir
      const accionEditar = responseObj.acciones?.find(a => a.tipo === 'EDITAR_EN_TABLA');
      if (accionEditar?.payload) {
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('fundamiga:abrir-edicion-trabajador', {
              detail: accionEditar.payload
            }));
          }
        }, 400);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: 'Lo siento, ocurrió un problema al procesar tu consulta. Inténtalo de nuevo.',
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const [ejecutandoAccionId, setEjecutandoAccionId] = useState<string | null>(null);
  const [accionesEjecutadas, setAccionesEjecutadas] = useState<string[]>([]);

  const handleExecuteAction = async (action: ChatAction, actIdx: number) => {
    if (action.tipo === 'NAVEGAR_RUTA' && action.payload) {
      if (typeof window !== 'undefined') {
        window.location.href = action.payload;
      }
      return;
    }

    if (action.tipo === 'CONSULTAR_DETALLE' && action.payload) {
      handleSendMessage(action.payload);
      return;
    }

    if (action.tipo === 'CREAR_TRABAJADOR' && action.payload) {
      const actionKey = `crear-${actIdx}-${action.payload.nombre}`;
      if (accionesEjecutadas.includes(actionKey) || ejecutandoAccionId === actionKey) return;

      setEjecutandoAccionId(actionKey);
      try {
        const res = await executeCrearTrabajador(action.payload);
        setAccionesEjecutadas(prev => [...prev, actionKey]);

        const confirmationMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: res.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmationMsg]);

        if (res.success && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fundamiga:recargar-datos'));
        }
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: `❌ Error al crear trabajador: ${err?.message || 'Error inesperado'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setEjecutandoAccionId(null);
      }
      return;
    }

    if (action.tipo === 'APLICAR_FILTROS' && action.payload) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fundamiga:aplicar-filtros', {
          detail: action.payload
        }));
      }
      return;
    }

    if (action.tipo === 'DESPLAZAR_TABLA' && action.payload) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fundamiga:desplazar-a-trabajador', {
          detail: action.payload
        }));
      }
      return;
    }

    if (action.tipo === 'EDITAR_EN_TABLA' && action.payload) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fundamiga:abrir-edicion-trabajador', {
          detail: action.payload
        }));
      }
      return;
    }

    if (action.tipo === 'COPIAR' && action.payload) {
      try {
        await navigator.clipboard.writeText(action.payload);
        const key = `${actIdx}-${action.payload}`;
        setCopiadoIdx(key);
        setTimeout(() => setCopiadoIdx(null), 2000);
      } catch {
        const el = document.createElement('textarea');
        el.value = action.payload;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        const key = `${actIdx}-${action.payload}`;
        setCopiadoIdx(key);
        setTimeout(() => setCopiadoIdx(null), 2000);
      }
      return;
    }

    if (action.tipo === 'LIQUIDAR_TRABAJADOR' && action.payload) {
      const actionKey = `liq-${actIdx}-${action.payload.persona?.cedula}`;
      if (accionesEjecutadas.includes(actionKey) || ejecutandoAccionId === actionKey) return;

      setEjecutandoAccionId(actionKey);
      try {
        const res = await executeLiquidacionDirecta(action.payload);
        setAccionesEjecutadas(prev => [...prev, actionKey]);

        const confirmationMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: res.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmationMsg]);

        if (res.success && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fundamiga:recargar-datos'));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('fundamiga:desplazar-a-trabajador', {
              detail: { cedula: action.payload.persona?.cedula, nombre: action.payload.persona?.nombre }
            }));
          }, 350);
        }
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: `❌ Error al registrar liquidación: ${err?.message || 'Error inesperado'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setEjecutandoAccionId(null);
      }
      return;
    }

    if (action.tipo === 'PAGO_MASIVO' && action.payload) {
      const actionKey = `pago-masivo-${actIdx}`;
      if (accionesEjecutadas.includes(actionKey) || ejecutandoAccionId === actionKey) return;

      setEjecutandoAccionId(actionKey);
      try {
        const res = await executePagoMasivo(action.payload);
        setAccionesEjecutadas(prev => [...prev, actionKey]);

        const confirmationMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: res.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmationMsg]);

        if (res.success && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fundamiga:recargar-datos'));
        }
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: `❌ Error al ejecutar pago masivo: ${err?.message || 'Error inesperado'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setEjecutandoAccionId(null);
      }
      return;
    }

    if (action.tipo === 'ELIMINAR_DE_NOMINA' && action.payload) {
      const actionKey = `del-${actIdx}-${action.payload.historialId}`;
      if (accionesEjecutadas.includes(actionKey) || ejecutandoAccionId === actionKey) return;

      setEjecutandoAccionId(actionKey);
      try {
        const res = await executeEliminarDeNomina(action.payload);
        setAccionesEjecutadas(prev => [...prev, actionKey]);
        setChatContext(prev => ({ ...prev, eliminandoPendiente: undefined }));

        const confirmationMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: res.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmationMsg]);

        if (res.success && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fundamiga:recargar-datos'));
        }
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: `❌ Error al eliminar de la nómina: ${err?.message || 'Error inesperado'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setEjecutandoAccionId(null);
      }
      return;
    }

    if (action.tipo === 'MODIFICAR_TURNOS' && action.payload) {
      const actionKey = `mod-turnos-${actIdx}-${action.payload.historialId}`;
      if (accionesEjecutadas.includes(actionKey) || ejecutandoAccionId === actionKey) return;

      setEjecutandoAccionId(actionKey);
      try {
        const res = await executeModificarTurnosLiquidacion(action.payload);
        setAccionesEjecutadas(prev => [...prev, actionKey]);

        const confirmationMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: res.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmationMsg]);

        if (res.success && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fundamiga:recargar-datos'));
        }
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: `❌ Error al actualizar turnos: ${err?.message || 'Error inesperado'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setEjecutandoAccionId(null);
      }
      return;
    }

    if (action.tipo === 'MODIFICAR_DATO' && action.payload) {
      const actionKey = `${actIdx}-${action.payload.trabajadorId}-${action.payload.campo}`;
      if (accionesEjecutadas.includes(actionKey) || ejecutandoAccionId === actionKey) return;

      setEjecutandoAccionId(actionKey);
      try {
        const res = await executeUpdateTrabajador(action.payload);
        setAccionesEjecutadas(prev => [...prev, actionKey]);
        setChatContext(prev => ({ ...prev, campoPendiente: undefined }));

        const confirmationMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: res.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, confirmationMsg]);
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          sender: 'assistant',
          text: `❌ Error al intentar actualizar: ${err?.message || 'Error inesperado'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setEjecutandoAccionId(null);
      }
    }
  };

  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Formato para bloques de código con backticks
      const codeRegex = /(`[^`]+`)/g;
      const parts = line.split(codeRegex);

      const formattedLine = parts.map((part, pIdx) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={pIdx} className="bg-slate-100 text-emerald-700 px-1.5 py-0.5 rounded font-mono text-[11px] font-bold">
              {part.slice(1, -1)}
            </code>
          );
        }

        // Formato para negritas
        const boldParts = part.split(/(\*\*.*?\*\*)/g);
        return boldParts.map((bPart, bIdx) => {
          if (bPart.startsWith('**') && bPart.endsWith('**')) {
            return <strong key={`${pIdx}-${bIdx}`} className="font-bold text-slate-900">{bPart.slice(2, -2)}</strong>;
          }
          return bPart;
        });
      });

      return (
        <React.Fragment key={idx}>
          {formattedLine}
          {idx < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9990] flex flex-col items-end pointer-events-none">
      {/* Ventana de Chat */}
      {isOpen && (
        <div className="pointer-events-auto mb-3 w-[360px] sm:w-[420px] h-[550px] max-h-[82vh] bg-white rounded-3xl shadow-2xl border border-emerald-100 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 p-4 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 text-white shadow-inner">
                <Bot size={22} className="text-emerald-200" />
              </div>
              <div>
                <h3 className="font-black text-sm leading-tight flex items-center gap-1.5 tracking-tight">
                  Asistente Fundamiga
                  <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                </h3>
                <p className="text-[11px] text-emerald-100 font-medium">Consultas de Nómina, ARL y Personal</p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/25 flex items-center justify-center text-white/90 hover:text-white transition-colors"
              title="Cerrar chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Chips de Preguntas Rápidas */}
          <div className="bg-emerald-50/60 border-b border-emerald-100/80 px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => handleSendMessage('¿Cuántos llevo y cómo va la nómina?')}
              className="text-[11px] font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full whitespace-nowrap transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              📊 ¿Cuántos llevo?
            </button>
            <button
              onClick={() => handleSendMessage('¿Quiénes van en el cuadro de nómina?')}
              className="text-[11px] font-bold text-teal-800 bg-white hover:bg-teal-100 border border-teal-200 px-3 py-1 rounded-full whitespace-nowrap transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              👥 ¿Quiénes van?
            </button>
            <button
              onClick={() => handleSendMessage('¿Quiénes faltan por liquidar?')}
              className="text-[11px] font-bold text-amber-800 bg-white hover:bg-amber-100 border border-amber-200 px-3 py-1 rounded-full whitespace-nowrap transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              ⏳ ¿Quiénes faltan?
            </button>
            <button
              onClick={() => handleSendMessage('Auditar cuentas repetidas')}
              className="text-[11px] font-bold text-rose-800 bg-white hover:bg-rose-100 border border-rose-200 px-3 py-1 rounded-full whitespace-nowrap transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              ⚠️ Cuentas Repetidas
            </button>
            <button
              onClick={() => handleSendMessage('¿Cómo se calcula el neto?')}
              className="text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-1 rounded-full whitespace-nowrap transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              🧮 Fórmulas
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50/60">
            {messages.map((msg, mIdx) => (
              <div
                key={msg.id || mIdx}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 text-xs shadow-sm mt-0.5">
                    <Bot size={15} />
                  </div>
                )}

                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-xs ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none font-medium'
                      : 'bg-white text-slate-700 border border-gray-200/70 rounded-bl-none'
                  }`}
                >
                  {renderFormattedText(msg.text)}

                  {/* Renderizar Botones de Acción si existen */}
                  {msg.acciones && msg.acciones.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-1.5">
                      {msg.acciones.map((act, aIdx) => {
                        const isCopied = copiadoIdx === `${aIdx}-${act.payload}`;
                        const actionKey = `${aIdx}-${act.payload?.trabajadorId}-${act.payload?.campo}`;
                        const isModifying = ejecutandoAccionId === actionKey;
                        const isModified = accionesEjecutadas.includes(actionKey);

                        if (act.tipo === 'MODIFICAR_DATO') {
                          return (
                            <button
                              key={aIdx}
                              onClick={() => handleExecuteAction(act, aIdx)}
                              disabled={isModifying || isModified}
                              className={`w-full py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                                isModified
                                  ? 'bg-emerald-600 text-white cursor-default'
                                  : isModifying
                                  ? 'bg-amber-100 text-amber-900 cursor-wait'
                                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white active:scale-98 shadow-sm cursor-pointer'
                              }`}
                            >
                              {isModified ? (
                                <>
                                  <Check size={14} /> ¡Modificación guardada con éxito!
                                </>
                              ) : isModifying ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" /> Guardando en Supabase...
                                </>
                              ) : (
                                <>
                                  <Zap size={14} className="fill-white" /> {act.label}
                                </>
                              )}
                            </button>
                          );
                        }

                        if (act.tipo === 'DESPLAZAR_TABLA') {
                          return (
                            <button
                              key={aIdx}
                              onClick={() => handleExecuteAction(act, aIdx)}
                              className="w-full py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98"
                            >
                              <MapPin size={13} /> {act.label}
                            </button>
                          );
                        }

                        if (act.tipo === 'EDITAR_EN_TABLA') {
                          return (
                            <button
                              key={aIdx}
                              onClick={() => handleExecuteAction(act, aIdx)}
                              className="w-full py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs bg-amber-500 hover:bg-amber-600 text-white cursor-pointer active:scale-98"
                            >
                              <Pencil size={13} /> {act.label}
                            </button>
                          );
                        }

                        if (act.tipo === 'ELIMINAR_DE_NOMINA' && act.payload) {
                          const actionKey = `del-${aIdx}-${act.payload?.historialId}`;
                          const isDeleting = ejecutandoAccionId === actionKey;
                          const isDeleted = accionesEjecutadas.includes(actionKey);

                          return (
                            <button
                              key={aIdx}
                              onClick={() => handleExecuteAction(act, aIdx)}
                              disabled={isDeleting || isDeleted}
                              className={`w-full py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                                isDeleted
                                  ? 'bg-slate-500 text-white cursor-default'
                                  : isDeleting
                                  ? 'bg-rose-100 text-rose-900 cursor-wait'
                                  : 'bg-rose-600 hover:bg-rose-700 active:scale-98 text-white shadow-sm cursor-pointer'
                              }`}
                            >
                              {isDeleted ? (
                                <>
                                  <Check size={14} /> Eliminado de la nómina
                                </>
                              ) : isDeleting ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" /> Eliminando de nómina...
                                </>
                              ) : (
                                <>
                                  <Trash2 size={14} /> {act.label}
                                </>
                              )}
                            </button>
                          );
                        }

                        if (act.tipo === 'MODIFICAR_TURNOS' && act.payload) {
                          const actionKey = `mod-turnos-${aIdx}-${act.payload?.historialId}`;
                          const isModifying = ejecutandoAccionId === actionKey;
                          const isModified = accionesEjecutadas.includes(actionKey);

                          return (
                            <button
                              key={aIdx}
                              onClick={() => handleExecuteAction(act, aIdx)}
                              disabled={isModifying || isModified}
                              className={`w-full py-2 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                                isModified
                                  ? 'bg-emerald-600 text-white cursor-default'
                                  : isModifying
                                  ? 'bg-amber-100 text-amber-900 cursor-wait'
                                  : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white active:scale-98 shadow-sm cursor-pointer'
                              }`}
                            >
                              {isModified ? (
                                <>
                                  <Check size={14} /> ¡Turnos actualizados!
                                </>
                              ) : isModifying ? (
                                <>
                                  <RefreshCw size={14} className="animate-spin" /> Guardando en nómina...
                                </>
                              ) : (
                                <>
                                  <Zap size={14} className="fill-white" /> {act.label}
                                </>
                              )}
                            </button>
                          );
                        }

                        if (act.tipo === 'CONSULTAR_DETALLE') {
                          return (
                            <button
                              key={aIdx}
                              onClick={() => handleExecuteAction(act, aIdx)}
                              className="w-full py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 cursor-pointer active:scale-98"
                            >
                              <HelpCircle size={13} /> {act.label}
                            </button>
                          );
                        }

                        if (act.tipo === 'APLICAR_FILTROS') {
                          return (
                            <button
                              key={aIdx}
                              onClick={() => handleExecuteAction(act, aIdx)}
                              className="w-full py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 cursor-pointer active:scale-98"
                            >
                              <Zap size={13} /> {act.label}
                            </button>
                          );
                        }

                        return (
                          <button
                            key={aIdx}
                            onClick={() => handleExecuteAction(act, aIdx)}
                            className={`w-full py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <Check size={13} /> ¡Cuenta copiada!
                              </>
                            ) : (
                              <>
                                <Copy size={13} /> {act.label}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div
                    className={`text-[9px] mt-1.5 text-right font-semibold ${
                      msg.sender === 'user' ? 'text-emerald-100' : 'text-slate-400'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0 text-xs shadow-sm mt-0.5">
                    <User size={14} />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2.5 items-center text-slate-400 text-xs">
                <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 text-xs shadow-sm">
                  <Bot size={15} />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 flex items-center gap-1.5 shadow-2xs">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Formulario de Entrada */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-gray-100 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Escribe un nombre, cédula o pregunta..."
              className="flex-1 px-4 py-2.5 text-xs bg-slate-50 border border-gray-200 rounded-2xl focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-medium text-slate-800"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTyping}
              className="w-10 h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-2xl flex items-center justify-center shadow-md transition-all shrink-0 active:scale-95"
              title="Enviar mensaje"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {/* Launcher & Speech Bubble */}
      <div className="flex items-center">
        {/* Burbuja / Mensaje de Presentación */}
        {showTooltip && !isOpen && (
          <div
            onClick={() => {
              setIsOpen(true);
              setShowTooltip(false);
            }}
            className="pointer-events-auto cursor-pointer mr-3 flex items-center gap-2.5 bg-slate-900/95 text-white text-xs py-2.5 px-4 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-md animate-in fade-in slide-in-from-right-4 duration-300 hover:scale-105 transition-all"
          >
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 shadow-sm">
              <Sparkles size={14} className="animate-spin [animation-duration:3s]" />
            </div>
            <div className="pr-1 text-left">
              <p className="font-black text-[11px] text-white flex items-center gap-1.5 leading-none">
                ¡Nuevo Asistente IA!
                <span className="text-[10px] text-emerald-400 font-semibold">✨ Clic aquí</span>
              </p>
              <p className="text-[10px] text-slate-300 mt-1 leading-none font-medium">Consultas rápidas de nómina y personal</p>
            </div>
            <button
              onClick={e => {
                e.stopPropagation();
                setShowTooltip(false);
              }}
              className="text-slate-400 hover:text-white p-0.5 rounded transition-colors ml-1"
              title="Cerrar aviso"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Botón Flotante Launcher */}
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setShowTooltip(false);
          }}
          className="pointer-events-auto group relative w-14 h-14 bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/25 shrink-0"
          title="Abrir Asistente Fundamiga"
        >
          {isOpen ? (
            <ChevronDown size={24} />
          ) : (
            <div className="relative flex items-center justify-center">
              <Sparkles size={24} className="animate-pulse text-white" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-300 border-2 border-emerald-800" />
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
