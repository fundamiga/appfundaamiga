import { useState, useEffect } from 'react';
import { RegistroDiario, ItemFactura } from '@/types';

export interface EntradaHistorial {
  id: string;
  fecha: string; // YYYY-MM-DD
  registros: RegistroDiario[];
  itemsFacturas: ItemFactura[];
  totalDonaciones: number;
  guardadoEn: string; // ISO timestamp
}

const STORAGE_KEY = 'fundamiga_historial';

function cargar(): EntradaHistorial[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const useHistorial = () => {
  const [historial, setHistorial] = useState<EntradaHistorial[]>(cargar);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historial));
  }, [historial]);

  const guardarEnHistorial = (
    registros: RegistroDiario[],
    itemsFacturas: ItemFactura[]
  ): EntradaHistorial => {
    const fecha = registros[0]?.fecha ?? new Date().toISOString().split('T')[0];
    const totalDonaciones = registros.reduce((s, r) => s + r.donaciones.valor, 0);

    const entrada: EntradaHistorial = {
      id: Date.now().toString(),
      fecha,
      registros,
      itemsFacturas,
      totalDonaciones,
      guardadoEn: new Date().toISOString(),
    };

    setHistorial(prev => [entrada, ...prev]);
    return entrada;
  };

  const eliminarEntrada = (id: string) => {
    setHistorial(prev => prev.filter(e => e.id !== id));
  };

  const limpiarHistorial = () => {
    setHistorial([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return { historial, guardarEnHistorial, eliminarEntrada, limpiarHistorial };
};
