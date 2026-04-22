import { useState, useEffect } from 'react';

const MIN_MOTOS = 300;
const MIN_CARROS = 500;
const MAX = 5000;

interface ValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
  suggestion?: string;
  ranges?: {
    min: number;
    max: number;
  };
}

export const useDonacionesValidation = (
  total: string | number,
  cantidad: string | number,
  tipo: 'motos' | 'carros'
): ValidationResult => {
  const [validation, setValidation] = useState<ValidationResult>({ isValid: true });

  useEffect(() => {
    const totalNum = typeof total === 'string' ? parseInt(total) : total;
    const cantidadNum = typeof cantidad === 'string' ? parseInt(cantidad) : cantidad;

    // Si los campos están vacíos, no validar
    if (!total || !cantidad || isNaN(totalNum) || isNaN(cantidadNum)) {
      setValidation({ isValid: true });
      return;
    }

    // Si cantidad es 0 o negativa
    if (cantidadNum <= 0) {
      setValidation({
        isValid: false,
        error: 'La cantidad de donantes debe ser mayor a 0'
      });
      return;
    }

    const MIN = tipo === 'motos' ? MIN_MOTOS : MIN_CARROS;
    const minPosible = cantidadNum * MIN;
    const maxPosible = cantidadNum * MAX;

    // Validar que sea múltiplo de 50
    if (totalNum % 50 !== 0) {
      const sugeridoAbajo = Math.floor(totalNum / 50) * 50;
      const sugeridoArriba = Math.ceil(totalNum / 50) * 50;
      
      setValidation({
        isValid: false,
        error: 'El total debe ser múltiplo de $50',
        suggestion: `Intenta con $${sugeridoAbajo.toLocaleString('es-CO')} o $${sugeridoArriba.toLocaleString('es-CO')}`
      });
      return;
    }

    // Validar mínimo
    if (totalNum < minPosible) {
      setValidation({
        isValid: false,
        error: `El total es muy bajo para ${cantidadNum} donante${cantidadNum > 1 ? 's' : ''}`,
        suggestion: `El mínimo es $${minPosible.toLocaleString('es-CO')}`,
        ranges: { min: minPosible, max: maxPosible }
      });
      return;
    }

    // Validar máximo
    if (totalNum > maxPosible) {
      setValidation({
        isValid: false,
        error: `El total es muy alto para ${cantidadNum} donante${cantidadNum > 1 ? 's' : ''}`,
        suggestion: `El máximo es $${maxPosible.toLocaleString('es-CO')}`,
        ranges: { min: minPosible, max: maxPosible }
      });
      return;
    }

    // Todo válido - mostrar rango permitido como info
    setValidation({
      isValid: true,
      warning: `Rango válido: $${minPosible.toLocaleString('es-CO')} - $${maxPosible.toLocaleString('es-CO')}`,
      ranges: { min: minPosible, max: maxPosible }
    });

  }, [total, cantidad, tipo]);

  return validation;
};