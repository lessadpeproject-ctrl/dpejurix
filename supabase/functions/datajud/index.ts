// Consulta a API pública do DataJud (CNJ) pelo número do processo e devolve as últimas movimentações.
// Só responde a quem tem sessão válida do site (cabeçalho x-sessao).
const DATAJUD = "https://api-publica.datajud.cnj.jus.br/";
// Chave pública divulgada pelo CNJ em https://datajud-wiki.cnj.jus.br/api-publica/acesso
const DATAJUD_KEY = "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
const UF = ["", "ac", "al", "ap", "am", "ba", "ce", "dft", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "se", "sp", "to"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-sessao, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function indice(d: string): string | null {
  const j = d[13], tr = Number(d.slice(14, 16));
  if (j === "8" && UF[tr]) return "api_publica_tj" + UF[tr];
  if (j === "4" && tr >= 1 && tr <= 6) return "api_publica_trf" + tr;
  if (j === "5" && tr >= 1 && tr <= 24) return "api_publica_trt" + tr;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);

  // sessão do site
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const v = await fetch(`${url}/rest/v1/rpc/sessao_valida`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json", "x-sessao": req.headers.get("x-sessao") || "" },
    body: "{}",
  });
  if (!v.ok || (await v.json()) !== true) return resposta({ erro: "Sessão inválida. Entre de novo." }, 401);

  let numero = "";
  try { numero = String((await req.json()).numero || ""); } catch { /* corpo inválido */ }
  const d = numero.replace(/\D/g, "");
  if (d.length !== 20) return resposta({ erro: "Número de processo inválido (formato CNJ, 20 dígitos)." }, 400);
  const idx = indice(d);
  if (!idx) return resposta({ erro: "Tribunal deste número não é atendido." }, 400);

  const r = await fetch(DATAJUD + idx + "/_search", {
    method: "POST",
    headers: { Authorization: DATAJUD_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      size: 10,
      query: { match: { numeroProcesso: d } },
      _source: ["numeroProcesso", "classe", "orgaoJulgador", "dataAjuizamento", "dataHoraUltimaAtualizacao", "grau", "assuntos", "movimentos"],
    }),
  });
  if (!r.ok) return resposta({ erro: `DataJud respondeu ${r.status}.` }, 502);
  const hits = ((await r.json()).hits?.hits || []).map((h: any) => h._source);
  if (!hits.length) return resposta({ encontrado: false });

  hits.sort((a: any, b: any) => String(b.dataHoraUltimaAtualizacao || "").localeCompare(String(a.dataHoraUltimaAtualizacao || "")));
  const p = hits[0];
  const movs = hits.flatMap((h: any) => (h.movimentos || []).map((m: any) => ({
    data: m.dataHora || "",
    nome: m.nome || "",
    detalhe: (m.complementosTabelados || []).map((c: any) => c.nome || "").filter(Boolean).join("; "),
    grau: h.grau || "",
  })));
  movs.sort((a: any, b: any) => b.data.localeCompare(a.data));
  return resposta({
    encontrado: true,
    classe: p.classe?.nome || "",
    orgao: p.orgaoJulgador?.nome || "",
    ajuizamento: String(p.dataAjuizamento || "").replace(/^(\d{4})(\d{2})(\d{2})\d*$/, "$1-$2-$3"),
    ultimaAtualizacao: p.dataHoraUltimaAtualizacao || "",
    graus: [...new Set(hits.map((h: any) => h.grau).filter(Boolean))],
    assuntos: (p.assuntos || []).map((a: any) => a.nome).filter(Boolean).slice(0, 5),
    movimentos: movs.slice(0, 20),
  });
});
