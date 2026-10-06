#!/usr/bin/env python3
"""
Gera js/rodoviarias.js com a localização da rodoviária (terminal rodoviário) de cada
município da Bahia (e de Brasília/DF), usando o Google Places API (New) — Text Search.

Uso:
    GOOGLE_MAPS_KEY=AIza... python3 tools/localizar_rodoviarias.py [Município ...]

Sem argumentos, localiza os municípios que ainda não estão no arquivo.
Quando nenhuma rodoviária é encontrada perto da sede, o município fica fora do arquivo
e o site usa a sede do município. A chave não é gravada em nenhum arquivo.
"""
import json, math, os, re, sys, unicodedata, urllib.error, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQ = RAIZ / "js" / "rodoviarias.js"
URL = "https://places.googleapis.com/v1/places:searchText"
RAIO_KM = 25
CONSULTAS_ESPECIAIS = {"Brasília/DF": "Rodoviária Interestadual de Brasília, DF"}


def ler_js(caminho, var):
    txt = caminho.read_text(encoding="utf-8")
    return json.loads(txt.split(f"window.{var} =", 1)[1].strip().rstrip(";"))


def km(a, b):
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def sem_acento(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


def buscar(chave, consulta, centro):
    corpo = json.dumps({
        "textQuery": consulta, "languageCode": "pt-BR", "regionCode": "BR", "pageSize": 8,
        "locationBias": {"circle": {"center": {"latitude": centro[0], "longitude": centro[1]}, "radius": RAIO_KM * 1000.0}},
    }).encode()
    req = urllib.request.Request(URL, data=corpo, method="POST", headers={
        "Content-Type": "application/json", "X-Goog-Api-Key": chave,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.types"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r).get("places", [])


def escolher(lugares, centro):
    melhor, nota_melhor = None, -1
    for p in lugares:
        c = [p["location"]["latitude"], p["location"]["longitude"]]
        d = km(centro, c)
        if d > RAIO_KM:
            continue
        nome = sem_acento(p.get("displayName", {}).get("text", ""))
        tipos = set(p.get("types", []))
        nota = 0
        if "bus_station" in tipos: nota += 4
        if "transit_station" in tipos: nota += 1
        if re.search(r"rodovi", nome): nota += 4
        elif re.search(r"terminal", nome): nota += 2
        if nota < 4:
            continue
        nota -= d / 100  # desempata pela proximidade da sede
        if nota > nota_melhor:
            melhor, nota_melhor = (p, c), nota
    return melhor


def main():
    chave = os.environ.get("GOOGLE_MAPS_KEY") or sys.exit("Defina GOOGLE_MAPS_KEY.")
    mun = ler_js(RAIZ / "js" / "municipios.js", "MUNICIPIOS")
    tabela = ler_js(ARQ, "RODOVIARIAS") if ARQ.exists() else {}
    alvos = sys.argv[1:] or [m for m in mun if m not in tabela]
    sem = []

    def gravar():
        cab = ARQ.read_text(encoding="utf-8").split("window.RODOVIARIAS", 1)[0]
        ARQ.write_text(cab + "window.RODOVIARIAS = " + json.dumps(dict(sorted(tabela.items())), ensure_ascii=False, indent=0) + ";\n", encoding="utf-8")

    for i, m in enumerate(alvos, 1):
        cidade = m.replace("/DF", "")
        consulta = CONSULTAS_ESPECIAIS.get(m, f"rodoviária de {cidade}, Bahia")
        try:
            achou = escolher(buscar(chave, consulta, mun[m]), mun[m])
            if not achou:
                achou = escolher(buscar(chave, f"terminal rodoviário {cidade} BA", mun[m]), mun[m])
        except urllib.error.HTTPError as e:
            print(f"Parado em {m}: HTTP {e.code} {e.read()[:200]!r}")
            break
        if achou:
            p, c = achou
            tabela[m] = {"n": p["displayName"]["text"], "a": p.get("formattedAddress", ""), "c": [round(c[0], 6), round(c[1], 6)], "p": p["id"]}
        else:
            tabela.pop(m, None); sem.append(m)
        if i % 25 == 0:
            gravar(); print(f"{i}/{len(alvos)}…", flush=True)
    gravar()
    print(f"Rodoviárias localizadas: {len(tabela)}. Sem rodoviária encontrada ({len(sem)}): {', '.join(sem)}")


if __name__ == "__main__":
    main()
