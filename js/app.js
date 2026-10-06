/*
 * Designações do Júri — microsite sem servidor.
 * Os dados ficam no navegador (localStorage); use Configurações > Backup para salvar/transferir.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ constantes

  const STORAGE_KEY = 'dpejurix:v1';

  // grupo: andamento (conta como "em andamento"), realizado, encerrado (concluído sem sessão)
  const STATUS = [
    { v: 'agendado', label: 'Agendado', grupo: 'andamento', cls: 'info' },
    { v: 'redesignado', label: 'Redesignado', grupo: 'andamento', cls: 'warn' },
    { v: 'realizado', label: 'Realizado', grupo: 'realizado', cls: 'ok' },
    { v: 'deslocou', label: 'Não realizado, mas se deslocou', grupo: 'encerrado', cls: 'warn' },
    { v: 'nao_realizado', label: 'Não realizado', grupo: 'encerrado', cls: 'bad' },
    { v: 'nao_atendido', label: 'Não atendido', grupo: 'encerrado', cls: 'bad' },
    { v: 'cancelado', label: 'Cancelado', grupo: 'encerrado', cls: 'bad' },
    { v: 'adv', label: 'Advogado constituído', grupo: 'encerrado', cls: '' },
  ];
  const STATUS_BY = Object.fromEntries(STATUS.map((s) => [s.v, s]));

  const FUNDAMENTOS = ['ART. 4º', 'ART. 5º', 'ART. 6º, I', 'ART. 6º, II', 'ART. 6º, III', 'ART. 6º, IV',
    'ART. 6º, I E IV', 'ADV CONSTITUÍDO', 'NÃO SE ENQUADRA', 'NÃO É HIPÓTESE'];

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // ------------------------------------------------------------------ utilidades

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function isoHoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtData(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  function fmtKm(km) {
    if (km == null || isNaN(km)) return '—';
    return Math.round(km).toLocaleString('pt-BR') + ' km';
  }
  function iniciais(nome) {
    const p = nome.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁ-Ú]/.test(w));
    return ((p[0] || '')[0] || '') + ((p[p.length - 1] || '')[0] || '');
  }
  function primeiroNome(nome) {
    const p = nome.split(/\s+/);
    return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : nome;
  }

  // Tempo de DPE a partir da data de ingresso (AAAA-MM-DD)
  function tempoDPE(ingresso) {
    if (!ingresso) return null;
    const ini = new Date(ingresso + 'T00:00:00');
    const hoje = new Date();
    let meses = (hoje.getFullYear() - ini.getFullYear()) * 12 + (hoje.getMonth() - ini.getMonth());
    if (hoje.getDate() < ini.getDate()) meses -= 1;
    if (meses < 0) return null;
    const a = Math.floor(meses / 12), m = meses % 12;
    const partes = [];
    if (a) partes.push(a + (a === 1 ? ' ano' : ' anos'));
    if (m || !a) partes.push(m + (m === 1 ? ' mês' : ' meses'));
    return { meses, texto: partes.join(' e ') };
  }

  // Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
  function mascaraCNJ(v) {
    if (/[^\d.\-\s]/.test(v)) return v; // texto livre: não mexe
    const d = v.replace(/\D/g, '').slice(0, 20);
    const parts = [[0, 7], [7, 9], [9, 13], [13, 14], [14, 16], [16, 20]];
    const seps = ['', '-', '.', '.', '.', '.'];
    let out = '';
    parts.forEach(([a, b], i) => { if (d.length > a) out += seps[i] + d.slice(a, b); });
    return out;
  }

  // ------------------------------------------------------------------ municípios e distância

  const MUN = window.MUNICIPIOS || {};
  const MUN_NOMES = Object.keys(MUN).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const MUN_IDX = Object.fromEntries(MUN_NOMES.map((n) => [norm(n), n]));
  const nomeMunicipio = (s) => MUN_IDX[norm(s)] || null;
  const coords = (s) => { const n = nomeMunicipio(s); return n ? MUN[n] : null; };

  function haversineKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Rodoviária de cada município (js/rodoviarias.js): { n: nome, a: endereço, c: [lat, lng], p: place_id }.
  // As rotas saem da rodoviária da cidade do defensor e chegam à rodoviária da comarca.
  const RODOVIARIAS = window.RODOVIARIAS || {};
  const rodoviaria = (mun) => RODOVIARIAS[nomeMunicipio(mun)] || null;
  const uf = (mun) => (nomeMunicipio(mun) === 'Brasília/DF' ? 'DF' : 'BA');
  const cidade = (mun) => (nomeMunicipio(mun) || mun).replace('/DF', '');
  // Ponto usado no cálculo: rodoviária localizada ou, se não houver, a sede do município.
  const pontoRota = (mun) => { const r = rodoviaria(mun); return r ? r.c : coords(mun); };
  const nomeTerminal = (mun) => { const r = rodoviaria(mun); return r ? r.n : `Rodoviária de ${cidade(mun)}`; };
  function mapsUrl(origem, comarca) {
    const ro = rodoviaria(origem), rd = rodoviaria(comarca);
    const p = new URLSearchParams({ api: '1', travelmode: 'driving' });
    p.set('origin', ro ? `${ro.c[0]},${ro.c[1]}` : `Rodoviária de ${cidade(origem)}, ${uf(origem)}`);
    if (ro && ro.p) p.set('origin_place_id', ro.p);
    p.set('destination', rd ? `${rd.c[0]},${rd.c[1]}` : `Rodoviária de ${cidade(comarca)}, ${uf(comarca)}`);
    if (rd && rd.p) p.set('destination_place_id', rd.p);
    return 'https://www.google.com/maps/dir/?' + p.toString();
  }

  // Google Routes API (computeRouteMatrix) — ponto de partida e destino pelas coordenadas da sede do município
  async function distanciaGoogle(a, b, chave) {
    const ponto = (c) => ({ waypoint: { location: { latLng: { latitude: c[0], longitude: c[1] } } } });
    const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': 'distanceMeters,duration,condition' },
      body: JSON.stringify({ origins: [ponto(a)], destinations: [ponto(b)], travelMode: 'DRIVE' }),
    });
    const j = await r.json();
    const el = Array.isArray(j) ? j[0] : null;
    if (!r.ok || !el || el.condition !== 'ROUTE_EXISTS') throw new Error((j.error && j.error.message) || 'sem rota');
    return { km: el.distanceMeters / 1000, min: Math.round(parseInt(el.duration, 10) / 60) };
  }

  async function distanciaOSRM(a, b) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=false`;
      const r = await fetch(url, { signal: ctrl.signal });
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error(j.code || 'sem rota');
      return { km: j.routes[0].distance / 1000, min: Math.round(j.routes[0].duration / 60) };
    } finally { clearTimeout(t); }
  }

  async function calcularDistancia(origem, comarca) {
    const a = pontoRota(origem), b = pontoRota(comarca);
    if (nomeMunicipio(origem) && nomeMunicipio(origem) === nomeMunicipio(comarca)) return { km: 0, min: 0, fonte: 'mesma cidade' };
    if (!a || !b) return null;
    const chave = state.config.googleKey;
    if (chave) {
      try { return { ...(await distanciaGoogle(a, b, chave)), fonte: 'Google Maps' }; }
      catch (e) { console.warn('Google Maps falhou:', e); }
    }
    try { return { ...(await distanciaOSRM(a, b)), fonte: 'rota OpenStreetMap' }; }
    catch (e) { console.warn('OSRM falhou:', e); }
    return { km: haversineKm(a, b) * 1.3, min: null, fonte: 'estimativa (linha reta × 1,3)' };
  }

  const chaveDist = (o, c) => `${nomeMunicipio(o) || o}|${nomeMunicipio(c) || c}`;
  const emCalculo = new Set();
  // Tabela pré-calculada pelo Google (js/distancias.js) tem prioridade sobre o que foi calculado no navegador.
  function distanciaTabela(origem, comarca) {
    const t = window.DISTANCIAS || {};
    const linha = t[nomeMunicipio(origem)];
    const v = linha && linha[nomeMunicipio(comarca)];
    return v ? { km: v[0], min: v[1], fonte: 'Google Maps' } : null;
  }
  function distanciaSalva(origem, comarca) {
    if (nomeMunicipio(origem) && nomeMunicipio(origem) === nomeMunicipio(comarca)) return { km: 0, min: 0, fonte: 'mesma cidade' };
    return distanciaTabela(origem, comarca) || state.distancias[chaveDist(origem, comarca)] || null;
  }
  // Distância para mostrar na lista de seleção (tabela, cálculo salvo ou estimativa).
  function kmPrevia(origem, comarca) {
    const d = distanciaSalva(origem, comarca);
    if (d) return d.km;
    const a = pontoRota(origem), b = pontoRota(comarca);
    return a && b ? haversineKm(a, b) * 1.3 : null;
  }

  async function garantirDistancia(origem, comarca, forcar = false) {
    if (!origem || !comarca) return;
    const k = chaveDist(origem, comarca);
    if (distanciaTabela(origem, comarca) || (nomeMunicipio(origem) && nomeMunicipio(origem) === nomeMunicipio(comarca))) return;
    if ((!forcar && state.distancias[k]) || emCalculo.has(k)) return;
    emCalculo.add(k);
    render();
    try {
      const r = await calcularDistancia(origem, comarca);
      if (r) { state.distancias[k] = { ...r, em: isoHoje() }; salvar(); }
    } finally {
      emCalculo.delete(k);
      render();
    }
  }

  // ------------------------------------------------------------------ estado

  function estadoInicial() {
    return {
      versao: 1,
      defensores: (window.DEFENSORES_INICIAIS || []).map(([nome, origem]) => ({ id: uid(), nome, origem, ingresso: '', historico: 0, ativo: true })),
      juris: [],
      distancias: {},
      config: { googleKey: '' },
    };
  }
  function carregar() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.defensores) && Array.isArray(s.juris)) {
          s.distancias = s.distancias || {};
          s.config = s.config || { googleKey: '' };
          return s;
        }
      }
    } catch (e) { console.warn(e); }
    return estadoInicial();
  }
  let state = carregar();
  let persistente = true;
  function salvar() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); persistente = true; }
    catch (e) { persistente = false; console.warn('Não foi possível salvar no navegador', e); }
  }
  salvar();

  const defById = (id) => state.defensores.find((d) => d.id === id);
  const juriById = (id) => state.juris.find((j) => j.id === id);
  const grupoDe = (j) => (STATUS_BY[j.status] || STATUS[0]).grupo;

  // ------------------------------------------------------------------ cálculos

  // Indicadores de um defensor. excluirJuri: ignora o próprio júri ao contar designações futuras.
  function estatisticas(defId, excluirJuri) {
    const hoje = isoHoje();
    const def = defById(defId);
    let realizados = def ? Number(def.historico) || 0 : 0;
    let futuros = 0, habilitacoes = 0, art422 = 0;
    for (const j of state.juris) {
      const h = j.habilitacoes.find((x) => x.defensorId === defId);
      if (!h) continue;
      habilitacoes++;
      if (h.art422) art422++;
      if (!h.designado || h.desistiu) continue;
      if (j.status === 'realizado') realizados++;
      else if (grupoDe(j) === 'andamento' && j.id !== excluirJuri && (!j.data || j.data >= hoje)) futuros++;
    }
    return { realizados, futuros, habilitacoes, art422 };
  }

  function kmDe(h, def, juri) {
    if (h.kmManual != null && h.kmManual !== '') return { km: Number(h.kmManual), fonte: 'informado manualmente', min: null };
    const d = def && distanciaSalva(def.origem, juri.comarca);
    return d ? { km: d.km, fonte: d.fonte, min: d.min } : { km: null, fonte: null, min: null };
  }

  // Ordem: 1) fez art. 422  2) menor distância  3) menos júris realizados  4) menos designações futuras  5) maior antiguidade
  function comparar(a, b) {
    if (a.h.art422 !== b.h.art422) return a.h.art422 ? -1 : 1;
    const ka = a.km == null ? Infinity : Math.round(a.km), kb = b.km == null ? Infinity : Math.round(b.km);
    if (ka !== kb) return ka - kb;
    if (a.st.realizados !== b.st.realizados) return a.st.realizados - b.st.realizados;
    if (a.st.futuros !== b.st.futuros) return a.st.futuros - b.st.futuros;
    const ia = a.def.ingresso || '9999', ib = b.def.ingresso || '9999';
    if (ia !== ib && a.def.ingresso && b.def.ingresso) return ia < ib ? -1 : 1;
    return 0;
  }

  function classificar(juri) {
    const linhas = juri.habilitacoes.map((h) => {
      const def = defById(h.defensorId);
      if (!def) return null;
      const k = kmDe(h, def, juri);
      return { h, def, km: k.km, fonteKm: k.fonte, minutos: k.min, st: estatisticas(def.id, juri.id) };
    }).filter(Boolean);
    const ativos = linhas.filter((l) => !l.h.desistiu).sort((a, b) => comparar(a, b) || a.def.nome.localeCompare(b.def.nome, 'pt-BR'));
    const desistentes = linhas.filter((l) => l.h.desistiu);
    const vagas = Number(juri.vagas) || 0;
    let pos = 0;
    ativos.forEach((l, i) => {
      const empatePrev = i > 0 && comparar(ativos[i - 1], l) === 0;
      const empateNext = i < ativos.length - 1 && comparar(l, ativos[i + 1]) === 0;
      pos = empatePrev ? pos : i + 1;
      l.pos = pos;
      l.empate = empatePrev || empateNext;
      l.dentro = vagas > 0 && i < vagas;
    });
    const empateNaVaga = vagas > 0 && vagas < ativos.length && comparar(ativos[vagas - 1], ativos[vagas]) === 0;
    const semKm = ativos.some((l) => l.km == null);
    return { ativos, desistentes, vagas, empateNaVaga, semKm };
  }

  function totais() {
    const t = { total: state.juris.length, realizados: 0, andamento: 0, concluidos: 0 };
    for (const j of state.juris) {
      const g = grupoDe(j);
      if (g === 'andamento') t.andamento++;
      else { t.concluidos++; if (g === 'realizado') t.realizados++; }
    }
    return t;
  }

  // ------------------------------------------------------------------ estado da interface

  const ui = {
    defBusca: '', defOrdem: { chave: 'nome', dir: 1 },
    jurisFiltro: 'todos', jurisBusca: '',
    confirmar: null, // { tipo, id }
    habBusca: '', habSel: new Set(), habData: '', hab422: false,
  };

  function rota() {
    const h = (location.hash || '#painel').slice(1);
    if (h.startsWith('juri-')) return { tela: 'juri', id: h.slice(5) };
    if (h.startsWith('defensor-')) return { tela: 'defensor', id: h.slice(9) };
    if (['painel', 'juris', 'defensores', 'config', 'novo-juri'].includes(h)) return { tela: h };
    return { tela: 'painel' };
  }

  // ------------------------------------------------------------------ componentes

  const pillStatus = (j) => { const s = STATUS_BY[j.status] || STATUS[0]; return `<span class="pill ${s.cls}">${esc(s.label)}</span>`; };
  const tempoTxt = (def) => { const t = tempoDPE(def.ingresso); return t ? esc(t.texto) : '<span class="muted small">aguardando data</span>'; };
  const opcoes = (lista, atual) => lista.map((o) => `<option value="${esc(o.v ?? o)}"${(o.v ?? o) === atual ? ' selected' : ''}>${esc(o.label ?? o)}</option>`).join('');
  const datalistMunicipios = () => `<datalist id="dl-municipios">${MUN_NOMES.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;

  function seta(chave) {
    if (ui.defOrdem.chave !== chave) return '';
    return `<span class="arrow" aria-hidden="true">${ui.defOrdem.dir > 0 ? '▲' : '▼'}</span>`;
  }

  function linhasDefensores(filtrarAtivos) {
    const busca = norm(ui.defBusca);
    let lista = state.defensores
      .filter((d) => !filtrarAtivos || d.ativo !== false)
      .filter((d) => !busca || norm(d.nome).includes(busca) || norm(d.origem).includes(busca))
      .map((d) => ({ d, st: estatisticas(d.id), t: tempoDPE(d.ingresso) }));
    const { chave, dir } = ui.defOrdem;
    const val = (x) => chave === 'nome' ? x.d.nome : chave === 'origem' ? x.d.origem : chave === 'tempo' ? (x.t ? x.t.meses : -1) : x.st[chave];
    lista.sort((a, b) => {
      const va = val(a), vb = val(b);
      const r = typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb;
      return r * dir || a.d.nome.localeCompare(b.d.nome, 'pt-BR');
    });
    return lista;
  }

  function tabelaDefensores({ completa }) {
    const lista = linhasDefensores(!completa);
    if (!lista.length) return `<div class="empty"><strong>Nenhum defensor encontrado</strong><span>Ajuste a busca ou cadastre na aba Defensores.</span></div>`;
    const th = (chave, rotulo, cls = '') => `<th class="sortable ${cls}" data-action="ordenar-def" data-chave="${chave}" aria-sort="${ui.defOrdem.chave === chave ? (ui.defOrdem.dir > 0 ? 'ascending' : 'descending') : 'none'}">${rotulo}${seta(chave)}</th>`;
    return `<div class="table-wrap"><table>
      <thead><tr>
        ${th('nome', 'Defensor(a)')}
        ${completa ? th('origem', 'Origem') : ''}
        ${th('realizados', 'Júris realizados', 'r')}
        ${th('futuros', 'Júris futuros', 'r')}
        ${completa ? th('habilitacoes', 'Habilitações', 'r') : ''}
        ${th('tempo', 'Tempo de DPE')}
        ${completa ? '<th>Situação</th>' : ''}
      </tr></thead>
      <tbody>${lista.map(({ d, st }) => `
        <tr class="clickable${d.ativo === false ? ' is-out' : ''}" data-href="#defensor-${d.id}">
          <td><a class="name" href="#defensor-${d.id}">${esc(d.nome)}</a>${completa ? '' : `<div class="small muted">${esc(d.origem)}</div>`}</td>
          ${completa ? `<td>${esc(d.origem)}</td>` : ''}
          <td class="r"><span class="big-num">${st.realizados}</span></td>
          <td class="r"><span class="big-num">${st.futuros}</span></td>
          ${completa ? `<td class="r num">${st.habilitacoes}</td>` : ''}
          <td>${tempoTxt(d)}</td>
          ${completa ? `<td>${d.ativo === false ? '<span class="pill">Inativo</span>' : '<span class="pill accent">Ativo</span>'}</td>` : ''}
        </tr>`).join('')}
      </tbody></table></div>`;
  }

  // ------------------------------------------------------------------ telas

  function telaPainel() {
    const t = totais();
    const hoje = isoHoje();
    const proximos = state.juris.filter((j) => grupoDe(j) === 'andamento' && j.data && j.data >= hoje)
      .sort((a, b) => a.data.localeCompare(b.data)).slice(0, 6);
    const pendentes = state.juris.filter((j) => grupoDe(j) === 'andamento' && j.data && j.data < hoje);
    const semDesignacao = state.juris.filter((j) => grupoDe(j) === 'andamento' && !j.habilitacoes.some((h) => h.designado && !h.desistiu));

    return `
    <div class="page-head">
      <div><div class="eyebrow">Hoje, ${fmtData(hoje)}</div><h1>Painel</h1></div>
      <div class="actions"><a class="btn primary" href="#novo-juri">+ Registrar júri</a></div>
    </div>

    <section class="kpis" aria-label="Totais">
      <div class="kpi k-ok"><span class="label">Júris realizados</span><span class="value">${t.realizados}</span><span class="hint">sessão ocorreu</span></div>
      <div class="kpi k-info"><span class="label">Em andamento</span><span class="value">${t.andamento}</span><span class="hint">agendados ou redesignados</span></div>
      <div class="kpi k-accent"><span class="label">Concluídos</span><span class="value">${t.concluidos}</span><span class="hint">encerrados com qualquer desfecho</span></div>
      <div class="kpi"><span class="label">Total registrado</span><span class="value">${t.total}</span><span class="hint">processos cadastrados</span></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Defensores</h2>
        <input id="def-busca" class="search" type="search" placeholder="Buscar por nome ou cidade" value="${esc(ui.defBusca)}" aria-label="Buscar defensor">
      </div>
      ${tabelaDefensores({ completa: false })}
      <div class="panel-note">Clique no nome para ver o perfil e as habilitações. Júris realizados somam o histórico informado no perfil e as designações em júris com desfecho “Realizado”.</div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><h2>Próximas sessões</h2><a class="btn sm" href="#juris">Ver todos</a></div>
        ${proximos.length ? `<ul class="next-list">${proximos.map((j) => {
          const [, m, d] = j.data.split('-');
          const des = j.habilitacoes.filter((h) => h.designado && !h.desistiu).map((h) => defById(h.defensorId)).filter(Boolean);
          return `<li>
            <div class="date-chip"><span class="d">${d}</span><span class="m">${MESES[Number(m) - 1]}</span></div>
            <div style="min-width:0"><a href="#juri-${j.id}">${esc(j.comarca)}</a>
              <div class="small muted mono">${esc(j.processo)}</div>
              <div class="small">${des.length ? des.map((x) => esc(primeiroNome(x.nome))).join(', ') : '<span class="muted">sem designação</span>'}</div></div>
            ${pillStatus(j)}
          </li>`; }).join('')}</ul>`
        : `<div class="empty"><strong>Nenhuma sessão futura</strong><span>Registre um júri com data para vê-lo aqui.</span></div>`}
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Pendências</h2></div>
        <div class="panel-body">
          ${!pendentes.length && !semDesignacao.length ? '<p class="muted">Nada pendente.</p>' : ''}
          ${pendentes.length ? `<div class="notice warn"><b>${pendentes.length}</b> júri(s) com data passada ainda em andamento. Atualize o desfecho:
            ${pendentes.map((j) => `<a href="#juri-${j.id}">${esc(j.comarca)} (${fmtData(j.data)})</a>`).join(', ')}</div>` : ''}
          ${semDesignacao.length ? `<div class="notice"><b>${semDesignacao.length}</b> júri(s) em andamento sem defensor designado:
            ${semDesignacao.map((j) => `<a href="#juri-${j.id}">${esc(j.comarca)}</a>`).join(', ')}</div>` : ''}
        </div>
      </section>
    </div>`;
  }

  function telaJuris() {
    const busca = norm(ui.jurisBusca);
    const hoje = isoHoje();
    const filtros = [['todos', 'Todos'], ['andamento', 'Em andamento'], ['realizado', 'Realizados'], ['concluido', 'Concluídos']];
    const lista = state.juris.filter((j) => {
      const g = grupoDe(j);
      if (ui.jurisFiltro === 'andamento' && g !== 'andamento') return false;
      if (ui.jurisFiltro === 'realizado' && g !== 'realizado') return false;
      if (ui.jurisFiltro === 'concluido' && g === 'andamento') return false;
      if (!busca) return true;
      const nomes = j.habilitacoes.map((h) => (defById(h.defensorId) || {}).nome).join(' ');
      return [j.processo, j.comarca, j.sei, j.seiComplementar, nomes].some((v) => norm(v).includes(busca));
    }).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    return `
    <div class="page-head">
      <div><div class="eyebrow">${state.juris.length} registrado(s)</div><h1>Júris</h1></div>
      <div class="actions"><a class="btn primary" href="#novo-juri">+ Registrar júri</a></div>
    </div>
    <section class="panel">
      <div class="panel-head">
        <div class="filters">${filtros.map(([v, l]) => `<button class="chip-btn${ui.jurisFiltro === v ? ' on' : ''}" data-action="filtro-juris" data-v="${v}">${l}</button>`).join('')}</div>
        <input id="juris-busca" class="search" type="search" placeholder="Processo, comarca, SEI ou defensor" value="${esc(ui.jurisBusca)}" aria-label="Buscar júri">
      </div>
      ${lista.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Processo</th><th>Comarca</th><th>Nº SEI</th><th class="r">Habilitados</th><th>Designado(s)</th><th>Situação</th></tr></thead>
        <tbody>${lista.map((j) => {
          const ativos = j.habilitacoes.filter((h) => !h.desistiu);
          const des = ativos.filter((h) => h.designado).map((h) => defById(h.defensorId)).filter(Boolean);
          const atrasado = grupoDe(j) === 'andamento' && j.data && j.data < hoje;
          return `<tr class="clickable" data-href="#juri-${j.id}">
            <td class="num" style="white-space:nowrap">${fmtData(j.data)}</td>
            <td><a class="name mono" href="#juri-${j.id}">${esc(j.processo)}</a></td>
            <td>${esc(j.comarca)}</td>
            <td class="mono">${esc(j.sei) || '<span class="muted">—</span>'}</td>
            <td class="r num">${ativos.length}${ativos.some((h) => h.art422) ? ' <span class="pill gold" title="Há defensor com art. 422">422</span>' : ''}</td>
            <td>${des.length ? des.map((d) => esc(primeiroNome(d.nome))).join(', ') : '<span class="muted">—</span>'}</td>
            <td>${pillStatus(j)}${atrasado ? ' <span class="pill warn">atualizar desfecho</span>' : ''}</td>
          </tr>`; }).join('')}</tbody></table></div>`
      : `<div class="empty"><strong>${state.juris.length ? 'Nenhum júri neste filtro' : 'Nenhum júri registrado ainda'}</strong>
          <span>${state.juris.length ? 'Ajuste o filtro ou a busca.' : 'Registre o número do processo, a comarca e o número SEI para começar.'}</span>
          ${state.juris.length ? '' : '<a class="btn primary" href="#novo-juri">+ Registrar júri</a>'}</div>`}
    </section>`;
  }

  function formJuri(j, novo) {
    const v = j || { processo: '', comarca: '', data: '', sei: '', seiComplementar: '', vagas: 1, fundamento: '', status: 'agendado', observacoes: '' };
    const comarcaInvalida = v.comarca && !nomeMunicipio(v.comarca);
    return `<form id="form-juri" class="form" data-novo="${novo ? 1 : 0}" autocomplete="off">
      <div class="field s6"><label for="j-processo">Número do processo <span class="req">*</span></label>
        <input id="j-processo" name="processo" class="mono" required placeholder="0000000-00.0000.8.05.0000" value="${esc(v.processo)}"></div>
      <div class="field s6"><label for="j-comarca">Comarca do júri <span class="req">*</span></label>
        <input id="j-comarca" name="comarca" list="dl-municipios" required placeholder="Digite o município" value="${esc(v.comarca)}">
        ${comarcaInvalida ? '<span class="small" style="color:var(--warn)">Município não encontrado na lista da Bahia; a distância não poderá ser calculada automaticamente.</span>' : ''}</div>
      <div class="field s6"><label for="j-sei">Número SEI</label>
        <input id="j-sei" name="sei" class="mono" placeholder="00.0000.0000.000000000-0" value="${esc(v.sei)}"></div>
      <div class="field s6"><label for="j-sei2">SEI complementar</label>
        <input id="j-sei2" name="seiComplementar" class="mono" value="${esc(v.seiComplementar)}"></div>
      <div class="field s3"><label for="j-data">Data do júri</label>
        <input id="j-data" name="data" type="date" value="${esc(v.data)}"></div>
      <div class="field s3"><label for="j-vagas">Vagas (defensores)</label>
        <input id="j-vagas" name="vagas" type="number" min="0" max="10" value="${esc(v.vagas)}"></div>
      <div class="field s3"><label for="j-fund">Fundamento</label>
        <select id="j-fund" name="fundamento"><option value="">—</option>${opcoes(FUNDAMENTOS, v.fundamento)}</select></div>
      <div class="field s3"><label for="j-status">Situação</label>
        <select id="j-status" name="status">${opcoes(STATUS, v.status)}</select></div>
      <div class="field s12"><label for="j-obs">Observações</label>
        <textarea id="j-obs" name="observacoes" placeholder="Redesignações, réus, contatos…">${esc(v.observacoes)}</textarea></div>
      ${novo ? `<div class="field s12" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" type="submit">Registrar júri</button><a class="btn" href="#juris">Cancelar</a></div>` : ''}
    </form>${datalistMunicipios()}`;
  }

  function telaNovoJuri() {
    return `
    <div class="page-head"><div><a class="back" href="#juris">← Júris</a><h1>Registrar júri</h1></div></div>
    <section class="panel"><div class="panel-body">
      ${formJuri(null, true)}
      <p class="small muted">Depois de registrar, você poderá habilitar os defensores e o site calcula a distância de cada um até a comarca.</p>
    </div></section>`;
  }

  function telaJuri(id) {
    const j = juriById(id);
    if (!j) return `<div class="empty"><strong>Júri não encontrado</strong><a class="btn" href="#juris">Voltar para Júris</a></div>`;
    const r = classificar(j);
    const jaHab = new Set(j.habilitacoes.map((h) => h.defensorId));
    const disponiveis = state.defensores.filter((d) => d.ativo !== false && !jaHab.has(d.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const calculando = r.ativos.some((l) => emCalculo.has(chaveDist(l.def.origem, j.comarca)));
    const confirmarExclusao = ui.confirmar && ui.confirmar.tipo === 'juri' && ui.confirmar.id === j.id;

    const linha = (l) => {
      const k = chaveDist(l.def.origem, j.comarca);
      const kmManual = l.h.kmManual != null && l.h.kmManual !== '';
      return `<tr class="${l.h.desistiu ? 'is-out' : ''}">
        <td class="c">${l.h.desistiu ? '—' : `<span class="pos${l.dentro ? ' in' : ''}">${l.pos}</span>`}</td>
        <td style="min-width:200px"><a class="name" href="#defensor-${l.def.id}">${esc(l.def.nome)}</a>
          <div class="small muted" title="${esc(nomeTerminal(l.def.origem))}">sai da rodoviária de ${esc(cidade(l.def.origem))}${l.empate && !l.h.desistiu ? ' · <span style="color:var(--warn);font-weight:600">empate</span>' : ''}</div></td>
        <td class="c"><label class="check" title="Fez o art. 422 neste júri"><input type="checkbox" data-action="h-422" data-def="${l.def.id}"${l.h.art422 ? ' checked' : ''}${l.h.desistiu ? ' disabled' : ''}>${l.h.art422 ? '<span class="pill gold">prioridade</span>' : ''}</label></td>
        <td style="white-space:nowrap">
          ${emCalculo.has(k) && !kmManual ? '<span class="muted small">calculando…</span>' : `<span class="big-num">${fmtKm(l.km)}</span>`}
          ${l.minutos ? `<div class="small muted">≈ ${Math.floor(l.minutos / 60)}h${String(l.minutos % 60).padStart(2, '0')} de carro</div>` : ''}
          ${l.fonteKm ? `<div class="small muted">${esc(l.fonteKm)}</div>` : ''}
          <input class="km-input" type="number" min="0" step="1" id="km-${l.def.id}" data-action="h-km" data-def="${l.def.id}" placeholder="km" value="${kmManual ? esc(l.h.kmManual) : ''}" title="Informe a quilometragem do Google Maps para substituir o cálculo automático" aria-label="Quilometragem manual" style="margin-top:6px"></td>
        <td><a href="${esc(mapsUrl(l.def.origem, j.comarca))}" target="_blank" rel="noopener">Abrir rota</a></td>
        <td class="r big-num">${l.st.realizados}</td>
        <td class="r big-num">${l.st.futuros}</td>
        <td>${tempoTxt(l.def)}</td>
        <td class="num" style="white-space:nowrap">${fmtData(l.h.habilitadoEm)}</td>
        <td>${l.h.desistiu ? '<span class="pill bad">Desistiu</span>'
          : `<div style="display:grid;gap:4px">${r.vagas ? (l.dentro ? '<span class="pill accent">Resultado</span>' : '<span class="pill">Suplente</span>') : ''}
             <label class="check small"><input type="checkbox" data-action="h-designado" data-def="${l.def.id}"${l.h.designado ? ' checked' : ''}>Designado</label></div>`}</td>
        <td style="white-space:nowrap">
          <button class="btn sm link" data-action="h-desistir" data-def="${l.def.id}">${l.h.desistiu ? 'Reativar' : 'Desistiu'}</button>
          <button class="icon-btn" data-action="h-remover" data-def="${l.def.id}" title="Remover habilitação" aria-label="Remover habilitação de ${esc(l.def.nome)}">×</button>
        </td>
      </tr>`;
    };

    return `
    <div class="page-head">
      <div><a class="back" href="#juris">← Júris</a>
        <h1>${esc(j.comarca || 'Júri')}</h1>
        <div class="meta"><span class="mono">${esc(j.processo)}</span>${j.sei ? `<span>SEI <b class="mono">${esc(j.sei)}</b></span>` : ''}<span>${fmtData(j.data)}</span>${pillStatus(j)}</div>
      </div>
      <div class="actions">${confirmarExclusao ? '' : `<button class="btn danger" data-action="pedir-excluir-juri">Excluir júri</button>`}</div>
    </div>
    ${confirmarExclusao ? `<div class="confirm-bar"><span>Excluir este júri e todas as habilitações dele? Esta ação não pode ser desfeita.</span>
      <button class="btn danger" data-action="excluir-juri">Sim, excluir</button><button class="btn" data-action="cancelar-confirmacao">Cancelar</button></div>` : ''}

    <section class="panel">
      <div class="panel-head"><h2>Dados do júri</h2><span class="small muted">As alterações são salvas automaticamente.</span></div>
      <div class="panel-body">${formJuri(j, false)}</div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>Defensores habilitados <span class="muted">(${r.ativos.length})</span></h2>
        <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn sm" data-action="recalcular"${calculando ? ' disabled' : ''}>${calculando ? 'Calculando…' : 'Recalcular distâncias'}</button>
          ${r.vagas && r.ativos.length ? `<button class="btn sm primary" data-action="aplicar-resultado">Designar os ${Math.min(r.vagas, r.ativos.length)} primeiro(s)</button>` : ''}
        </div>
      </div>
      <div class="panel-body">
        ${formHabilitar(j, disponiveis)}
        ${r.empateNaVaga ? '<div class="notice warn">Há empate na última vaga. O critério de antiguidade só desempata quando a data de ingresso na DPE dos defensores empatados estiver preenchida.</div>' : ''}
        ${!nomeMunicipio(j.comarca) && j.habilitacoes.length ? '<div class="notice warn">A comarca não foi reconhecida como município da Bahia. Informe a quilometragem manualmente (campo “km” na coluna Distância) usando o link “Abrir rota”.</div>' : ''}
      </div>
      ${r.ativos.length || r.desistentes.length ? `<div class="table-wrap"><table>
        <thead><tr><th class="c">Ordem</th><th>Defensor(a)</th><th class="c">Art. 422</th><th>Distância <span class="muted" style="text-transform:none;letter-spacing:0">(ou km manual)</span></th><th>Google Maps</th>
          <th class="r">Realizados</th><th class="r">Futuros</th><th>Tempo de DPE</th><th>Habilitado em</th><th>Resultado</th><th></th></tr></thead>
        <tbody>${r.ativos.map(linha).join('')}${r.desistentes.map(linha).join('')}</tbody></table></div>`
      : `<div class="empty"><strong>Nenhum defensor habilitado</strong><span>Use o campo acima para habilitar quem se inscreveu neste júri.</span></div>`}
      <div class="panel-note">
        Ordem de classificação: <b>1.</b> quem fez o art. 422 neste júri tem prioridade · <b>2.</b> menor distância de rodoviária a rodoviária ·
        <b>3.</b> menos júris realizados · <b>4.</b> menos júris futuros designados · <b>5.</b> maior tempo de DPE (antiguidade).
        Com vagas informadas, os primeiros ocupam o resultado e os demais ficam como suplentes.
      </div>
    </section>`;
  }

  function formHabilitar(j, disponiveis) {
    if (!disponiveis.length) return '<p class="muted">Todos os defensores ativos já estão habilitados neste júri.</p>';
    const busca = norm(ui.habBusca);
    const visiveis = disponiveis.filter((d) => !busca || norm(d.nome).includes(busca) || norm(d.origem).includes(busca));
    const nSel = disponiveis.filter((d) => ui.habSel.has(d.id)).length;
    return `<form id="form-hab" class="hab-form" autocomplete="off">
      <div class="hab-top">
        <div class="field grow"><label for="hab-busca">Habilitar defensores <span class="muted">(marque um ou vários)</span></label>
          <input id="hab-busca" type="search" placeholder="Filtrar por nome ou cidade" value="${esc(ui.habBusca)}"></div>
        <div class="field"><label for="hab-data">Habilitado em</label><input id="hab-data" type="date" value="${esc(ui.habData || isoHoje())}"></div>
      </div>
      <div class="pick-list" role="group" aria-label="Defensores disponíveis">
        ${visiveis.length ? visiveis.map((d) => {
          const km = kmPrevia(d.origem, j.comarca);
          return `<label class="pick${ui.habSel.has(d.id) ? ' on' : ''}">
            <input type="checkbox" id="sel-${d.id}" data-action="sel-hab" data-def="${d.id}"${ui.habSel.has(d.id) ? ' checked' : ''}>
            <span class="pick-name">${esc(d.nome)}</span>
            <span class="pick-city">${esc(d.origem)}</span>
            <span class="pick-km num">${km != null ? '≈ ' + fmtKm(km) : ''}</span>
          </label>`; }).join('') : '<p class="muted small" style="padding:10px 12px">Nenhum defensor encontrado com esse filtro.</p>'}
      </div>
      <div class="hab-actions">
        <label class="check"><input id="hab-422" type="checkbox"${ui.hab422 ? ' checked' : ''}>Fez o art. 422 (vale para os marcados)</label>
        ${nSel ? '<button class="btn sm link" type="button" data-action="limpar-sel">Desmarcar todos</button>' : ''}
        <button class="btn primary" type="submit"${nSel ? '' : ' disabled'}>Habilitar ${nSel ? nSel + ' selecionado(s)' : ''}</button>
      </div>
    </form>`;
  }

  function telaDefensores() {
    const ativos = state.defensores.filter((d) => d.ativo !== false).length;
    return `
    <div class="page-head">
      <div><div class="eyebrow">${ativos} ativo(s) de ${state.defensores.length}</div><h1>Defensores</h1></div>
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Cadastrar defensor</h2></div>
      <div class="panel-body">
        <form id="form-novo-def" class="inline-form" autocomplete="off">
          <div class="field grow"><label for="nd-nome">Nome completo</label><input id="nd-nome" required></div>
          <div class="field"><label for="nd-origem">Cidade de origem</label><input id="nd-origem" list="dl-municipios" required></div>
          <div class="field"><label for="nd-ingresso">Ingresso na DPE</label><input id="nd-ingresso" type="date"></div>
          <button class="btn primary" type="submit">Cadastrar</button>
        </form>${datalistMunicipios()}
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Todos os defensores</h2>
        <input id="def-busca" class="search" type="search" placeholder="Buscar por nome ou cidade" value="${esc(ui.defBusca)}" aria-label="Buscar defensor"></div>
      ${tabelaDefensores({ completa: true })}
    </section>`;
  }

  function telaDefensor(id) {
    const d = defById(id);
    if (!d) return `<div class="empty"><strong>Defensor não encontrado</strong><a class="btn" href="#defensores">Voltar</a></div>`;
    const st = estatisticas(d.id);
    const t = tempoDPE(d.ingresso);
    const confirmarExclusao = ui.confirmar && ui.confirmar.tipo === 'defensor' && ui.confirmar.id === d.id;
    const habs = state.juris.map((j) => {
      const h = j.habilitacoes.find((x) => x.defensorId === d.id);
      if (!h) return null;
      const r = classificar(j);
      const l = r.ativos.find((x) => x.def.id === d.id);
      return { j, h, l, r };
    }).filter(Boolean).sort((a, b) => (b.j.data || '').localeCompare(a.j.data || ''));

    return `
    <div class="page-head">
      <div><a class="back" href="#painel">← Painel</a></div>
    </div>
    <section class="panel"><div class="panel-body">
      <div class="profile-head">
        <div class="avatar" aria-hidden="true">${esc(iniciais(d.nome).toUpperCase())}</div>
        <div style="display:grid;gap:4px;min-width:0">
          <h1>${esc(d.nome)}</h1>
          <div class="meta"><span>Origem <b>${esc(d.origem)}</b> · sai de ${esc(nomeTerminal(d.origem))}</span><span>Tempo de DPE <b>${t ? esc(t.texto) : 'aguardando data de ingresso'}</b></span>
            ${d.ativo === false ? '<span class="pill">Inativo</span>' : ''}</div>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi k-ok"><span class="label">Júris realizados</span><span class="value">${st.realizados}</span><span class="hint">${Number(d.historico) ? `inclui ${Number(d.historico)} do histórico` : 'designações com júri realizado'}</span></div>
        <div class="kpi k-info"><span class="label">Júris futuros</span><span class="value">${st.futuros}</span><span class="hint">designações em andamento</span></div>
        <div class="kpi"><span class="label">Habilitações</span><span class="value">${st.habilitacoes}</span><span class="hint">júris em que se inscreveu</span></div>
        <div class="kpi"><span class="label">Com art. 422</span><span class="value" style="color:var(--gold)">${st.art422}</span><span class="hint">prioridade na classificação</span></div>
      </div>
    </div></section>

    <section class="panel">
      <div class="panel-head"><h2>Habilitações</h2></div>
      ${habs.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Habilitado em</th><th>Processo</th><th>Comarca</th><th>Data do júri</th><th class="c">Art. 422</th><th>Distância</th><th class="c">Ordem</th><th>Resultado</th><th>Situação do júri</th></tr></thead>
        <tbody>${habs.map(({ j, h, l, r }) => `
          <tr class="clickable" data-href="#juri-${j.id}">
            <td class="num">${fmtData(h.habilitadoEm)}</td>
            <td><a class="name mono" href="#juri-${j.id}">${esc(j.processo)}</a></td>
            <td>${esc(j.comarca)}</td>
            <td class="num">${fmtData(j.data)}</td>
            <td class="c">${h.art422 ? '<span class="pill gold">Fez 422</span>' : '<span class="muted">—</span>'}</td>
            <td class="num">${fmtKm(kmDe(h, d, j).km)}</td>
            <td class="c">${l ? `<span class="pos${l.dentro ? ' in' : ''}">${l.pos}</span>` : '—'}</td>
            <td>${h.desistiu ? '<span class="pill bad">Desistiu</span>' : h.designado ? '<span class="pill accent">Designado</span>' : l && r.vagas && !l.dentro ? '<span class="pill">Suplente</span>' : '<span class="pill">Habilitado</span>'}</td>
            <td>${pillStatus(j)}</td>
          </tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><strong>Nenhuma habilitação ainda</strong><span>Quando este defensor for habilitado em um júri, ele aparece aqui.</span></div>`}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Dados do defensor</h2><span class="small muted">As alterações são salvas automaticamente.</span></div>
      <div class="panel-body">
        <form id="form-def" class="form" data-id="${d.id}" autocomplete="off">
          <div class="field s6"><label for="d-nome">Nome completo</label><input id="d-nome" name="nome" value="${esc(d.nome)}"></div>
          <div class="field s6"><label for="d-origem">Cidade de origem (saída da rota)</label><input id="d-origem" name="origem" list="dl-municipios" value="${esc(d.origem)}"></div>
          <div class="field"><label for="d-ingresso">Data de ingresso na DPE</label><input id="d-ingresso" name="ingresso" type="date" value="${esc(d.ingresso)}"></div>
          <div class="field"><label for="d-hist">Júris realizados antes do sistema</label><input id="d-hist" name="historico" type="number" min="0" value="${esc(d.historico || 0)}"></div>
          <div class="field"><span class="label-like">Situação</span><label class="check" style="min-height:40px"><input id="d-ativo" name="ativo" type="checkbox"${d.ativo !== false ? ' checked' : ''}>Ativo (aparece para habilitação)</label></div>
        </form>${datalistMunicipios()}
        ${confirmarExclusao ? `<div class="confirm-bar"><span>Excluir ${esc(d.nome)} e as ${st.habilitacoes} habilitação(ões) dele(a)?</span>
          <button class="btn danger" data-action="excluir-defensor">Sim, excluir</button><button class="btn" data-action="cancelar-confirmacao">Cancelar</button></div>`
        : `<div><button class="btn danger sm" data-action="pedir-excluir-defensor">Excluir defensor</button></div>`}
      </div>
    </section>`;
  }

  function telaConfig() {
    const nDist = Object.keys(state.distancias).length;
    const confirmarReset = ui.confirmar && ui.confirmar.tipo === 'reset';
    return `
    <div class="page-head"><div><h1>Configurações</h1></div></div>
    ${persistente ? '' : '<div class="notice warn">Este navegador não está permitindo salvar dados. Use o backup abaixo para não perder o que foi registrado.</div>'}

    <section class="panel">
      <div class="panel-head"><h2>Cálculo de distância</h2></div>
      <div class="panel-body">
        <p>Cada rota sai da rodoviária da cidade de origem do defensor e chega à rodoviária do município do júri. Sem chave do Google, o site calcula a rota de carro pelo OpenStreetMap; se ele não responder, usa uma estimativa (linha reta × 1,3). Cada linha tem o link “Abrir rota” no Google Maps, e o campo “km” de cada defensor substitui qualquer cálculo.</p>
        <form id="form-google" class="inline-form" autocomplete="off">
          <div class="field grow"><label for="cfg-google">Chave da API do Google Maps (opcional)</label>
            <input id="cfg-google" class="mono" placeholder="AIza…" value="${esc(state.config.googleKey)}"></div>
          <button class="btn primary" type="submit">Salvar chave</button>
        </form>
        <p class="small muted">Com a chave, a quilometragem vem do próprio Google Maps (Routes API). No Google Cloud, a chave precisa ter a “Routes API” ativada e permitir o endereço deste site. Trajetos que já estão na tabela pré-calculada do Google não gastam consultas.</p>
        <div class="inline-form"><span class="small muted">${nDist} trajeto(s) já calculado(s) e guardado(s).</span>
          <button class="btn sm" data-action="limpar-distancias"${nDist ? '' : ' disabled'}>Apagar distâncias calculadas</button></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Backup e exportação</h2></div>
      <div class="panel-body">
        <p>Os dados ficam guardados neste navegador. Baixe um backup com frequência e use-o para levar os dados para outro computador.</p>
        <div class="inline-form">
          <button class="btn primary" data-action="exportar-json">Baixar backup (.json)</button>
          <button class="btn" data-action="exportar-csv">Exportar júris para Excel (.csv)</button>
          <label class="btn" for="importar">Restaurar backup…</label>
          <input id="importar" type="file" accept=".json,application/json" hidden>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Critérios de classificação</h2></div>
      <div class="panel-body">
        <ol class="criteria">
          <li><b>Art. 422</b>: quem fez o art. 422 naquele júri fica à frente.</li>
          <li><b>Distância</b>: menor quilometragem da rodoviária da cidade de origem até a rodoviária da comarca.</li>
          <li><b>Júris realizados</b>: em distâncias iguais, quem tem menos júris realizados.</li>
          <li><b>Júris futuros</b>: persistindo o empate, quem tem menos designações futuras.</li>
          <li><b>Antiguidade</b>: maior tempo de DPE, quando a data de ingresso estiver preenchida.</li>
        </ol>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Recomeçar</h2></div>
      <div class="panel-body">
        ${confirmarReset ? `<div class="confirm-bar"><span>Apagar todos os júris e voltar à lista inicial de defensores? Baixe um backup antes.</span>
          <button class="btn danger" data-action="reset">Sim, apagar tudo</button><button class="btn" data-action="cancelar-confirmacao">Cancelar</button></div>`
        : `<div><button class="btn danger" data-action="pedir-reset">Apagar todos os dados</button></div>`}
      </div>
    </section>`;
  }

  // ------------------------------------------------------------------ render

  const app = $('#app');
  let ultimaTela = '';

  function render() {
    const r = rota();
    const ativo = document.activeElement;
    const foco = ativo && ativo.id && app.contains(ativo) ? { id: ativo.id, s: ativo.selectionStart, e: ativo.selectionEnd } : null;
    const chaveTela = r.tela + (r.id || '');

    let html;
    switch (r.tela) {
      case 'juris': html = telaJuris(); break;
      case 'novo-juri': html = telaNovoJuri(); break;
      case 'juri': html = telaJuri(r.id); break;
      case 'defensores': html = telaDefensores(); break;
      case 'defensor': html = telaDefensor(r.id); break;
      case 'config': html = telaConfig(); break;
      default: html = telaPainel();
    }
    app.innerHTML = html;

    const aba = { juri: 'juris', 'novo-juri': 'juris', defensor: 'defensores' }[r.tela] || r.tela;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === aba));

    if (chaveTela !== ultimaTela) {
      ultimaTela = chaveTela;
      window.scrollTo(0, 0);
      if (r.tela === 'juri') pedirDistancias(juriById(r.id));
    } else if (foco) {
      const el = document.getElementById(foco.id);
      if (el) { el.focus(); try { if (foco.s != null) el.setSelectionRange(foco.s, foco.e); } catch (e) { /* type=date/number */ } }
    }
  }

  function pedirDistancias(j, forcar) {
    if (!j) return;
    j.habilitacoes.forEach((h) => { const d = defById(h.defensorId); if (d) garantirDistancia(d.origem, j.comarca, forcar); });
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function baixar(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function csvJuris() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cab = ['Data', 'Comarca', 'Processo', 'SEI', 'SEI complementar', 'Fundamento', 'Vagas', 'Situação', 'Designados', 'Habilitados (ordem)', 'Art. 422', 'Observações'];
    const linhas = state.juris.slice().sort((a, b) => (a.data || '').localeCompare(b.data || '')).map((j) => {
      const r = classificar(j);
      return [fmtData(j.data), j.comarca, j.processo, j.sei, j.seiComplementar, j.fundamento, j.vagas, (STATUS_BY[j.status] || {}).label,
        r.ativos.filter((l) => l.h.designado).map((l) => l.def.nome).join('; '),
        r.ativos.map((l) => `${l.pos}. ${l.def.nome} (${fmtKm(l.km)})`).join('; '),
        r.ativos.filter((l) => l.h.art422).map((l) => l.def.nome).join('; '),
        j.observacoes].map(q).join(';');
    });
    return '﻿' + [cab.map(q).join(';'), ...linhas].join('\r\n');
  }

  // ------------------------------------------------------------------ eventos

  window.addEventListener('hashchange', () => {
    ui.confirmar = null; ui.habBusca = ''; ui.habSel = new Set(); ui.habData = ''; ui.hab422 = false;
    render();
  });

  app.addEventListener('click', (ev) => {
    const alvo = ev.target.closest('[data-action]');
    if (!alvo) {
      // linha clicável (sem atrapalhar links, botões e campos)
      if (ev.target.closest('a, button, input, select, label, textarea')) return;
      const tr = ev.target.closest('tr[data-href]');
      if (tr) location.hash = tr.dataset.href;
      return;
    }
    const acao = alvo.dataset.action;
    const r = rota();
    const j = r.tela === 'juri' ? juriById(r.id) : null;
    const hab = j && alvo.dataset.def ? j.habilitacoes.find((h) => h.defensorId === alvo.dataset.def) : null;

    switch (acao) {
      case 'ordenar-def': {
        const c = alvo.dataset.chave;
        ui.defOrdem = ui.defOrdem.chave === c ? { chave: c, dir: -ui.defOrdem.dir } : { chave: c, dir: c === 'nome' || c === 'origem' ? 1 : -1 };
        render(); break;
      }
      case 'filtro-juris': ui.jurisFiltro = alvo.dataset.v; render(); break;
      case 'recalcular': pedirDistancias(j, true); break;
      case 'aplicar-resultado': {
        const c = classificar(j);
        const designar = new Set(c.ativos.slice(0, c.vagas).map((l) => l.def.id));
        j.habilitacoes.forEach((h) => { h.designado = !h.desistiu && designar.has(h.defensorId); });
        salvar(); render();
        toast(c.empateNaVaga ? 'Designação aplicada. Atenção: há empate na última vaga.' : 'Designação aplicada conforme a classificação.');
        break;
      }
      case 'h-desistir':
        if (hab) { hab.desistiu = !hab.desistiu; if (hab.desistiu) hab.designado = false; salvar(); render(); }
        break;
      case 'h-remover':
        if (hab) { j.habilitacoes = j.habilitacoes.filter((h) => h !== hab); salvar(); render(); toast('Habilitação removida.'); }
        break;
      case 'pedir-excluir-juri': ui.confirmar = { tipo: 'juri', id: j.id }; render(); break;
      case 'excluir-juri':
        state.juris = state.juris.filter((x) => x.id !== j.id); ui.confirmar = null; salvar();
        location.hash = '#juris'; toast('Júri excluído.'); break;
      case 'pedir-excluir-defensor': ui.confirmar = { tipo: 'defensor', id: r.id }; render(); break;
      case 'excluir-defensor':
        state.defensores = state.defensores.filter((d) => d.id !== r.id);
        state.juris.forEach((x) => { x.habilitacoes = x.habilitacoes.filter((h) => h.defensorId !== r.id); });
        ui.confirmar = null; salvar(); location.hash = '#defensores'; toast('Defensor excluído.'); break;
      case 'cancelar-confirmacao': ui.confirmar = null; render(); break;
      case 'limpar-sel': ui.habSel = new Set(); render(); break;
      case 'limpar-distancias': state.distancias = {}; salvar(); render(); toast('Distâncias apagadas. Elas serão recalculadas ao abrir cada júri.'); break;
      case 'exportar-json': baixar(`dpejurix-backup-${isoHoje()}.json`, JSON.stringify(state, null, 2), 'application/json'); break;
      case 'exportar-csv': baixar(`juris-${isoHoje()}.csv`, csvJuris(), 'text/csv;charset=utf-8'); break;
      case 'pedir-reset': ui.confirmar = { tipo: 'reset' }; render(); break;
      case 'reset': state = estadoInicial(); ui.confirmar = null; salvar(); render(); toast('Dados apagados.'); break;
    }
  });

  app.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'def-busca') { ui.defBusca = el.value; render(); }
    else if (el.id === 'juris-busca') { ui.jurisBusca = el.value; render(); }
    else if (el.id === 'hab-busca') { ui.habBusca = el.value; render(); }
    else if (el.id === 'j-processo') {
      const pos = el.value.length - el.selectionStart;
      el.value = mascaraCNJ(el.value);
      try { el.setSelectionRange(el.value.length - pos, el.value.length - pos); } catch (e) { /* ignora */ }
    }
  });

  app.addEventListener('change', (ev) => {
    const el = ev.target;
    const r = rota();

    // seleção de defensores para habilitar
    if (el.dataset.action === 'sel-hab') {
      if (el.checked) ui.habSel.add(el.dataset.def); else ui.habSel.delete(el.dataset.def);
      render(); return;
    }
    if (el.id === 'hab-422') { ui.hab422 = el.checked; return; }
    if (el.id === 'hab-data') { ui.habData = el.value; return; }

    // checkboxes e km da tabela de habilitados
    if (el.dataset.action && r.tela === 'juri') {
      const j = juriById(r.id);
      const h = j && j.habilitacoes.find((x) => x.defensorId === el.dataset.def);
      if (!h) return;
      if (el.dataset.action === 'h-422') h.art422 = el.checked;
      if (el.dataset.action === 'h-designado') h.designado = el.checked;
      if (el.dataset.action === 'h-km') h.kmManual = el.value === '' ? null : Math.max(0, Number(el.value));
      salvar(); render(); return;
    }

    // edição do júri (salva automaticamente)
    const fj = el.closest('#form-juri');
    if (fj && fj.dataset.novo === '0' && el.name) {
      const j = juriById(r.id);
      if (!j) return;
      const antes = j.comarca;
      let v = el.value;
      if (el.name === 'comarca') v = nomeMunicipio(v) || v.trim();
      if (el.name === 'vagas') v = Math.max(0, parseInt(v, 10) || 0);
      if (el.name === 'processo' && !v.trim()) { toast('O número do processo não pode ficar vazio.'); render(); return; }
      j[el.name] = typeof v === 'string' ? v.trim() : v;
      salvar(); render(); toast('Salvo.');
      if (el.name === 'comarca' && antes !== j.comarca) pedirDistancias(j);
      return;
    }

    // edição do defensor (salva automaticamente)
    const fd = el.closest('#form-def');
    if (fd && el.name) {
      const d = defById(fd.dataset.id);
      if (!d) return;
      if (el.name === 'ativo') d.ativo = el.checked;
      else if (el.name === 'historico') d.historico = Math.max(0, parseInt(el.value, 10) || 0);
      else if (el.name === 'origem') d.origem = nomeMunicipio(el.value) || el.value.trim();
      else if (el.name === 'nome') { if (!el.value.trim()) { render(); return; } d.nome = el.value.trim(); }
      else d[el.name] = el.value;
      salvar(); render(); toast('Salvo.');
      return;
    }

    if (el.id === 'importar' && el.files && el.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const s = JSON.parse(fr.result);
          if (!s || !Array.isArray(s.defensores) || !Array.isArray(s.juris)) throw new Error('formato');
          s.distancias = s.distancias || {}; s.config = s.config || { googleKey: '' };
          state = s; salvar(); render();
          toast(`Backup restaurado: ${s.defensores.length} defensores e ${s.juris.length} júris.`);
        } catch (e) { toast('Arquivo inválido. Escolha um backup .json gerado por este site.'); }
      };
      fr.readAsText(el.files[0]);
    }
  });

  app.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;

    if (f.id === 'form-juri' && f.dataset.novo === '1') {
      const fd = new FormData(f);
      const processo = String(fd.get('processo') || '').trim();
      const comarcaTxt = String(fd.get('comarca') || '').trim();
      if (!processo || !comarcaTxt) { toast('Informe o número do processo e a comarca.'); return; }
      const dup = state.juris.find((x) => norm(x.processo) === norm(processo));
      if (dup && !(ui.confirmar && ui.confirmar.tipo === 'duplicado')) {
        ui.confirmar = { tipo: 'duplicado' };
        toast('Este processo já está registrado. Clique em “Registrar júri” de novo para criar outra sessão.');
        return;
      }
      const j = {
        id: uid(), processo, comarca: nomeMunicipio(comarcaTxt) || comarcaTxt,
        data: fd.get('data') || '', sei: String(fd.get('sei') || '').trim(), seiComplementar: String(fd.get('seiComplementar') || '').trim(),
        vagas: Math.max(0, parseInt(fd.get('vagas'), 10) || 0), fundamento: fd.get('fundamento') || '',
        status: fd.get('status') || 'agendado', observacoes: String(fd.get('observacoes') || '').trim(),
        criadoEm: isoHoje(), habilitacoes: [],
      };
      state.juris.push(j); ui.confirmar = null; salvar();
      location.hash = '#juri-' + j.id;
      toast('Júri registrado. Agora habilite os defensores.');
      return;
    }

    if (f.id === 'form-hab') {
      const j = juriById(rota().id);
      const ja = new Set(j.habilitacoes.map((h) => h.defensorId));
      const novos = [...ui.habSel].map(defById).filter((d) => d && !ja.has(d.id));
      if (!novos.length) { toast('Marque pelo menos um defensor na lista.'); return; }
      const data = $('#hab-data').value || isoHoje(), art422 = $('#hab-422').checked;
      novos.forEach((d) => j.habilitacoes.push({ defensorId: d.id, habilitadoEm: data, art422, kmManual: null, designado: false, desistiu: false }));
      ui.habSel = new Set(); ui.habBusca = ''; ui.hab422 = false;
      salvar(); render();
      novos.forEach((d) => garantirDistancia(d.origem, j.comarca));
      toast(novos.length === 1 ? `${primeiroNome(novos[0].nome)} habilitado(a).` : `${novos.length} defensores habilitados.`);
      return;
    }

    if (f.id === 'form-novo-def') {
      const nome = $('#nd-nome').value.trim(), origem = $('#nd-origem').value.trim();
      if (!nome || !origem) return;
      if (state.defensores.some((d) => norm(d.nome) === norm(nome))) { toast('Já existe um defensor com este nome.'); return; }
      state.defensores.push({ id: uid(), nome, origem: nomeMunicipio(origem) || origem, ingresso: $('#nd-ingresso').value || '', historico: 0, ativo: true });
      salvar(); f.reset(); render(); toast('Defensor cadastrado.');
      return;
    }

    if (f.id === 'form-google') {
      state.config.googleKey = $('#cfg-google').value.trim();
      salvar(); render();
      toast(state.config.googleKey ? 'Chave salva. Use “Recalcular distâncias” nos júris já registrados.' : 'Chave removida.');
    }
  });

  render();
})();
