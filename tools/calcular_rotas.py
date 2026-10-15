#!/usr/bin/env python3
"""
Preenche js/distancias.js rota por rota (Google Routes API, computeRoutes), de rodoviária a
rodoviária, para todas as cidades de origem dos defensores x todos os municípios da Bahia.
Serve para chaves sem acesso à matriz de rotas (ex.: chave de demonstração do Google).

Ponto de cada município: place_id da rodoviária (js/rodoviarias.js) quando conhecido; senão o
endereço "Rodoviária de <cidade>, BA", que o Google resolve para o terminal ou para a cidade.
Grava o progresso a cada 100 rotas e para sozinho quando a cota acaba (rode de novo depois).

Uso: GOOGLE_MAPS_KEY=AIza... python3 tools/calcular_rotas.py [Origem ...]
"""
import json, os, re, sys, threading, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQ = RAIZ / "js" / "distancias.js"
URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def ler_js(nome, var):
    txt = (RAIZ / "js" / nome).read_text(encoding="utf-8")
    corpo = txt.split(f"window.{var} =", 1)[1].strip().rstrip(";")
    return re.findall(r'\["[^"]+",\s*"([^"]+)"\]', corpo) if var == "DEFENSORES_INICIAIS" else json.loads(corpo)


def ponto(mun, rod):
    r = rod.get(mun)
    if r and r.get("p"):
        return {"placeId": r["p"]}
    return {"address": "Rodoviária Interestadual de Brasília, DF" if mun == "Brasília/DF" else f"Rodoviária de {mun}, BA"}


class CotaEsgotada(Exception):
    pass


def rota(chave, a, b):
    corpo = json.dumps({"origin": a, "destination": b, "travelMode": "DRIVE", "languageCode": "pt-BR", "regionCode": "BR"}).encode()
    req = urllib.request.Request(URL, data=corpo, method="POST", headers={
        "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code in (429, 403):
            raise CotaEsgotada(e.read()[:300].decode("utf-8", "ignore"))
        return None
    rt = (j.get("routes") or [None])[0]
    return [round(rt["distanceMeters"] / 1000), round(int(rt["duration"].rstrip("s")) / 60)] if rt else None


def main():
    chave = os.environ.get("GOOGLE_MAPS_KEY") or sys.exit("Defina GOOGLE_MAPS_KEY.")
    mun = ler_js("municipios.js", "MUNICIPIOS")
    rod = ler_js("rodoviarias.js", "RODOVIARIAS")
    tabela = ler_js("distancias.js", "DISTANCIAS")
    origens = sys.argv[1:] or sorted(set(ler_js("defensores-iniciais.js", "DEFENSORES_INICIAIS")))
    destinos = [m for m in mun if m != "Brasília/DF"]
    pares = [(o, d) for d in destinos for o in origens if o != d and d not in tabela.get(o, {})]
    print(f"{len(pares)} rotas a calcular", flush=True)
    trava, feitos, parar = threading.Lock(), [0], threading.Event()

    def gravar():
        cab = ARQ.read_text(encoding="utf-8").split("window.DISTANCIAS", 1)[0]
        ARQ.write_text(cab + "window.DISTANCIAS = " + json.dumps(tabela, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + ";\n", encoding="utf-8")

    def trabalho(par):
        if parar.is_set():
            return
        o, d = par
        try:
            v = rota(chave, ponto(o, rod), ponto(d, rod))
        except CotaEsgotada as e:
            if not parar.is_set():
                print("Cota esgotada:", e, flush=True)
            parar.set(); return
        with trava:
            if v:
                tabela.setdefault(o, {})[d] = v
            feitos[0] += 1
            if feitos[0] % 100 == 0:
                gravar(); print(f"{feitos[0]} rotas…", flush=True)

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(trabalho, pares))
    gravar()
    print(f"Calculadas nesta execução: {feitos[0]}. Total na tabela: {sum(len(v) for v in tabela.values())}", flush=True)


if __name__ == "__main__":
    main()
