import React from 'react';
import { Trash2 } from 'lucide-react';
import { RegistroDiario } from '../types';

interface ListaRegistrosProps {
  registros: RegistroDiario[];
  onEliminar: (index: number) => void;
}

export const ListaRegistros: React.FC<ListaRegistrosProps> = ({ registros, onEliminar }) => {
  if (registros.length === 0) return null;

  return (
    <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
      <h3 className="font-bold mb-2 text-green-900">Registros Agregados: {registros.length}</h3>
      <div className="space-y-2">
        {registros.map((reg, idx) => (
          <div key={idx} className="bg-white p-3 rounded flex justify-between items-center">
            <div>
              <span className="font-semibold">{reg.ubicacion}</span> - 
              ${reg.donaciones.valor.toLocaleString()} ({reg.donaciones.cantidadDonantes} donantes)
            </div>
            <button
              onClick={() => onEliminar(idx)}
              className="text-red-600 hover:text-red-800"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};