import { generarDonaciones, generarItemsTabla } from './calculosInforme';
import { RegistroDiario } from '../types';

// Prueba 1: Verificar que la suma sea exacta
console.log('=== PRUEBA 1: Suma exacta ===');
const testMotos1 = generarDonaciones(5000, 10, 'motos');
console.log('Valores motos:', testMotos1);
console.log('Suma:', testMotos1.reduce((a, b) => a + b, 0));
console.log('¿Suma correcta?', testMotos1.reduce((a, b) => a + b, 0) === 5000);

// Prueba 2: Verificar múltiplos de 50
console.log('\n=== PRUEBA 2: Múltiplos de 50 ===');
const todosMultiplosDe50 = testMotos1.every(v => v % 50 === 0);
console.log('¿Todos múltiplos de 50?', todosMultiplosDe50);
console.log('Valores:', testMotos1);

// Prueba 3: Verificar rangos mínimos y máximos
console.log('\n=== PRUEBA 3: Rangos correctos ===');
const testMotos2 = generarDonaciones(8000, 15, 'motos');
const dentroRangoMotos = testMotos2.every(v => v >= 300 && v <= 5000);
console.log('Motos - ¿Todos entre 300 y 5000?', dentroRangoMotos);
console.log('Min:', Math.min(...testMotos2), 'Max:', Math.max(...testMotos2));

const testCarros1 = generarDonaciones(10000, 10, 'carros');
const dentroRangoCarros = testCarros1.every(v => v >= 500 && v <= 5000);
console.log('Carros - ¿Todos entre 500 y 5000?', dentroRangoCarros);
console.log('Min:', Math.min(...testCarros1), 'Max:', Math.max(...testCarros1));

// Prueba 4: Validaciones de errores
console.log('\n=== PRUEBA 4: Validaciones ===');
try {
  generarDonaciones(1000, 10, 'motos'); // Muy poco dinero
  console.log('❌ ERROR: Debería lanzar excepción');
} catch (e) {
  console.log('✅ Validación correcta:', (e as Error).message);
}

try {
  generarDonaciones(5025, 10, 'motos'); // No es múltiplo de 50
  console.log('❌ ERROR: Debería lanzar excepción');
} catch (e) {
  console.log('✅ Validación correcta:', (e as Error).message);
}

// Prueba 5: Verificar variedad de valores
console.log('\n=== PRUEBA 5: Variedad de valores ===');
const testVariedad = generarDonaciones(20000, 20, 'carros');
const valoresUnicos = new Set(testVariedad).size;
console.log('Cantidad de valores únicos:', valoresUnicos, 'de', testVariedad.length);
console.log('Distribución:', testVariedad.sort((a, b) => a - b));

// Prueba 6: Integración con generarItemsTabla
console.log('\n=== PRUEBA 6: Integración completa ===');
const registrosPrueba: RegistroDiario[] = [
  {
    fecha: '2024-01-01',
    ubicacion: 'Centro',
    donaciones: { valor: 5000, cantidadDonantes: 10 },
    firmas: {
      trabajador: null,
      supervisor: null,
      responsable: null
    },
    tipoParqueadero: 'motos'
  },
  {
    fecha: '2024-01-02',
    ubicacion: 'Norte',
    donaciones: { valor: 8000, cantidadDonantes: 12 },
    firmas: {
      trabajador: null,
      supervisor: null,
      responsable: null
    },
    tipoParqueadero: 'carros'
  }
];

const items = generarItemsTabla(registrosPrueba);
console.log('Total items generados:', items.length);
console.log('Suma total:', items.reduce((acc, item) => acc + item.valor, 0));
console.log('¿Suma correcta?', items.reduce((acc, item) => acc + item.valor, 0) === 13000);
console.log('\nPrimeros 5 items:');
items.slice(0, 5).forEach(item => {
  console.log(`  Item ${item.item}: $${item.valor}`);
});