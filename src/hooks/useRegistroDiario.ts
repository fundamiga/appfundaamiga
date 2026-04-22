import { useState, useEffect } from 'react';
import { RegistroDiario, Donacion, Firma, FacturaElectronica, ItemFactura } from '@/types';

const STORAGE_KEY_REGISTROS = 'fundamiga_registros';
const STORAGE_KEY_ITEMS_FACTURAS = 'fundamiga_items_facturas';
const STORAGE_KEY_REGISTRO_ACTUAL = 'fundamiga_registro_actual';

const fechaHoy = () => new Date().toISOString().split('T')[0];

const registroVacio = (): RegistroDiario => ({
  fecha: fechaHoy(),
  ubicacion: '',
  tipoParqueadero: 'carros',
  donaciones: { valor: 0, cantidadDonantes: 0 },
  facturaElectronica: { valor: 0, cantidadPersonas: 0 },
  firmas: { trabajador: null, supervisor: null, responsable: null }
});

function cargarDeStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const useRegistroDiario = () => {
  const [registros, setRegistros] = useState<RegistroDiario[]>(() =>
    cargarDeStorage(STORAGE_KEY_REGISTROS, [])
  );
  const [itemsFacturas, setItemsFacturas] = useState<ItemFactura[]>(() =>
    cargarDeStorage(STORAGE_KEY_ITEMS_FACTURAS, [])
  );
  const [registroActual, setRegistroActual] = useState<RegistroDiario>(() =>
    cargarDeStorage(STORAGE_KEY_REGISTRO_ACTUAL, registroVacio())
  );

  // Persistir en localStorage cada vez que cambian
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_REGISTROS, JSON.stringify(registros));
  }, [registros]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ITEMS_FACTURAS, JSON.stringify(itemsFacturas));
  }, [itemsFacturas]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_REGISTRO_ACTUAL, JSON.stringify(registroActual));
  }, [registroActual]);

  const handleInputChange = (field: keyof RegistroDiario, value: any) => {
    setRegistroActual(prev => ({ ...prev, [field]: value }));
  };

  const handleDonacionChange = (field: keyof Donacion, value: number) => {
    setRegistroActual(prev => ({
      ...prev,
      donaciones: { ...prev.donaciones, [field]: value }
    }));
  };

  const handleFacturaChange = (field: keyof FacturaElectronica, value: number) => {
    setRegistroActual(prev => ({
      ...prev,
      facturaElectronica: { ...prev.facturaElectronica!, [field]: value }
    }));
  };

  const handleItemsFacturasChange = (items: ItemFactura[]) => {
    setItemsFacturas(items);
  };

  // CORREGIDO: Ahora recibe directamente el objeto Firma
  const handleFirmaChange = (
    tipo: 'trabajador' | 'supervisor' | 'responsable', 
    firma: Firma | null
  ) => {
    setRegistroActual(prev => ({
      ...prev,
      firmas: { ...prev.firmas, [tipo]: firma }
    }));
  };

  const agregarRegistro = (): boolean => {
    if (!registroActual.ubicacion || 
        registroActual.donaciones.valor <= 0 || 
        registroActual.donaciones.cantidadDonantes <= 0) {
      return false;
    }

    setRegistros(prev => [...prev, registroActual]);
    
    setRegistroActual({
      fecha: registroActual.fecha,
      ubicacion: '',
      tipoParqueadero: registroActual.tipoParqueadero,
      donaciones: { valor: 0, cantidadDonantes: 0 },
      facturaElectronica: { valor: 0, cantidadPersonas: 0 },
      firmas: registroActual.firmas,
    });

    return true;
  };

  const eliminarRegistro = (index: number) => {
    setRegistros(prev => prev.filter((_, i) => i !== index));
  };

  const reiniciarFormulario = () => {
    const vacio = registroVacio();
    setRegistros([]);
    setItemsFacturas([]);
    setRegistroActual(vacio);
    localStorage.removeItem(STORAGE_KEY_REGISTROS);
    localStorage.removeItem(STORAGE_KEY_ITEMS_FACTURAS);
    localStorage.removeItem(STORAGE_KEY_REGISTRO_ACTUAL);
  };

  return {
    registros,
    registroActual,
    itemsFacturas,
    handleInputChange,
    handleDonacionChange,
    handleFacturaChange,
    handleItemsFacturasChange,
    handleFirmaChange,
    agregarRegistro,
    eliminarRegistro,
    reiniciarFormulario
  };
};