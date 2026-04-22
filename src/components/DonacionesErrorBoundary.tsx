'use client';

import React from 'react';
import { 
  ClipboardCheck, 
  RefreshCw, 
  HelpCircle,
  AlertCircle,
  ChevronRight
} from 'lucide-react';

type Props = {
  children: React.ReactNode;
  onResetReal?: () => void;
};

class DonacionesErrorBoundary extends React.Component<Props, { hasError: boolean; error: any }> {

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onResetReal) {
      this.props.onResetReal();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="my-10 p-1 animate-in fade-in zoom-in duration-500">
          <div className="max-w-xl mx-auto bg-white rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden">
            
            {/* Header Amigable */}
            <div className="bg-amber-50 p-8 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-amber-200 rounded-full animate-ping opacity-20"></div>
                <div className="relative bg-white p-6 rounded-full shadow-sm border border-amber-100">
                  <ClipboardCheck size={48} className="text-amber-500" strokeWidth={1.5} />
                </div>
              </div>
            </div>

            <div className="p-10 pt-6 text-center">
              {/* Título y Mensaje Humano */}
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-3">
                ¡Huy! Algo no cuadra en las cuentas
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                Hubo un pequeño inconveniente al procesar los datos de las donaciones. 
                No te preocupes, tus registros están a salvo.
              </p>

              {/* Caja de Ayuda (Explicación Simple) */}
              <div className="bg-slate-50 rounded-3xl p-6 mb-8 border border-slate-100 text-left">
                <div className="flex items-center gap-2 mb-3 text-amber-600">
                  <HelpCircle size={18} />
                  <span className="text-[11px] font-black uppercase tracking-widest">¿Qué pudo pasar?</span>
                </div>
                <ul className="space-y-3">
                  {[
                    "Se ingresó una letra o símbolo en lugar de un número.",
                    "Un campo obligatorio quedó vacío o con un valor extraño.",
                    "El sistema necesita refrescar los cálculos internos."
                  ].map((text, i) => (
                    <li key={i} className="flex items-start gap-3 text-[13px] text-slate-600 font-medium">
                      <ChevronRight size={14} className="mt-1 text-amber-400 shrink-0" />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Detalle para soporte (Opcional/Discreto) */}
              <div className="mb-8 flex items-center justify-center gap-2 opacity-60 hover:opacity-100 transition-opacity cursor-help">
                <AlertCircle size={12} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                  Referencia: {this.state.error?.message?.slice(0, 40) || 'Dato no válido'}...
                </span>
              </div>

              {/* Botones de Acción */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={this.handleReset}
                  className="flex-[2] flex items-center justify-center gap-3 bg-slate-900 hover:bg-amber-500 text-white py-4 px-8 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all duration-300 active:scale-95 shadow-xl shadow-slate-200"
                >
                  <RefreshCw size={18} strokeWidth={3} />
                  Corregir y seguir editando
                </button>
              </div>
            </div>
            
            {/* Footer de Seguridad */}
            <div className="bg-slate-50 px-10 py-4 border-t border-slate-100">
              <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-[0.2em]">
                Sistema de Protección de Datos Activo
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default DonacionesErrorBoundary;