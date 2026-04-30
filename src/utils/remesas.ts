import { supabaseRemesas as supabase } from '@/lib/supabaseRemesas';

// Lógica para calcular los días comerciales de Remesas (basado en la lógica de ARL)
export const calcularDiasRemesas = async (cedula: string, mes: number, año: number, fechaHasta?: string | Date): Promise<number> => {
    try {
        const { data } = await supabase
            .from('registros_remesas')
            .select('*')
            .eq('cedula_trabajador', cedula)
            .order('fecha', { ascending: true })
            .order('creado_at', { ascending: true });

        const registros = data || [];

        const pad = (n: number) => String(n).padStart(2, '0');
        const lastDayOfMonth = new Date(año, mes, 0).getDate();
        const minDateStr = `${año}-${pad(mes)}-01`;
        const maxDateStr = `${año}-${pad(mes)}-${pad(lastDayOfMonth)}`;

        const regAntes = registros.filter(r => r.fecha < minDateStr);
        const eventosEnMes = registros.filter(r => r.fecha >= minDateStr && r.fecha <= maxDateStr);

        // Determinar el día límite para el cálculo
        let limitDay = lastDayOfMonth;
        const hoy = new Date();
        const hoyStr = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
        
        const esMesActual = (hoy.getFullYear() === año && hoy.getMonth() + 1 === mes);
        const esMesFuturo = (minDateStr > hoyStr);

        if (fechaHasta) {
            const fh = typeof fechaHasta === 'string' ? fechaHasta : fechaHasta.toISOString().split('T')[0];
            if (fh >= minDateStr && fh <= maxDateStr) {
                limitDay = parseInt(fh.split('-')[2]);
            } else if (fh < minDateStr) {
                limitDay = 0;
            }
        } else if (esMesActual) {
            limitDay = hoy.getDate();
        } else if (esMesFuturo) {
            limitDay = 0;
        }

        if (!registros || registros.length === 0) {
            const d = limitDay;
            return (d === lastDayOfMonth) ? 30 : d;
        }

        let estabaActivoAlEmpezar = true; 
        
        if (regAntes.length > 0) {
            const u = regAntes[regAntes.length - 1];
            estabaActivoAlEmpezar = (u.tipo === 'ingreso' || u.tipo === 're-ingreso');
        } else if (eventosEnMes.length > 0) {
            // Si el primer registro de su historia es en este mes y es un ingreso,
            // asumimos que no estaba activo antes de esa fecha.
            const primerEvento = eventosEnMes[0];
            if (primerEvento.tipo === 'ingreso' || primerEvento.tipo === 're-ingreso') {
                estabaActivoAlEmpezar = false;
            }
        }

        let activosLiteral = 0;
        let estadoDiaActual = estabaActivoAlEmpezar;

        for (let dia = 1; dia <= limitDay; dia++) {
            const fechaDiaStr = `${año}-${pad(mes)}-${pad(dia)}`;
            const ev = eventosEnMes.filter(r => r.fecha === fechaDiaStr);
            
            let seCuentaEsteDia = estadoDiaActual;

            if (ev.length > 0) {
                const e = ev[ev.length - 1];
                // Si hay eventos hoy, el día se cuenta si:
                // 1. Ya venía activo (retiro hoy)
                // 2. Hubo un ingreso hoy
                if (ev.some(r => r.tipo === 'ingreso' || r.tipo === 're-ingreso')) {
                    seCuentaEsteDia = true;
                }
                // Actualizar estado para el día SIGUIENTE
                estadoDiaActual = (e.tipo === 'ingreso' || e.tipo === 're-ingreso');
            }

            if (seCuentaEsteDia) {
                activosLiteral++;
            }
        }

        let ajusteComercial = activosLiteral;
        if (limitDay === lastDayOfMonth && activosLiteral === lastDayOfMonth) {
            ajusteComercial = 30; 
        } else if (ajusteComercial > 30) {
            ajusteComercial = 30;
        }

        return ajusteComercial;

    } catch (error) {
        console.error("Error calculando Remesas:", error);
        return 30;
    }
};
