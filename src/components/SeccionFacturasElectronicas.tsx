import React, { useState } from 'react';
import { Receipt, Trash2 } from 'lucide-react';
import { FacturaElectronica, ItemFactura } from '@/types';

interface SeccionFacturasElectronicasProps {
  facturaElectronica: FacturaElectronica;
  itemsFacturas: ItemFactura[];
  onFacturaChange: (field: keyof FacturaElectronica, value: number) => void;
  onItemsChange: (items: ItemFactura[]) => void;
}

export const SeccionFacturasElectronicas: React.FC<SeccionFacturasElectronicasProps> = ({
  facturaElectronica,
  itemsFacturas,
  onFacturaChange,
  onItemsChange
}) => {
  const [habilitado, setHabilitado] = useState(false);

  const calcularValorPorPersona = () => {
    if (facturaElectronica.cantidadPersonas === 0) return 0;
    return Math.round(facturaElectronica.valor / facturaElectronica.cantidadPersonas);
  };

  const handleToggle = () => {
    setHabilitado(!habilitado);
    if (!habilitado) {
      // Al habilitar, generar items automáticamente
      generarItemsAutomatico();
    } else {
      // Al deshabilitar, limpiar items
      onItemsChange([]);
    }
  };

  const generarItemsAutomatico = () => {
    const valorPorPersona = calcularValorPorPersona();
    const nuevosItems: ItemFactura[] = [];
    
    for (let i = 0; i < facturaElectronica.cantidadPersonas; i++) {
      nuevosItems.push({
        item: i + 1,
        donante: 'ANÓNIMO',
        documento: '',
        medio: 'FACTURA ELECTRÓNICA',
        valor: valorPorPersona,
        reciboN: '',
        observaciones: 'SIN OBSERVACIONES'
      });
    }
    
    onItemsChange(nuevosItems);
  };

  const handleActualizarItem = (index: number, campo: keyof ItemFactura, valor: any) => {
    const nuevosItems = [...itemsFacturas];
    if (campo === 'valor') {
      nuevosItems[index] = { ...nuevosItems[index], [campo]: Number(valor) };
    } else {
      nuevosItems[index] = { ...nuevosItems[index], [campo]: valor };
    }
    onItemsChange(nuevosItems);
  };

  const handleEliminarItem = (index: number) => {
    const nuevosItems = itemsFacturas.filter((_, i) => i !== index);
    // Reordenar items
    const reordenados = nuevosItems.map((item, idx) => ({ ...item, item: idx + 1 }));
    onItemsChange(reordenados);
  };

  const handleAgregarItem = () => {
    const nuevoItem: ItemFactura = {
      item: itemsFacturas.length + 1,
      donante: 'ANÓNIMO',
      documento: '',
      medio: 'FACTURA ELECTRÓNICA',
      valor: 0,
      reciboN: '',
      observaciones: 'SIN OBSERVACIONES'
    };
    onItemsChange([...itemsFacturas, nuevoItem]);
  };

  return (
    <div className="relative bg-white p-6 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
  {/* Barra lateral decorativa Emerald que cambia a Gris si está deshabilitado */}
  <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300 ${habilitado ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>

  {/* Switch mejorado en la esquina */}
  <div className="absolute top-6 right-6 z-10">
    <label className="flex items-center gap-3 cursor-pointer group">
      <span className={`text-xs font-bold uppercase tracking-widest transition-colors ${habilitado ? 'text-emerald-600' : 'text-gray-400'}`}>
        {habilitado ? 'Habilitado' : 'Deshabilitado'}
      </span>
      <div className="relative">
        <input
          type="checkbox"
          checked={habilitado}
          onChange={handleToggle}
          className="sr-only peer"
        />
        <div className="w-12 h-6 bg-gray-200 rounded-full peer peer-checked:bg-emerald-500 transition-all duration-300 shadow-inner"></div>
        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-md peer-checked:translate-x-6"></div>
      </div>
    </label>
  </div>

  {/* Contenedor principal */}
  <div className={`transition-all duration-300 ${habilitado ? 'opacity-100' : 'opacity-40 grayscale-[0.5]'}`}>
    <h3 className="font-bold text-lg mb-6 text-gray-800 flex items-center gap-2">
      <span className={`p-1.5 rounded-md transition-colors ${habilitado ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </span>
      Facturación Electrónica
    </h3>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div className="group">
        <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-gray-500 group-focus-within:text-emerald-600">
          Valor Total Facturas ($)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
          <input
            type="number"
            value={facturaElectronica.valor || ''}
            onChange={(e) => onFacturaChange('valor', Number(e.target.value))}
            disabled={!habilitado}
            placeholder="0.00"
            className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 font-medium focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 transition-all outline-none disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="group">
        <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-gray-500 group-focus-within:text-emerald-600">
          Cantidad de Personas
        </label>
        <input
          type="number"
          value={facturaElectronica.cantidadPersonas || ''}
          onChange={(e) => onFacturaChange('cantidadPersonas', Number(e.target.value))}
          disabled={!habilitado}
          placeholder="0"
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-700 font-medium focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 transition-all outline-none disabled:cursor-not-allowed"
        />
      </div>
    </div>

    {habilitado && facturaElectronica.valor > 0 && facturaElectronica.cantidadPersonas > 0 && (
      <button
        onClick={generarItemsAutomatico}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-bold shadow-md shadow-emerald-100 transition-all active:scale-[0.98] mb-6 flex justify-center items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        Generar {facturaElectronica.cantidadPersonas} Registros Automáticos
      </button>
    )}

    {/* Lista de items editables */}
    {habilitado && itemsFacturas.length > 0 && (
      <div className="border-t border-gray-100 pt-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="font-bold text-gray-800 flex items-center gap-2">
            Registros Detallados 
            <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full">{itemsFacturas.length}</span>
          </h4>
          <button
            onClick={handleAgregarItem}
            className="text-xs bg-white border border-emerald-200 text-emerald-600 px-3 py-1.5 rounded-lg hover:bg-emerald-50 font-bold transition-colors"
          >
            + Agregar Item
          </button>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          {itemsFacturas.map((item, idx) => (
            <div key={idx} className="group/item bg-gray-50 hover:bg-white border border-gray-200 hover:border-emerald-200 rounded-xl p-4 transition-all hover:shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Item #{item.item}
                </span>
                <button
                  onClick={() => handleEliminarItem(idx)}
                  className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Donante', key: 'donante', type: 'text' },
                  { label: 'Documento', key: 'documento', type: 'text' },
                  { label: 'Medio', key: 'medio', type: 'text' },
                  { label: 'Valor ($)', key: 'valor', type: 'number' },
                  { label: 'Recibo N.', key: 'reciboN', type: 'text' },
                  { label: 'Observaciones', key: 'observaciones', type: 'text' }
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">{field.label}</label>
                    <input
                      type={field.type}
                      value={item[field.key as keyof typeof item]}
                      onChange={(e) => handleActualizarItem(idx, field.key as keyof typeof item, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                      className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs focus:border-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
</div>
  );
};