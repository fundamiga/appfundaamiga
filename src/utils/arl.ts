import { supabase } from '@/lib/supabase';

// Lógica para calcular los días comerciales de ARL (30 días de nómina)
export const calcularDiasARL = async (cedula: string, mes: number, año: number, fechaHasta?: string | Date): Promise<number> => {
    try {
        const { data: registros } = await supabase
            .from('registros_arl')
            .select('*')
            .eq('cedula_trabajador', cedula)
            .order('fecha', { ascending: true })
            .order('creado_at', { ascending: true });

        const minDate = new Date(año, mes - 1, 1);
        const maxDate = new Date(año, mes, 0); // último día del mes real
        const lastDayOfMonth = maxDate.getDate();

        // Determinar el día límite para el cálculo
        let limitDay = lastDayOfMonth;
        const hoy = new Date();
        const esMesActual = (hoy.getFullYear() === año && hoy.getMonth() + 1 === mes);
        const esMesFuturo = (new Date(año, mes - 1, 1) > hoy);

        if (fechaHasta) {
            const fh = new Date(fechaHasta);
            if (fh.getFullYear() === año && fh.getMonth() + 1 === mes) {
                limitDay = fh.getDate();
            } else if (fh < minDate) {
                limitDay = 0;
            }
            // Si la fechaHasta es posterior al mes, mantenemos lastDayOfMonth
        } else if (esMesActual) {
            limitDay = hoy.getDate();
        } else if (esMesFuturo) {
            limitDay = 0;
        }

        if (!registros || registros.length === 0) {
            const d = limitDay;
            return (d === lastDayOfMonth) ? 30 : d;
        }

        // Mirar si antes del mes ya estaba activo
        const regAntes = registros.filter(r => new Date(r.fecha) < minDate);
        
        // Por defecto, si no hay registros previos, asumimos que estaba activo (según requerimiento de "todos empiezan activos")
        let estabaActivoAlEmpezar = true; 
        
        if (regAntes.length > 0) {
            const u = regAntes[regAntes.length - 1];
            estabaActivoAlEmpezar = (u.tipo === 'ingreso' || u.tipo === 're-ingreso');
        }

        const eventosEnMes = registros.filter(r => {
            const d = new Date(r.fecha);
            return d >= minDate && d <= maxDate;
        });

        if (eventosEnMes.length === 0) {
            const d = estabaActivoAlEmpezar ? limitDay : 0;
            return (d === lastDayOfMonth) ? 30 : d;
        }

        let activosLiteral = 0;
        let estadoDiaActual = estabaActivoAlEmpezar;

        for (let dia = 1; dia <= limitDay; dia++) {
            const fechaStrFormatoString = new Date(año, mes - 1, dia).toLocaleDateString("en-CA");
            
            const ev = eventosEnMes.filter(r => r.fecha.startsWith(fechaStrFormatoString));
            if (ev.length > 0) {
                const e = ev[ev.length - 1];
                estadoDiaActual = (e.tipo === 'ingreso' || e.tipo === 're-ingreso');
            }

            if (estadoDiaActual) {
                activosLiteral++;
            }
        }

        let ajusteComercial = activosLiteral;
        // Solo ajustamos a 30 si el mes está completo y el trabajador estuvo activo todo el tiempo
        if (limitDay === lastDayOfMonth && activosLiteral === lastDayOfMonth) {
            ajusteComercial = 30; 
        } else {
            if (ajusteComercial > 30) ajusteComercial = 30;
        }

        return ajusteComercial;

    } catch (error) {
        console.error("Error calculando ARL:", error);
        return 30;
    }
};
