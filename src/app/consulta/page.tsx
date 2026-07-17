'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── Conexión a la misma base de datos de trabajadores ──────────────────────
const supabase = createClient(
  'https://upgrsqatxeokoagcwbks.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwZ3JzcWF0eGVva29hZ2N3YmtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NTM0NzUsImV4cCI6MjA5MDMyOTQ3NX0.b87zEqrr-dznnsOwX58mKHlVcgLjYEJkTTJwaf5-KCQ'
);

interface Trabajador {
  id: string;
  nombre: string;
  cedula: string;
  cargo: string;
}

const cargoColor: Record<string, { bg: string; text: string; border: string }> = {
  'CONTRATISTAS DE ADMINISTRACION': { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  '5 - 6':   { bg: '#dbeafe', text: '#1e3a8a', border: '#93c5fd' },
  '6 - 6':   { bg: '#ede9fe', text: '#4c1d95', border: '#c4b5fd' },
  'CARTON C': { bg: '#ffedd5', text: '#7c2d12', border: '#fdba74' },
  'GUACANDA': { bg: '#ccfbf1', text: '#134e4a', border: '#5eead4' },
  'TERCERA':  { bg: '#fce7f3', text: '#831843', border: '#f9a8d4' },
  'ROZO':    { bg: '#fef3c7', text: '#78350f', border: '#fcd34d' },
  '2 - 10':  { bg: '#cffafe', text: '#164e63', border: '#67e8f9' },
  'MAYORISTA':{ bg: '#e0e7ff', text: '#1e1b4b', border: '#a5b4fc' },
  'GUABINAS': { bg: '#ffe4e6', text: '#881337', border: '#fda4af' },
  'BOLIVAR':  { bg: '#ecfccb', text: '#365314', border: '#a3e635' },
  'REMESAS':  { bg: '#fefce8', text: '#713f12', border: '#fde047' },
};

export default function ConsultaPersonal() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error } = await supabase
      .from('trabajadores')
      .select('id, nombre, cedula, cargo')
      .order('nombre');
    if (error) setError('No se pudo conectar a la base de datos.');
    else setTrabajadores(data || []);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const copiar = async (texto: string, id: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // fallback for older browsers
      const el = document.createElement('textarea');
      el.value = texto;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    }
  };

  const filtrados = trabajadores.filter(t => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (
      t.nombre.toLowerCase().includes(q) ||
      t.cedula.includes(q) ||
      t.cargo.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f0f9ff; min-height: 100vh; }
        
        .page { min-height: 100vh; background: linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 50%, #fefce8 100%); }

        /* ── HEADER ─────────────────────────────────────── */
        .header {
          background: white;
          border-bottom: 2px solid #e2e8f0;
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .header-title { font-size: 22px; font-weight: 900; color: #1e293b; letter-spacing: -0.5px; }
        .header-subtitle { font-size: 12px; color: #059669; font-weight: 700; margin-top: 2px; text-transform: uppercase; letter-spacing: 1px; }
        .dot { width:8px; height:8px; background:#10b981; border-radius:50%; display:inline-block; margin-right:6px; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        /* ── SEARCH BOX ───────────────────────────────── */
        .search-wrap { max-width: 720px; margin: 32px auto 0; padding: 0 20px; }
        .search-label { font-size: 15px; font-weight: 800; color: #334155; margin-bottom: 10px; display: block; }
        .search-box {
          display: flex;
          align-items: center;
          background: white;
          border: 2.5px solid #cbd5e1;
          border-radius: 16px;
          padding: 14px 18px;
          gap: 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .search-box:focus-within { border-color: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,0.12); }
        .search-icon { font-size: 22px; flex-shrink: 0; }
        .search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 17px;
          font-weight: 600;
          color: #1e293b;
          background: transparent;
          font-family: inherit;
        }
        .search-input::placeholder { color: #94a3b8; font-weight: 500; }
        .clear-btn {
          background: #f1f5f9;
          border: none;
          border-radius: 8px;
          width: 30px; height: 30px;
          cursor: pointer;
          font-size: 16px;
          display: flex; align-items: center; justify-content: center;
          color: #64748b;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .clear-btn:hover { background: #fee2e2; color: #ef4444; }

        /* ── COUNTER ───────────────────────────────────── */
        .counter { max-width:720px; margin: 12px auto 0; padding: 0 20px; font-size:13px; font-weight:700; color:#64748b; }

        /* ── CARD LIST ─────────────────────────────────── */
        .list { max-width:720px; margin: 16px auto 40px; padding: 0 20px; display:flex; flex-direction:column; gap:10px; }

        .card {
          background: white;
          border-radius: 16px;
          border: 2px solid #e2e8f0;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
          cursor: default;
        }
        .card:hover { border-color: #10b981; box-shadow: 0 4px 16px rgba(16,185,129,0.12); transform: translateY(-1px); }

        .avatar {
          width: 46px; height: 46px;
          border-radius: 50%;
          background: linear-gradient(135deg, #10b981, #0d9488);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; font-weight: 900; color: white;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(16,185,129,0.3);
        }

        .card-info { flex: 1; min-width: 0; }
        .card-name { font-size: 16px; font-weight: 800; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .card-cedula { font-size: 13px; color: #64748b; font-weight: 600; font-family: monospace; margin-top: 2px; }
        .cargo-badge {
          display: inline-block;
          font-size: 10px; font-weight: 900;
          padding: 3px 10px;
          border-radius: 100px;
          border: 1.5px solid;
          margin-top: 5px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .card-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }

        .copy-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px;
          border-radius: 10px;
          border: 2px solid;
          font-size: 12px; font-weight: 800;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
          white-space: nowrap;
        }
        .copy-btn-nombre {
          background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;
        }
        .copy-btn-nombre:hover { background: #1d4ed8; color: white; border-color: #1d4ed8; }

        .copy-btn-cedula {
          background: #f0fdf4; color: #059669; border-color: #6ee7b7;
        }
        .copy-btn-cedula:hover { background: #059669; color: white; border-color: #059669; }

        .copy-btn.copied { background: #d1fae5 !important; color: #059669 !important; border-color: #6ee7b7 !important; }

        /* ── STATES ─────────────────────────────────────── */
        .state-box { max-width:720px; margin: 60px auto; padding: 0 20px; text-align:center; }
        .state-emoji { font-size: 52px; margin-bottom: 16px; }
        .state-title { font-size: 18px; font-weight: 800; color: #334155; margin-bottom: 8px; }
        .state-sub { font-size: 14px; color: #94a3b8; font-weight: 500; }
        .spin { animation: spin 1s linear infinite; display: inline-block; font-size: 36px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .retry-btn {
          margin-top: 20px; padding: 12px 28px;
          background: #059669; color: white;
          border: none; border-radius: 12px;
          font-size: 15px; font-weight: 800;
          cursor: pointer; font-family: inherit;
          transition: background 0.15s;
        }
        .retry-btn:hover { background: #047857; }

        /* ── FOOTER ─────────────────────────────────────── */
        .footer { text-align:center; padding: 20px; font-size:12px; color:#94a3b8; font-weight:600; }

        @media (max-width: 500px) {
          .card { flex-wrap: wrap; }
          .card-actions { flex-direction: row; width: 100%; }
          .copy-btn { flex: 1; justify-content: center; }
          .header-title { font-size: 18px; }
        }
      `}</style>

      <div className="page">
        {/* ── HEADER ── */}
        <div className="header">
          <div>
            <div className="header-title">🔍 Consulta de Personal</div>
            <div className="header-subtitle">
              <span className="dot" />
              Fundamiga · Solo lectura
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textAlign: 'right' }}>
            {cargando ? '…' : trabajadores.length} trabajadores<br />
            <span style={{ color: '#10b981', fontSize: 11 }}>● En línea</span>
          </div>
        </div>

        {/* ── SEARCH ── */}
        <div className="search-wrap">
          <label className="search-label">Busca por nombre, cédula o cargo:</label>
          <div className="search-box">
            <span className="search-icon">🔎</span>
            <input
              id="buscador-principal"
              className="search-input"
              type="text"
              placeholder="Escribe aquí…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            {busqueda && (
              <button className="clear-btn" onClick={() => setBusqueda('')} title="Limpiar búsqueda">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── COUNTER ── */}
        {!cargando && !error && (
          <div className="counter">
            {busqueda
              ? `Mostrando ${filtrados.length} de ${trabajadores.length} trabajadores`
              : `${trabajadores.length} trabajadores en total`}
          </div>
        )}

        {/* ── CONTENIDO ── */}
        {cargando ? (
          <div className="state-box">
            <div className="spin">⏳</div>
            <p className="state-title" style={{ marginTop: 16 }}>Cargando trabajadores…</p>
            <p className="state-sub">Conectando a la base de datos</p>
          </div>
        ) : error ? (
          <div className="state-box">
            <div className="state-emoji">❌</div>
            <p className="state-title">Error de conexión</p>
            <p className="state-sub">{error}</p>
            <button className="retry-btn" onClick={cargar}>🔄 Reintentar</button>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="state-box">
            <div className="state-emoji">🤷</div>
            <p className="state-title">No se encontró nadie</p>
            <p className="state-sub">Intenta con otro nombre o cédula</p>
            {busqueda && (
              <button className="retry-btn" onClick={() => setBusqueda('')}>Ver todos</button>
            )}
          </div>
        ) : (
          <div className="list">
            {filtrados.map(t => {
              const colores = cargoColor[t.cargo] || { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' };
              const inicial = t.nombre.charAt(0).toUpperCase();
              const cId = `nombre-${t.id}`;
              const cedId = `cedula-${t.id}`;

              return (
                <div className="card" key={t.id}>
                  {/* Avatar */}
                  <div className="avatar">{inicial}</div>

                  {/* Info */}
                  <div className="card-info">
                    <div className="card-name" title={t.nombre}>{t.nombre}</div>
                    <div className="card-cedula">C.C. {t.cedula || '—'}</div>
                    <span
                      className="cargo-badge"
                      style={{ backgroundColor: colores.bg, color: colores.text, borderColor: colores.border }}
                    >
                      {t.cargo}
                    </span>
                  </div>

                  {/* Botones de copiar */}
                  <div className="card-actions">
                    <button
                      id={cId}
                      className={`copy-btn copy-btn-nombre${copiado === cId ? ' copied' : ''}`}
                      onClick={() => copiar(t.nombre, cId)}
                      title="Copiar nombre"
                    >
                      {copiado === cId ? '✅ Copiado' : '📋 Nombre'}
                    </button>
                    {t.cedula && (
                      <button
                        id={cedId}
                        className={`copy-btn copy-btn-cedula${copiado === cedId ? ' copied' : ''}`}
                        onClick={() => copiar(t.cedula, cedId)}
                        title="Copiar cédula"
                      >
                        {copiado === cedId ? '✅ Copiado' : '🪪 Cédula'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="footer">Fundamiga · Consulta de Personal · Solo lectura</div>
      </div>
    </>
  );
}
