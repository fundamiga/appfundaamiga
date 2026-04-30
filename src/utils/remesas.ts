import { supabaseRemesas as supabase } from '@/lib/supabaseRemesas';

// Lógica para calcular los días comerciales de Remesas (basado en la lógica de ARL)
export const calcularDiasRemesas = async (cedula: string, mes: number, año: number, fechaHasta?: string | Date): Promise<number> => {
    try {
        const { data: registros } = await supabase
            .from('registros_remesas')
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
        } else if (esMesActual) {
            limitDay = hoy.getDate();
        } else if (esMesFuturo) {
            limitDay = 0;
        }

        if (!registros || registros.length === 0) {
            const d = limitDay;
            return (d === lastDayOfMonth) ? 30 : d;
        }

        const regAntes = registros.filter(r => new Date(r.fecha) < minDate);
        let estabaActivoAlEmpezar = true; 
        
        if (regAntes.length > 0) {
            const u = regAntes[regAntes.length - 1];
            estabaActivoAlEmpezar = (u.tipo === 'ingreso' || u.tipo === 're-ingreso');
        }

        const eventosEnMes = registros.filter(r => {
            const d = new Date(r.fecha);
            return d >= minDate && d <= maxDate;
        });

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
        if (limitDay === lastDayOfMonth && activosLiteral === lastDayOfMonth) {
            ajusteComercial = 30; 
        } else {
            if (ajusteComercial > 30) ajusteComercial = 30;
        }

        return ajusteComercial;

    } catch (error) {
        console.error("Error calculando Remesas:", error);
        return 30;
    }
};
