export interface Donacion {
  valor: number;
  cantidadDonantes: number;
}

// NUEVO: Interface para facturas electrónicas
export interface FacturaElectronica {
  valor: number;
  cantidadPersonas: number;
}

export interface Firma {
  nombre: string;
  tipo: 'trabajador' | 'supervisor' | 'responsable';
  ruta: string;
  publicId?: string;
}

export interface Firmas {
  trabajador: Firma | null;
  supervisor: Firma | null;
  responsable: Firma | null;
}

export interface RegistroDiario {
  fecha: string;
  ubicacion: string;
  donaciones: Donacion;
  facturaElectronica?: FacturaElectronica; // NUEVO: Opcional
  firmas: Firmas;
  tipoParqueadero: 'carros' | 'motos' ; // NUEVO
}

export interface ItemTabla {
  item: number;
  donante: string;
  documento: string;
  medio: string;
  valor: number;
  reciboN: string;
  observaciones: string;
}

// NUEVO: Items de factura electrónica
export interface ItemFactura {
  item: number;
  donante: string;
  documento: string;
  medio: string;
  valor: number;
  reciboN: string;
  observaciones: string;
}