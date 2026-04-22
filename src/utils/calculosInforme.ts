import { RegistroDiario, ItemTabla } from '../types';

// Clase de error personalizada para donaciones
export class DonacionError extends Error {
  constructor(
    message: string,
    public details?: {
      total?: number;
      cantidad?: number;
      minimo?: number;
      maximo?: number;
      sugerencia?: string;
    }
  ) {
    super(message);
    this.name = 'DonacionError';
  }
}

// Valores base permitidos para motos
const VALORES_MOTOS = [
  300, 300, 350, 400, 450, 500, 500, 500, 550, 600, 650, 700, 750, 800, 900, 950,
  1000, 1000, 1000,
  1500, 2000,
  2500, 3000,
  4000, 5000
];

// Valores base permitidos para carros
const VALORES_CARROS = [
  500, 700, 1000, 1000, 1000, 1250, 1500,
  2000, 2000, 2000, 2000, 2000, 2000, 2500,
  3000, 3000,
  4000, 4000,
  5000
];

const MIN_MOTOS = 300;
const MIN_CARROS = 500;
const MAX = 5000;

type TipoParqueadero = 'motos' | 'carros';

export const generarDonaciones = (
  total: number,
  cantidad: number,
  tipo: TipoParqueadero
): number[] => {
  const MIN = tipo === 'motos' ? MIN_MOTOS : MIN_CARROS;
  const valoresBase = tipo === 'motos' ? VALORES_MOTOS : VALORES_CARROS;

  const minPosible = cantidad * MIN;
  const maxPosible = cantidad * MAX;

  // Validaciones mejoradas con información detallada
  if (total < minPosible) {
    throw new DonacionError(
      `El total es muy bajo para ${cantidad} donante${cantidad > 1 ? 's' : ''}`,
      {
        total,
        cantidad,
        minimo: minPosible,
        sugerencia: `El mínimo permitido es $${minPosible.toLocaleString('es-CO')} para ${cantidad} donante${cantidad > 1 ? 's' : ''} de ${tipo}`
      }
    );
  }

  if (total > maxPosible) {
    throw new DonacionError(
      `El total es muy alto para ${cantidad} donante${cantidad > 1 ? 's' : ''}`,
      {
        total,
        cantidad,
        maximo: maxPosible,
        sugerencia: `El máximo permitido es $${maxPosible.toLocaleString('es-CO')} para ${cantidad} donante${cantidad > 1 ? 's' : ''}`
      }
    );
  }

  if (total % 50 !== 0) {
    const totalRedondeado = Math.round(total / 50) * 50;
    throw new DonacionError(
      'El total debe ser múltiplo de 50',
      {
        total,
        sugerencia: `Intenta con $${totalRedondeado.toLocaleString('es-CO')}`
      }
    );
  }

  // Inicializar todas las donaciones con el valor mínimo
  const donaciones: number[] = new Array(cantidad).fill(MIN);
  let restante = total - (cantidad * MIN);

  let i = 0;
  while (restante > 0) {
    const maxExtra = MAX - donaciones[i];

    // Calcular valores posibles
    const posibles = valoresBase
      .filter(v => v > MIN)
      .map(v => v - MIN)
      .filter(extra => extra <= maxExtra && extra <= restante);

    let extra: number;
    if (posibles.length > 0) {
      // Seleccionar un valor aleatorio de los posibles
      extra = posibles[Math.floor(Math.random() * posibles.length)];
    } else {
      // Si no hay valores posibles, usar el mínimo entre maxExtra y restante
      extra = Math.min(maxExtra, restante);
    }

    donaciones[i] += extra;
    restante -= extra;
    i = (i + 1) % cantidad;
  }

  // Mezclar aleatoriamente las donaciones
  return shuffleArray(donaciones);
};

// Función auxiliar para mezclar array (Fisher-Yates shuffle)
const shuffleArray = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export const generarItemsTabla = (registros: RegistroDiario[]): ItemTabla[] => {
  const items: ItemTabla[] = [];
  let itemCounter = 1;

  registros.forEach(registro => {
    const valores = generarDonaciones(
      registro.donaciones.valor,
      registro.donaciones.cantidadDonantes,
      registro.tipoParqueadero // Usa el tipo del registro
    );
    
    for (let i = 0; i < registro.donaciones.cantidadDonantes; i++) {
      items.push({
        item: itemCounter++,
        donante: 'ANÓNIMO',
        documento: '',
        medio: 'EFECTIVO',
        valor: valores[i],
        reciboN: '',
        observaciones: 'SIN OBSERVACIONES'
      });
    }
  });

  return items;
};

export const calcularTotalDonaciones = (registros: RegistroDiario[]): number => {
  return registros.reduce((acc, reg) => acc + reg.donaciones.valor, 0);
};

export const calcularTotalGeneral = (registros: RegistroDiario[]): number => {
  const totalDonaciones = calcularTotalDonaciones(registros);
  const totalFacturas = registros.reduce((acc, reg) => acc + (reg.facturaElectronica?.valor || 0), 0);
  return totalDonaciones + totalFacturas;
};

export const calcularValorPorDonante = (valorTotal: number, cantidadDonantes: number): number => {
  if (cantidadDonantes === 0) return 0;
  return Math.round(valorTotal / cantidadDonantes);
};

// Mantener la función anterior por compatibilidad (deprecada)
export const generarValoresDonantes = (valorTotal: number, cantidadDonantes: number): number[] => {
  console.warn('generarValoresDonantes está deprecada, usar generarDonaciones en su lugar');
  
  if (cantidadDonantes === 0) return [];
  if (cantidadDonantes === 1) return [valorTotal];

  const valores: number[] = [];
  const valorBase = Math.floor(valorTotal / cantidadDonantes);
  let sumaAcumulada = 0;

  const redondearA50 = (valor: number): number => {
    return Math.round(valor / 50) * 50;
  };

  for (let i = 0; i < cantidadDonantes - 1; i++) {
    const porcentajeVariacion = 0.7 + Math.random() * 0.6;
    const valorCalculado = valorBase * porcentajeVariacion;
    const valor = redondearA50(valorCalculado);
    valores.push(Math.max(50, valor));
    sumaAcumulada += valores[i];
  }

  const ultimoValor = valorTotal - sumaAcumulada;
  valores.push(Math.max(50, ultimoValor));

  return valores;
};