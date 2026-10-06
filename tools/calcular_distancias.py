#!/usr/bin/env python3
"""
Gera js/distancias.js com a distância de carro (Google Routes API) da rodoviária de cada
cidade de origem dos defensores até a rodoviária de todos os municípios da Bahia.
Usa js/rodoviarias.js (gerado por tools/localizar_rodoviarias.py); município sem rodoviária
localizada usa a sede do município.

Uso:
    GOOGLE_MAPS_KEY=AIza... python3 tools/calcular_distancias.py [Origem ...]

Sem argumentos, calcula as origens de js/defensores-iniciais.js que ainda não estão na tabela.
Com argumentos, (re)calcula só as origens informadas. A chave não é gravada em nenhum arquivo.
A chave precisa ter a "Routes API" ativada no Google Cloud.
Custo: cada origem consome ~417 elementos de "Compute Route Matrix".
"""
import json, os, re, sys, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQ = RAIZ / "js" / "distancias.js"
URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
LOTE = 400  # limite da API: origens x destinos <= 625 por chamada


def ler_js(caminho, var):
    txt = (RAIZ / caminho).read_text(encoding="utf-8")
    corpo = txt.split(f"window.{var} =", 1)[1].strip().rstrip(";")
    if var == "DEFENSORES_INICIAIS":
        return re.findall(r'\["[^"]+",\s*"([^"]+)"\]', corpo)
    return json.loads(corpo)


def matriz(chave, origem, destinos):
    ponto = lambda c: {"waypoint": {"location": {"latLng": {"latitude": c[0], "longitude": c[1]}}}}
    corpo = json.dumps({"origins": [ponto(origem)], "destinations": [ponto(c) for c in destinos], "travelMode": "DRIVE"}).encode()
    req = urllib.request.Request(URL, data=corpo, method="POST", headers={
        "Content-Type": "application/json", "X-Goog-Api-Key": chave,
        "X-Goog-FieldMask": "destinationIndex,distanceMeters,duration,condition"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def main():
    chave = os.environ.get("GOOGLE_MAPS_KEY")
    if not chave:
        sys.exit("Defina GOOGLE_MAPS_KEY.")
    mun = ler_js("js/municipios.js", "MUNICIPIOS")
    rod = ler_js("js/rodoviarias.js", "RODOVIARIAS") if (RAIZ / "js" / "rodoviarias.js").exists() else {}
    for m, r in rod.items():
        mun[m] = r["c"]
    tabela = ler_js("js/distancias.js", "DISTANCIAS") if ARQ.exists() else {}
    origens = sys.argv[1:] or sorted(set(ler_js("js/defensores-iniciais.js", "DEFENSORES_INICIAIS")) - set(tabela))
    nomes = [n for n in mun if n != "Brasília/DF"]
    for origem in origens:
        if origem not in mun:
            print(f"! origem desconhecida: {origem}"); continue
        linha = {}
        for i in range(0, len(nomes), LOTE):
            parte = nomes[i:i + LOTE]
            for el in matriz(chave, mun[origem], [mun[n] for n in parte]):
                if el.get("condition") == "ROUTE_EXISTS":
                    linha[parte[el["destinationIndex"]]] = [round(el["distanceMeters"] / 1000), round(int(el["duration"].rstrip("s")) / 60)]
        tabela[origem] = dict(sorted(linha.items()))
        print(f"{origem}: {len(linha)} destinos")
    cab = ARQ.read_text(encoding="utf-8").split("window.DISTANCIAS", 1)[0]
    ARQ.write_text(cab + "window.DISTANCIAS = " + json.dumps(tabela, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    main()
