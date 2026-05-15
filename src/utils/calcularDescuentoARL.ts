/**
 * Calcula el descuento de ARL usando la fórmula oficial PILA (Decreto 1990 de 2016).
 *
 * Pasos:
 *   1. IBC proporcional = ceil((SMMLV / 30) × días)  → Redondeo al peso superior
 *   2. Aporte ARL       = IBC × tasa de riesgo (4.35% para Riesgo IV)
 *   3. Valor final       = ceil(aporte / 100) × 100   → Múltiplo de 100 superior
 *
 * Esto elimina las diferencias de $20-$80 que aparecían al comparar con
 * la prefactura de Simple/ARL SURA.
 */

const SMMLV = 1_750_905;            // Salario Mínimo Legal Vigente 2026
const TASA_ARL_RIESGO_IV = 0.0435;  // 4.35 %
export const DESCUENTO_FULL_30 = 76_200;   // Valor fijo cuando son 30 días completos

export function calcularDescuentoARLPila(dias: number): number {
  if (dias <= 0) return 0;
  if (dias >= 30) return DESCUENTO_FULL_30;

  // 1. IBC proporcional al peso superior
  const ibcProporcional = Math.ceil((SMMLV / 30) * dias);

  // 2. Aporte bruto
  const aporteBruto = ibcProporcional * TASA_ARL_RIESGO_IV;

  // 3. Redondeo al múltiplo de 100 superior
  return Math.ceil(aporteBruto / 100) * 100;
}
