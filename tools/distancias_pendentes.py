#!/usr/bin/env python3
"""
Tarefa automática do link do Claude: calcula pelo Google as distâncias que faltam no banco
compartilhado (rotas de rodoviária a rodoviária dos defensores habilitados em cada júri).

Entrada: pasta com o banco exportado (ArtifactData list com out_dir), contendo as subpastas
defensores/, juris/, distancias/ e rodoviarias/ (as que existirem).
Saída: pasta com um JSON por documento a gravar e lote-1.json, lote-2.json... (até 50 gravações
cada), prontos para o ArtifactData "batch". Nada é gravado no banco por este script.

Uso: GOOGLE_MAPS_KEYS=chave1,chave2,... python3 tools/distancias_pendentes.py <pasta-exportada> <pasta-saida> [limite]
As chaves são usadas em ordem: quando uma esgota a cota ou é recusada, passa para a próxima
(separadamente para a busca de rodoviárias e para as rotas).
"""
import base64, datetime, json, math, os, re, sys, unicodedata, urllib.error, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent


def ler_js(nome, var):
    txt = (RAIZ / "js" / nome).read_text(encoding="utf-8")
    return json.loads(txt.split(f"window.{var} =", 1)[1].strip().rstrip(";"))


def norm(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower().strip()


def id_seguro(k):  # igual a idSeguro() em js/app.js
    if re.fullmatch(r"[A-Za-z0-9_~:@+-][A-Za-z0-9_.~:@+-]{0,120}", k):
        return k
    return "k" + base64.b64encode(k.encode("utf-8")).decode().replace("/", "_").rstrip("=")


def ler_colecao(pasta, nome):
    d = Path(pasta) / nome
    itens = {}
    for f in sorted(d.glob("*.json")) if d.exists() else []:
        b = json.loads(f.read_text(encoding="utf-8"))
        itens[b.get("_k") or f.stem] = b
    return itens


def km_linha(a, b):
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


class Cota(Exception):
    pass


class Chaves:
    """Rodízio de chaves: cada API (places, routes) avança para a próxima chave quando a atual é recusada."""

    def __init__(self, chaves):
        self.chaves, self.atual = chaves, {}

    def post(self, api, url, campos, corpo):
        while self.atual.get(api, 0) < len(self.chaves):
            chave = self.chaves[self.atual.get(api, 0)]
            req = urllib.request.Request(url, data=json.dumps(corpo).encode(), method="POST", headers={
                "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": campos})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code not in (403, 429):
                    return {}
                msg = e.read()[:120].decode("utf-8", "ignore").replace("\n", " ")
                print(f"  chave {chave[:10]}… recusada em {api} (HTTP {e.code}); tentando a próxima. {msg}")
                self.atual[api] = self.atual.get(api, 0) + 1
        raise Cota(f"todas as chaves esgotadas ou recusadas em {api}")


def buscar_rodoviaria(chaves, mun, centro):
    consulta = "Rodoviária Interestadual de Brasília, DF" if mun == "Brasília/DF" else f"rodoviária de {mun}, Bahia"
    j = chaves.post("places", "https://places.googleapis.com/v1/places:searchText",
             "places.id,places.displayName,places.formattedAddress,places.location,places.types",
             {"textQuery": consulta, "languageCode": "pt-BR", "regionCode": "BR", "pageSize": 8,
              "locationBias": {"circle": {"center": {"latitude": centro[0], "longitude": centro[1]}, "radius": 25000.0}}})
    melhor, nota_m = None, -1
    for p in j.get("places", []):
        c = [p["location"]["latitude"], p["location"]["longitude"]]
        d = km_linha(centro, c)
        if d > 25:
            continue
        nome, tipos = norm(p.get("displayName", {}).get("text")), p.get("types", [])
        nota = (4 if "bus_station" in tipos else 0) + (1 if "transit_station" in tipos else 0)
        nota += 4 if "rodovi" in nome else 2 if "terminal" in nome else 0
        if nota < 4:
            continue
        nota -= d / 100
        if nota > nota_m:
            melhor, nota_m = {"n": p["displayName"]["text"], "a": p.get("formattedAddress", ""), "c": [round(c[0], 6), round(c[1], 6)], "p": p["id"]}, nota
    return melhor or {"nenhuma": True}


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    lista = [c.strip() for c in (os.environ.get("GOOGLE_MAPS_KEYS") or os.environ.get("GOOGLE_MAPS_KEY") or "").split(",") if c.strip()]
    if not lista:
        sys.exit("Defina GOOGLE_MAPS_KEYS (chaves separadas por vírgula).")
    chave = Chaves(lista)
    entrada, saida = sys.argv[1], Path(sys.argv[2])
    limite = int(sys.argv[3]) if len(sys.argv) > 3 else 95
    saida.mkdir(parents=True, exist_ok=True)

    mun = ler_js("municipios.js", "MUNICIPIOS")
    idx = {norm(m): m for m in mun}
    rod_fixas = ler_js("rodoviarias.js", "RODOVIARIAS")
    tabela = ler_js("distancias.js", "DISTANCIAS")
    defs = ler_colecao(entrada, "defensores")
    juris = ler_colecao(entrada, "juris")
    dist_db = ler_colecao(entrada, "distancias")
    rod_db = ler_colecao(entrada, "rodoviarias")

    pares = []
    for j in juris.values():
        c = idx.get(norm(j.get("comarca")))
        for h in j.get("habilitacoes", []):
            d = defs.get(h.get("defensorId"))
            o = d and idx.get(norm(d.get("origem")))
            if not o or not c or o == c or h.get("desistiu"):
                continue
            k = f"{o}|{c}"
            if c in tabela.get(o, {}) or (k in dist_db and dist_db[k].get("fonte") == "Google Maps") or (o, c) in pares:
                continue
            pares.append((o, c))
    print(f"{len(pares)} rota(s) pendente(s)")

    gravacoes = []

    def gravar(colecao, k, corpo):
        doc = id_seguro(k)
        f = saida / f"{colecao}-{doc}.json"
        f.write_text(json.dumps({**corpo, "_k": k}, ensure_ascii=False), encoding="utf-8")
        gravacoes.append({"op": "set", "collection": colecao, "doc_id": doc, "file_path": str(f)})

    rods = {**rod_db, **rod_fixas}
    hoje = datetime.date.today().isoformat()
    feitas, places_esgotado = 0, False
    try:
        for o, c in pares:
            if feitas >= limite:
                break
            falta = False
            for m in (o, c):
                if m in rods:
                    continue
                if places_esgotado:
                    falta = True; continue
                try:
                    rods[m] = buscar_rodoviaria(chave, m, mun[m])
                    gravar("rodoviarias", m, rods[m])
                except Cota:
                    print("Cota de busca de rodoviárias esgotada hoje; rotas sem rodoviária conhecida ficam para depois.")
                    places_esgotado, falta = True, True
            if falta:
                continue  # a rota tem que sair e chegar na rodoviária: espera localizar
            ponto = lambda m: ({"placeId": rods[m]["p"]} if rods.get(m, {}).get("p")
                               else {"location": {"latLng": {"latitude": mun[m][0], "longitude": mun[m][1]}}})
            j = chave.post("routes", "https://routes.googleapis.com/directions/v2:computeRoutes", "routes.distanceMeters,routes.duration",
                     {"origin": ponto(o), "destination": ponto(c), "travelMode": "DRIVE", "languageCode": "pt-BR", "regionCode": "BR"})
            rt = (j.get("routes") or [None])[0]
            feitas += 1
            if rt:
                gravar("distancias", f"{o}|{c}", {"km": round(rt["distanceMeters"] / 1000, 1),
                                                  "min": round(int(rt["duration"].rstrip("s")) / 60), "fonte": "Google Maps", "em": hoje})
    except Cota as e:
        print("Cota diária do Google esgotada; o restante fica para a próxima execução.", e)

    lotes = [gravacoes[i:i + 50] for i in range(0, len(gravacoes), 50)]
    for n, lote in enumerate(lotes, 1):
        (saida / f"lote-{n}.json").write_text(json.dumps(lote, ensure_ascii=False), encoding="utf-8")
    print(f"{feitas} rota(s) consultada(s); {len(gravacoes)} documento(s) a gravar em {len(lotes)} lote(s): "
          + ", ".join(str(saida / f"lote-{n}.json") for n in range(1, len(lotes) + 1)))


if __name__ == "__main__":
    main()
