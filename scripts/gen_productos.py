#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Genera el SQL de siembra del maestro de productos y equivalencias (cross-reference)."""
import io, random, json

random.seed(20260728)

OUT = "supabase/migrations/005_seed_productos.sql"

# ---------------------------------------------------------------------------
# Dimensiones reales de rodamientos rígidos de bolas (d, D, B)
# ---------------------------------------------------------------------------
SERIE_6000 = {
    "6000": (10, 26, 8), "6001": (12, 28, 8), "6002": (15, 32, 9), "6003": (17, 35, 10),
    "6004": (20, 42, 12), "6005": (25, 47, 12), "6006": (30, 55, 13), "6007": (35, 62, 14),
    "6008": (40, 68, 15), "6009": (45, 75, 16), "6010": (50, 80, 16), "6011": (55, 90, 18),
    "6012": (60, 95, 18),
}
SERIE_6200 = {
    "6200": (10, 30, 9), "6201": (12, 32, 10), "6202": (15, 35, 11), "6203": (17, 40, 12),
    "6204": (20, 47, 14), "6205": (25, 52, 15), "6206": (30, 62, 16), "6207": (35, 72, 17),
    "6208": (40, 80, 18), "6209": (45, 85, 19), "6210": (50, 90, 20), "6211": (55, 100, 21),
    "6212": (60, 110, 22), "6213": (65, 120, 23), "6214": (70, 125, 24), "6215": (75, 130, 25),
}
SERIE_6300 = {
    "6300": (10, 35, 11), "6301": (12, 37, 12), "6302": (15, 42, 13), "6303": (17, 47, 14),
    "6304": (20, 52, 15), "6305": (25, 62, 17), "6306": (30, 72, 19), "6307": (35, 80, 21),
    "6308": (40, 90, 23), "6309": (45, 100, 25), "6310": (50, 110, 27), "6311": (55, 120, 29),
    "6312": (60, 130, 31), "6313": (65, 140, 33),
}
SERIE_6400 = {
    "6403": (17, 62, 17), "6404": (20, 72, 19), "6405": (25, 80, 21), "6406": (30, 90, 23),
    "6407": (35, 100, 25), "6408": (40, 110, 27), "6409": (45, 120, 29), "6410": (50, 130, 31),
}
CILINDRICOS = {
    "NU205": (25, 52, 15), "NU206": (30, 62, 16), "NU207": (35, 72, 17), "NU208": (40, 80, 18),
    "NU209": (45, 85, 19), "NU210": (50, 90, 20), "NU211": (55, 100, 21), "NU212": (60, 110, 22),
    "NU213": (65, 120, 23), "NU215": (75, 130, 25), "NU216": (80, 140, 26), "NU220": (100, 180, 34),
    "NJ206": (30, 62, 16), "NJ208": (40, 80, 18), "NJ210": (50, 90, 20), "NJ212": (60, 110, 22),
    "NJ215": (75, 130, 25), "N206": (30, 62, 16), "N210": (50, 90, 20), "N212": (60, 110, 22),
}
CONICOS = {
    "30204": (20, 47, 15.25), "30205": (25, 52, 16.25), "30206": (30, 62, 17.25),
    "30207": (35, 72, 18.25), "30208": (40, 80, 19.75), "30209": (45, 85, 20.75),
    "30210": (50, 90, 21.75), "30211": (55, 100, 22.75), "30212": (60, 110, 23.75),
    "30213": (65, 120, 24.75), "30215": (75, 130, 27.25), "30220": (100, 180, 37),
    "32206": (30, 62, 21.25), "32208": (40, 80, 24.75), "32210": (50, 90, 24.75),
    "32212": (60, 110, 29.75), "32214": (70, 125, 33.25), "32216": (80, 140, 35.25),
    "33108": (40, 75, 26), "33208": (40, 80, 32),
}
CONICOS_PULG = {
    "LM11749/10": (17.462, 39.878, 13.843), "LM12749/10": (21.986, 45.237, 15.494),
    "L44643/10": (25.4, 50.292, 14.732), "LM67048/10": (31.75, 59.131, 15.875),
    "25877/25821": (34.925, 73.025, 23.812), "HM88649/10": (34.925, 72.233, 25.4),
    "JLM714149/10": (75, 115, 25), "32011X": (55, 90, 23),
}
AUTOALINEANTES = {
    "1204": (20, 47, 14), "1205": (25, 52, 15), "1206": (30, 62, 16), "1207": (35, 72, 17),
    "1208": (40, 80, 18), "1210": (50, 90, 20), "1212": (60, 110, 22),
    "2205": (25, 52, 18), "2206": (30, 62, 20), "2207": (35, 72, 23), "2208": (40, 80, 23),
    "2210": (50, 90, 23), "2212": (60, 110, 28),
}
ROTULA = {
    "22205": (25, 52, 18), "22206": (30, 62, 20), "22207": (35, 72, 23), "22208": (40, 80, 23),
    "22209": (45, 85, 23), "22210": (50, 90, 23), "22211": (55, 100, 25), "22212": (60, 110, 28),
    "22213": (65, 120, 31), "22215": (75, 130, 31), "22216": (80, 140, 33), "22217": (85, 150, 36),
    "22218": (90, 160, 40), "22220": (100, 180, 46), "22222": (110, 200, 53),
    "21308": (40, 90, 23), "21310": (50, 110, 27), "23024": (120, 180, 46), "23026": (130, 200, 52),
    "22308": (40, 90, 33), "22310": (50, 110, 40), "22312": (60, 130, 46), "22315": (75, 160, 55),
}
AXIALES = {
    "51105": (25, 42, 11), "51106": (30, 47, 11), "51107": (35, 52, 12), "51108": (40, 60, 13),
    "51110": (50, 70, 14), "51112": (60, 85, 17), "51115": (75, 100, 19),
    "51205": (25, 47, 15), "51206": (30, 52, 16), "51208": (40, 68, 19), "51210": (50, 78, 22),
}
AGUJAS = {
    "HK0810": (8, 12, 10), "HK1010": (10, 14, 10), "HK1210": (12, 16, 10), "HK1512": (15, 21, 12),
    "HK2020": (20, 26, 20), "HK2520": (25, 32, 20), "HK3020": (30, 37, 20), "HK3512": (35, 42, 12),
    "NA4905": (25, 42, 17), "NA4906": (30, 47, 17), "NA4908": (40, 62, 22), "NA4910": (50, 72, 22),
    "NK20/16": (20, 28, 16), "NK25/20": (25, 33, 20),
}

SUFIJOS_BOLAS = [
    ("", "Abierto", 1.00),
    ("-2RS", "Doble sello de goma", 1.12),
    ("-ZZ", "Doble tapa metálica", 1.08),
    ("-2RS-C3", "Doble sello · juego C3", 1.18),
    ("-C3", "Abierto · juego C3", 1.05),
]

MARCAS_RODAMIENTO = ["SKF", "FAG", "NSK", "NTN", "KOYO", "ZWZ", "LYC", "NACHI"]
FACTOR_MARCA = {
    "SKF": 1.00, "FAG": 0.96, "INA": 0.98, "NSK": 0.92, "NTN": 0.90, "TIMKEN": 1.05,
    "KOYO": 0.74, "NACHI": 0.78, "THK": 1.15, "HIWIN": 0.80, "FYH": 0.70, "DODGE": 1.10,
    "ASAHI": 0.68, "FSQ": 0.42, "ZWZ": 0.40, "LYC": 0.36, "WBB": 0.34,
    "OPTIBELT": 1.00, "GATES": 0.98, "MEGADYNE": 0.82, "RINGFEDER": 1.05, "REXNORD": 1.05,
    "FALK": 1.02, "KTR": 1.00, "LOVEJOY": 0.85, "TSUBAKI": 1.00,
    "CR": 1.00, "PARKER": 1.05, "TTO": 0.72,
    "LOCTITE": 1.0, "WD-40": 1.0, "CRC": 1.0, "WURTH": 1.0, "STANLEY": 1.0, "GENERICO": 0.5,
}

productos = []   # dicts
grupos = {}      # codigo_base -> [sku,...] para equivalencias


def costo_rodamiento(d, D, B):
    """Costo referencial en soles a partir del volumen del rodamiento."""
    vol = (D * D - d * d) * B / 1000.0
    return round(6.5 + vol * 0.52, 2)


def add(sku, codigo, desc, marca, categoria, atributos, costo, unidad="UND",
        stock_min=None, peso=None, grupo=None):
    factor = FACTOR_MARCA.get(marca, 1.0)
    c = round(costo * factor, 2)
    margen = random.uniform(0.30, 0.52)
    may = round(c * (1 + margen), 2)
    productos.append({
        "sku": sku, "codigo": codigo, "desc": desc, "marca": marca, "categoria": categoria,
        "atributos": atributos, "costo": c, "unidad": unidad,
        "may": may,
        "fab": round(may * 0.90, 2),
        "imp": round(may * 0.80, 2),
        "stock_min": stock_min if stock_min is not None else random.choice([2, 3, 4, 5, 6, 8, 10, 12]),
        "peso": peso if peso is not None else round(max(costo / 45.0, 0.05), 3),
        "ubic": f"{random.choice('ABCDEF')}-{random.randint(1,12):02d}-{random.randint(1,6)}",
    })
    if grupo:
        grupos.setdefault(grupo, []).append(sku)


# --- Rodamientos rígidos de bolas -------------------------------------------
for serie, tabla in [("6000", SERIE_6000), ("6200", SERIE_6200), ("6300", SERIE_6300), ("6400", SERIE_6400)]:
    for base, (d, D, B) in tabla.items():
        sufijos = random.sample(SUFIJOS_BOLAS, k=random.choice([2, 2, 3]))
        if ("-2RS", "Doble sello de goma", 1.12) not in sufijos:
            sufijos.append(SUFIJOS_BOLAS[1])
        for suf, sufdesc, fs in sufijos:
            codigo = base + suf
            marcas = random.sample(MARCAS_RODAMIENTO, k=random.choice([3, 4, 4, 5]))
            if "SKF" not in marcas:
                marcas[0] = "SKF"
            for marca in marcas:
                add(
                    sku=f"{marca}-{codigo}",
                    codigo=codigo,
                    desc=f"Rodamiento rígido de bolas {codigo} · {d}x{D}x{B} mm · {sufdesc}",
                    marca=marca, categoria="rodamientos",
                    atributos={"tipo": "Rígido de bolas", "serie": serie, "d_mm": d, "D_mm": D,
                               "B_mm": B, "sello": suf.strip("-") or "Abierto", "jaula": "Acero"},
                    costo=costo_rodamiento(d, D, B) * fs,
                    grupo=codigo,
                )

# --- Rodillos cilíndricos ----------------------------------------------------
for base, (d, D, B) in CILINDRICOS.items():
    for marca in random.sample(["SKF", "FAG", "NSK", "NTN", "ZWZ"], k=random.choice([2, 3, 3])) + ["SKF"]:
        sku = f"{marca}-{base}"
        if any(p["sku"] == sku for p in productos):
            continue
        add(sku=sku, codigo=base,
            desc=f"Rodamiento de rodillos cilíndricos {base} · {d}x{D}x{B} mm",
            marca=marca, categoria="rodamientos",
            atributos={"tipo": "Rodillos cilíndricos", "d_mm": d, "D_mm": D, "B_mm": B,
                       "jaula": "Latón" if base.startswith("NU2") else "Acero"},
            costo=costo_rodamiento(d, D, B) * 1.55, grupo=base)

# --- Cónicos métricos --------------------------------------------------------
for base, (d, D, T) in CONICOS.items():
    for marca in random.sample(["SKF", "TIMKEN", "FAG", "KOYO", "NTN", "ZWZ"], k=random.choice([3, 3, 4])):
        add(sku=f"{marca}-{base}", codigo=base,
            desc=f"Rodamiento cónico {base} · {d}x{D}x{T} mm",
            marca=marca, categoria="rodamientos",
            atributos={"tipo": "Cónico de rodillos", "d_mm": d, "D_mm": D, "T_mm": T, "serie": base[:3]},
            costo=costo_rodamiento(d, D, T) * 1.30, grupo=base)

# --- Cónicos en pulgadas -----------------------------------------------------
for base, (d, D, T) in CONICOS_PULG.items():
    for marca in random.sample(["TIMKEN", "KOYO", "SKF", "ZWZ"], k=random.choice([2, 3])):
        add(sku=f"{marca}-{base.replace('/', '-')}", codigo=base,
            desc=f"Rodamiento cónico pulgada {base} · {d}x{D}x{T} mm",
            marca=marca, categoria="rodamientos",
            atributos={"tipo": "Cónico pulgada", "d_mm": d, "D_mm": D, "T_mm": T},
            costo=costo_rodamiento(d, D, T) * 1.35, grupo=base)

# --- Autoalineantes de bolas -------------------------------------------------
for base, (d, D, B) in AUTOALINEANTES.items():
    for marca in random.sample(["SKF", "FAG", "NSK", "ZWZ", "LYC"], k=random.choice([2, 3])):
        add(sku=f"{marca}-{base}", codigo=base,
            desc=f"Rodamiento autoalineante de bolas {base} · {d}x{D}x{B} mm",
            marca=marca, categoria="rodamientos",
            atributos={"tipo": "Autoalineante de bolas", "d_mm": d, "D_mm": D, "B_mm": B},
            costo=costo_rodamiento(d, D, B) * 1.20, grupo=base)

# --- Rodillos a rótula -------------------------------------------------------
for base, (d, D, B) in ROTULA.items():
    for suf in random.sample(["", " C3", " K", " CC/W33"], k=random.choice([1, 2])):
        codigo = (base + suf).strip()
        for marca in random.sample(["SKF", "FAG", "NSK", "NTN", "ZWZ"], k=random.choice([2, 3])):
            sku = f"{marca}-{codigo.replace(' ', '').replace('/', '-')}"
            if any(p["sku"] == sku for p in productos):
                continue
            add(sku=sku, codigo=codigo,
                desc=f"Rodamiento de rodillos a rótula {codigo} · {d}x{D}x{B} mm",
                marca=marca, categoria="rodamientos",
                atributos={"tipo": "Rodillos a rótula", "d_mm": d, "D_mm": D, "B_mm": B,
                           "sello": suf.strip() or "Estándar"},
                costo=costo_rodamiento(d, D, B) * 2.10, grupo=codigo)

# --- Axiales -----------------------------------------------------------------
for base, (d, D, H) in AXIALES.items():
    for marca in random.sample(["SKF", "FAG", "NSK", "ZWZ"], k=2):
        add(sku=f"{marca}-{base}", codigo=base,
            desc=f"Rodamiento axial de bolas {base} · {d}x{D}x{H} mm",
            marca=marca, categoria="rodamientos",
            atributos={"tipo": "Axial de bolas", "d_mm": d, "D_mm": D, "H_mm": H},
            costo=costo_rodamiento(d, D, H) * 1.15, grupo=base)

# --- Agujas ------------------------------------------------------------------
for base, (d, D, B) in AGUJAS.items():
    for marca in random.sample(["INA", "NTN", "KOYO", "ZWZ"], k=2):
        add(sku=f"{marca}-{base.replace('/', '-')}", codigo=base,
            desc=f"Rodamiento de agujas {base} · {d}x{D}x{B} mm",
            marca=marca, categoria="rodamientos",
            atributos={"tipo": "Agujas", "d_mm": d, "D_mm": D, "B_mm": B},
            costo=costo_rodamiento(d, D, B) * 1.10 + 8, grupo=base)

# --- Lineales ----------------------------------------------------------------
LINEALES = [
    ("LM8UU", "Rodamiento lineal LM8UU · eje 8 mm", 8, 22.0),
    ("LM10UU", "Rodamiento lineal LM10UU · eje 10 mm", 10, 26.0),
    ("LM12UU", "Rodamiento lineal LM12UU · eje 12 mm", 12, 30.0),
    ("LM16UU", "Rodamiento lineal LM16UU · eje 16 mm", 16, 38.0),
    ("LM20UU", "Rodamiento lineal LM20UU · eje 20 mm", 20, 48.0),
    ("SBR16UU", "Patín lineal abierto SBR16UU · eje 16 mm", 16, 62.0),
    ("SBR20UU", "Patín lineal abierto SBR20UU · eje 20 mm", 20, 78.0),
    ("HGH15CA", "Patín guía lineal HGH15CA", 15, 165.0),
    ("HGH20CA", "Patín guía lineal HGH20CA", 20, 215.0),
    ("HGH25CA", "Patín guía lineal HGH25CA", 25, 295.0),
    ("HGW20CC", "Patín guía lineal brida HGW20CC", 20, 245.0),
    ("SHS25LC", "Patín guía lineal SHS25LC alta rigidez", 25, 480.0),
    ("HSR20A", "Patín guía lineal HSR20A", 20, 380.0),
]
for code, desc, eje, costo in LINEALES:
    marcas = ["THK", "HIWIN"] if code.startswith(("HG", "SHS", "HSR")) else ["HIWIN", "GENERICO"]
    for marca in marcas:
        add(sku=f"{marca}-{code}", codigo=code, desc=desc, marca=marca, categoria="lineales",
            atributos={"tipo": "Lineal", "eje_mm": eje}, costo=costo, grupo=code)

# --- Chumaceras --------------------------------------------------------------
CHUM_EJES = {"204": 20, "205": 25, "206": 30, "207": 35, "208": 40, "209": 45, "210": 50,
             "211": 55, "212": 60, "213": 65, "215": 75}
CHUM_TIPOS = [("UCP", "Chumacera de pie (pillow block)", 1.00),
              ("UCF", "Chumacera de brida cuadrada", 1.05),
              ("UCFL", "Chumacera de brida ovalada", 1.02),
              ("UCT", "Chumacera tensora", 1.10),
              ("UCFC", "Chumacera de brida redonda", 1.06)]
for tipo, tdesc, ft in CHUM_TIPOS:
    for num, eje in CHUM_EJES.items():
        if tipo in ("UCT", "UCFC") and int(num) > 212:
            continue
        codigo = f"{tipo}{num}"
        for marca in random.sample(["FYH", "NTN", "ASAHI", "SKF", "FSQ", "DODGE"], k=random.choice([2, 3])):
            add(sku=f"{marca}-{codigo}", codigo=codigo,
                desc=f"{tdesc} {codigo} · eje {eje} mm",
                marca=marca, categoria="chumaceras",
                atributos={"tipo": tdesc, "eje_mm": eje, "serie": tipo},
                costo=(28 + eje * 1.9) * ft, grupo=codigo)

CHUM_ESPECIALES = [
    ("SNL517-615", "Chumacera partida SNL517-615 · eje 75 mm", 75, 980),
    ("SNL520-617", "Chumacera partida SNL520-617 · eje 90 mm", 90, 1250),
    ("SNL524", "Chumacera partida SNL524 · eje 110 mm", 110, 1680),
    ("SAF515", "Chumacera serie pesada SAF515 · eje 65 mm", 65, 1450),
    ("SAF517", "Chumacera serie pesada SAF517 · eje 75 mm", 75, 1780),
    ("SY50TF", "Unidad de rodamiento SY 50 TF · eje 50 mm", 50, 320),
    ("SY60TF", "Unidad de rodamiento SY 60 TF · eje 60 mm", 60, 420),
    ("UCP205-TP", "Chumacera termoplástica UCP205 · eje 25 mm", 25, 145),
    ("UCP208-TP", "Chumacera termoplástica UCP208 · eje 40 mm", 40, 215),
    ("SUCP205", "Chumacera inoxidable SUCP205 · eje 25 mm", 25, 265),
    ("SUCP208", "Chumacera inoxidable SUCP208 · eje 40 mm", 40, 385),
]
for code, desc, eje, costo in CHUM_ESPECIALES:
    for marca in random.sample(["SKF", "DODGE", "FYH", "ASAHI"], k=2):
        add(sku=f"{marca}-{code}", codigo=code, desc=desc, marca=marca, categoria="chumaceras",
            atributos={"tipo": "Chumacera especial", "eje_mm": eje}, costo=costo, grupo=code)

# --- Fajas -------------------------------------------------------------------
for largo in [30, 33, 36, 38, 40, 42, 45, 48, 50, 52, 55, 58, 60, 64, 68, 72, 76, 80, 85, 90, 95, 100]:
    for marca in random.sample(["OPTIBELT", "GATES", "MEGADYNE"], k=random.choice([1, 2])):
        add(sku=f"{marca}-A{largo}", codigo=f"A-{largo}",
            desc=f"Faja en V perfil A-{largo} · sección 13x8 mm",
            marca=marca, categoria="fajas-poleas",
            atributos={"perfil": "A", "seccion": "13x8 mm", "largo_pulg": largo},
            costo=9 + largo * 0.42, grupo=f"A-{largo}")
for largo in [40, 45, 48, 50, 54, 56, 60, 64, 68, 72, 75, 80, 85, 90, 96, 100, 110, 120]:
    for marca in random.sample(["OPTIBELT", "GATES"], k=random.choice([1, 2])):
        add(sku=f"{marca}-B{largo}", codigo=f"B-{largo}",
            desc=f"Faja en V perfil B-{largo} · sección 17x11 mm",
            marca=marca, categoria="fajas-poleas",
            atributos={"perfil": "B", "seccion": "17x11 mm", "largo_pulg": largo},
            costo=14 + largo * 0.55, grupo=f"B-{largo}")
for code, seccion, costo in [("SPZ1180", "SPZ", 32), ("SPZ1400", "SPZ", 38), ("SPA1250", "SPA", 45),
                             ("SPA1600", "SPA", 58), ("SPB1800", "SPB", 88), ("SPB2500", "SPB", 122),
                             ("SPC3000", "SPC", 195), ("XPA1400", "XPA", 62)]:
    for marca in ["OPTIBELT", "GATES"]:
        add(sku=f"{marca}-{code}", codigo=code,
            desc=f"Faja en V estrecha dentada {code} · perfil {seccion}",
            marca=marca, categoria="fajas-poleas",
            atributos={"perfil": seccion, "tipo": "V estrecha dentada"}, costo=costo, grupo=code)
for code, paso, costo in [("450-5M-15", "5M", 48), ("600-5M-15", "5M", 62), ("800-8M-20", "8M", 95),
                          ("1000-8M-30", "8M", 145), ("1200-8M-50", "8M", 235), ("1600-14M-40", "14M", 385)]:
    for marca in ["MEGADYNE", "OPTIBELT"]:
        add(sku=f"{marca}-{code}", codigo=code,
            desc=f"Faja sincrónica {code} · paso {paso}",
            marca=marca, categoria="fajas-poleas",
            atributos={"tipo": "Sincrónica", "paso": paso}, costo=costo, grupo=code)

# --- Poleas y bujes ----------------------------------------------------------
for canales in [1, 2, 3]:
    for diam in [3, 4, 5, 6, 8, 10, 12]:
        for perfil in ["A", "B"]:
            code = f"{canales}{perfil}-{diam}"
            add(sku=f"GENERICO-POL{code}", codigo=f"POLEA {code}",
                desc=f"Polea de hierro fundido {canales} canal(es) perfil {perfil} · Ø {diam}\"",
                marca="GENERICO", categoria="fajas-poleas",
                atributos={"canales": canales, "perfil": perfil, "diametro_pulg": diam},
                costo=28 + diam * canales * 7.5, grupo=f"POLEA {code}")
for code, costo in [("1008", 42), ("1210", 55), ("1610", 68), ("2012", 92), ("2517", 135), ("3020", 210)]:
    for marca in ["RINGFEDER", "GENERICO"]:
        add(sku=f"{marca}-BUJE{code}", codigo=f"BUJE {code}",
            desc=f"Buje cónico de fijación tipo {code}",
            marca=marca, categoria="fajas-poleas",
            atributos={"tipo": "Buje cónico", "serie": code}, costo=costo, grupo=f"BUJE {code}")

# --- Cadenas y piñones -------------------------------------------------------
CADENAS = [("40-1R", 12.7, 145), ("50-1R", 15.875, 195), ("60-1R", 19.05, 285),
           ("80-1R", 25.4, 425), ("100-1R", 31.75, 620), ("120-1R", 38.1, 880),
           ("40-2R", 12.7, 265), ("60-2R", 19.05, 520), ("80-2R", 25.4, 790),
           ("08B-1", 12.7, 138), ("10B-1", 15.875, 182), ("12B-1", 19.05, 268),
           ("16B-1", 25.4, 405), ("20B-1", 31.75, 595)]
for code, paso, costo in CADENAS:
    for marca in random.sample(["TSUBAKI", "REXNORD", "GENERICO"], k=2):
        add(sku=f"{marca}-CAD{code}", codigo=f"CADENA {code}",
            desc=f"Cadena de transmisión {code} · paso {paso} mm · rollo 5 m",
            marca=marca, categoria="cadenas-pinones",
            atributos={"tipo": "Cadena de rodillos", "norma": "ASA" if code[0].isdigit() else "BS",
                       "paso_mm": paso}, costo=costo, unidad="ROLLO", grupo=f"CADENA {code}")
for serie in ["40", "50", "60", "80"]:
    for dientes in [13, 15, 17, 19, 21, 25]:
        code = f"{serie}B{dientes}"
        add(sku=f"GENERICO-PIN{code}", codigo=f"PIÑON {code}",
            desc=f"Piñón para cadena ASA {serie} · {dientes} dientes · con cubo",
            marca="GENERICO", categoria="cadenas-pinones",
            atributos={"serie": serie, "dientes": dientes},
            costo=32 + dientes * int(serie) * 0.20, grupo=f"PIÑON {code}")
for code, costo in [("40-1 CANDADO", 6), ("50-1 CANDADO", 8), ("60-1 CANDADO", 12),
                    ("80-1 CANDADO", 18), ("60-1 MEDIO PASO", 15), ("80-1 MEDIO PASO", 22)]:
    add(sku=f"GENERICO-{code.replace(' ', '')}", codigo=code,
        desc=f"Aditamento de cadena · {code.lower()}", marca="GENERICO",
        categoria="cadenas-pinones", atributos={"tipo": "Aditamento"}, costo=costo, grupo=code)

# --- Acoplamientos -----------------------------------------------------------
ACOPLES = [("L-075", 68), ("L-090", 92), ("L-095", 118), ("L-099", 148), ("L-100", 178),
           ("L-110", 245), ("L-150", 420), ("L-190", 680)]
for code, costo in ACOPLES:
    for marca in ["LOVEJOY", "GENERICO"]:
        add(sku=f"{marca}-{code}", codigo=code,
            desc=f"Acoplamiento de mordaza {code} · cuerpo completo con elastómero",
            marca=marca, categoria="acoplamientos",
            atributos={"tipo": "Mordaza (jaw)", "serie": code}, costo=costo, grupo=code)
ROTEX = [("ROTEX 19", 145), ("ROTEX 24", 195), ("ROTEX 28", 265), ("ROTEX 38", 420),
         ("ROTEX 42", 545), ("ROTEX 48", 720)]
for code, costo in ROTEX:
    add(sku=f"KTR-{code.replace(' ', '')}", codigo=code,
        desc=f"Acoplamiento elástico {code} · KTR con estrella T-PUR",
        marca="KTR", categoria="acoplamientos",
        atributos={"tipo": "Elástico de garras"}, costo=costo, grupo=code)
for code, costo in [("1030T10", 385), ("1040T10", 495), ("1050T10", 640), ("1060T10", 820)]:
    add(sku=f"FALK-{code}", codigo=f"FALK {code}",
        desc=f"Acoplamiento de grilla Falk Steelflex {code}",
        marca="FALK", categoria="acoplamientos",
        atributos={"tipo": "Grilla Steelflex"}, costo=costo, grupo=f"FALK {code}")
for code, costo in [("ELAST L-090 NBR", 22), ("ELAST L-095 NBR", 28), ("ELAST L-100 NBR", 35),
                    ("ELAST L-110 NBR", 48), ("ESTRELLA ROTEX 24 92SH", 42),
                    ("ESTRELLA ROTEX 38 92SH", 78)]:
    add(sku=f"GENERICO-{code.replace(' ', '')[:22]}", codigo=code,
        desc=f"Elastómero de repuesto · {code.lower()}", marca="GENERICO",
        categoria="acoplamientos", atributos={"tipo": "Elastómero"}, costo=costo, grupo=code)

# --- Retenes y sellos --------------------------------------------------------
RETENES = [(20, 35, 7), (20, 40, 7), (25, 40, 7), (25, 47, 7), (25, 52, 7), (28, 47, 7),
           (30, 42, 7), (30, 47, 7), (30, 52, 7), (32, 52, 8), (35, 52, 7), (35, 55, 8),
           (35, 62, 10), (38, 62, 8), (40, 55, 8), (40, 62, 8), (40, 72, 10), (45, 62, 8),
           (45, 65, 10), (45, 72, 10), (50, 68, 8), (50, 72, 10), (50, 80, 10), (55, 80, 10),
           (55, 90, 10), (60, 80, 10), (60, 85, 10), (60, 90, 10), (65, 90, 10), (70, 95, 10),
           (75, 100, 10), (80, 110, 12), (85, 110, 12), (90, 120, 12), (100, 130, 12)]
for d, D, B in RETENES:
    for marca, material in random.sample(
            [("CR", "Nitrilo"), ("TTO", "Nitrilo"), ("WBB", "Nitrilo"), ("CR", "Vitón")], k=2):
        code = f"{d}x{D}x{B}"
        sku = f"{marca}-RET{code}{'V' if material == 'Vitón' else ''}"
        if any(p["sku"] == sku for p in productos):
            continue
        add(sku=sku, codigo=f"RETEN {code}",
            desc=f"Retén {code} mm · {material} · doble labio",
            marca=marca, categoria="retenes-sellos",
            atributos={"tipo": "Retén rotativo", "material": material, "d_mm": d, "D_mm": D, "B_mm": B},
            costo=4.5 + (D * B) / 42.0, grupo=f"RETEN {code}")
for medida in ["104", "108", "112", "116", "120", "203", "207", "210", "214", "218", "222", "226", "230"]:
    for marca in ["PARKER", "TTO"]:
        add(sku=f"{marca}-OR{medida}", codigo=f"O-RING {medida}",
            desc=f"O-Ring AS568-{medida} · NBR 70 Sh",
            marca=marca, categoria="retenes-sellos",
            atributos={"tipo": "O-Ring", "norma": "AS568", "material": "NBR 70"},
            costo=1.2 + int(medida) * 0.012, grupo=f"O-RING {medida}")
for norma in ["471", "472"]:
    for d in [20, 25, 30, 35, 40, 45, 50, 60, 70, 80]:
        code = f"DIN{norma}-{d}"
        add(sku=f"GENERICO-{code}", codigo=code,
            desc=f"Anillo Seeger DIN {norma} · Ø {d} mm ({'eje' if norma == '471' else 'agujero'})",
            marca="GENERICO", categoria="retenes-sellos",
            atributos={"tipo": "Anillo de retención", "norma": f"DIN {norma}", "d_mm": d},
            costo=0.8 + d * 0.055, unidad="UND", grupo=code)
for code, costo in [("TIPO 21 - 25MM", 68), ("TIPO 21 - 30MM", 82), ("TIPO 21 - 35MM", 98),
                    ("TIPO 21 - 45MM", 145), ("MG1 - 25MM", 118), ("MG1 - 35MM", 165),
                    ("MG1 - 45MM", 235)]:
    for marca in ["PARKER", "GENERICO"]:
        add(sku=f"{marca}-SM{code.replace(' ', '').replace('-', '')}", codigo=f"SELLO {code}",
            desc=f"Sello mecánico {code} · carburo/carbón/NBR",
            marca=marca, categoria="retenes-sellos",
            atributos={"tipo": "Sello mecánico"}, costo=costo, grupo=f"SELLO {code}")

# --- Lubricantes -------------------------------------------------------------
GRASAS = [("LGMT 2/0.4", "Grasa multiuso SKF LGMT 2 · pote 0.4 kg", 42, "SKF"),
          ("LGMT 2/1", "Grasa multiuso SKF LGMT 2 · pote 1 kg", 88, "SKF"),
          ("LGMT 2/5", "Grasa multiuso SKF LGMT 2 · balde 5 kg", 385, "SKF"),
          ("LGMT 3/0.4", "Grasa multiuso SKF LGMT 3 · pote 0.4 kg", 46, "SKF"),
          ("LGMT 3/1", "Grasa multiuso SKF LGMT 3 · pote 1 kg", 95, "SKF"),
          ("LGMT 3/5", "Grasa multiuso SKF LGMT 3 · balde 5 kg", 410, "SKF"),
          ("LGMT 3/18", "Grasa multiuso SKF LGMT 3 · balde 18 kg", 1380, "SKF"),
          ("LGEP 2/1", "Grasa extrema presión SKF LGEP 2 · pote 1 kg", 105, "SKF"),
          ("LGEP 2/18", "Grasa extrema presión SKF LGEP 2 · balde 18 kg", 1620, "SKF"),
          ("LGHP 2/1", "Grasa alta temperatura SKF LGHP 2 · pote 1 kg", 168, "SKF"),
          ("LGWA 2/1", "Grasa amplio rango SKF LGWA 2 · pote 1 kg", 128, "SKF"),
          ("ARCANOL MULTI2/1", "Grasa FAG Arcanol Multi 2 · pote 1 kg", 92, "FAG"),
          ("ARCANOL MULTI3/1", "Grasa FAG Arcanol Multi 3 · pote 1 kg", 98, "FAG"),
          ("LHMT 68/5", "Aceite de circulación SKF LHMT 68 · 5 L", 245, "SKF")]
for code, desc, costo, marca in GRASAS:
    add(sku=f"{marca}-{code.replace('/', '-').replace(' ', '')}", codigo=code, desc=desc,
        marca=marca, categoria="lubricantes",
        atributos={"tipo": "Lubricante"}, costo=costo, unidad="UND", stock_min=4, grupo=code)

# --- Mantenimiento industrial ------------------------------------------------
MANT = [("243", "Loctite 243 · fijador de roscas medio · 50 ml", 68, "LOCTITE"),
        ("270", "Loctite 270 · fijador de roscas alta resistencia · 50 ml", 78, "LOCTITE"),
        ("271", "Loctite 271 · fijador de roscas permanente · 50 ml", 82, "LOCTITE"),
        ("401", "Loctite 401 · adhesivo instantáneo · 20 g", 45, "LOCTITE"),
        ("574", "Loctite 574 · sellador de bridas · 50 ml", 118, "LOCTITE"),
        ("638", "Loctite 638 · retenedor de cilíndricos · 50 ml", 142, "LOCTITE"),
        ("648", "Loctite 648 · retenedor alta temperatura · 50 ml", 155, "LOCTITE"),
        ("5188", "Loctite 5188 · sellador flexible de bridas · 50 ml", 165, "LOCTITE"),
        ("WD40-311", "WD-40 multiuso · spray 311 g", 28, "WD-40"),
        ("WD40-382", "WD-40 multiuso · spray 382 g", 34, "WD-40"),
        ("WD40-FLEX", "WD-40 Flexible · spray 400 ml", 42, "WD-40"),
        ("WD40-GL", "WD-40 multiuso · galonera 3.78 L", 168, "WD-40"),
        ("CRC-BRAKLEEN", "CRC Brakleen · limpiador de frenos 539 g", 38, "CRC"),
        ("CRC-FOAMCLEAN", "CRC Foam Cleaner · limpiador espuma 539 g", 45, "CRC"),
        ("CRC-LECTRA", "CRC Lectra Clean · desengrasante eléctrico 539 g", 52, "CRC"),
        ("CRC-3-36", "CRC 3-36 · lubricante anticorrosivo 312 g", 42, "CRC"),
        ("WU-HHS2000", "Würth HHS 2000 · lubricante fluido 500 ml", 58, "WURTH"),
        ("WU-ROSTOFF", "Würth Rost Off Ice · desbloqueante 400 ml", 62, "WURTH"),
        ("WU-LIMPMULTI", "Würth limpiador industrial multiuso 500 ml", 48, "WURTH")]
for code, desc, costo, marca in MANT:
    add(sku=f"{marca}-{code}".replace(" ", ""), codigo=code, desc=desc, marca=marca,
        categoria="mantenimiento", atributos={"tipo": "Químico industrial"},
        costo=costo, stock_min=6, grupo=code)

# --- Ferretería --------------------------------------------------------------
for pulg in ["1/2", "3/4", "1", "1 1/4", "1 1/2", "2", "2 1/2", "3", "4"]:
    add(sku=f"GENERICO-ABZ{pulg.replace(' ', '').replace('/', '-')}", codigo=f"ABRAZADERA {pulg}",
        desc=f"Abrazadera sin fin acero inoxidable {pulg}\"",
        marca="GENERICO", categoria="ferreteria",
        atributos={"tipo": "Abrazadera", "medida": pulg}, costo=2.2 + len(pulg) * 1.3,
        stock_min=20, grupo=f"ABRAZADERA {pulg}")
for d in ["1/4", "5/16", "3/8", "1/2", "5/8", "3/4", "1"]:
    add(sku=f"GENERICO-BILLA{d.replace('/', '-')}", codigo=f"BILLA {d}",
        desc=f"Billa de acero cromado {d}\" · AISI 52100",
        marca="GENERICO", categoria="ferreteria",
        atributos={"tipo": "Billa de acero", "medida": d}, costo=0.9 + len(d) * 0.8,
        stock_min=50, grupo=f"BILLA {d}")
for code, desc, costo in [
        ("PERNO-M8X40", "Perno hexagonal M8 x 40 mm grado 8.8 zincado", 1.2),
        ("PERNO-M10X50", "Perno hexagonal M10 x 50 mm grado 8.8 zincado", 1.8),
        ("PERNO-M12X60", "Perno hexagonal M12 x 60 mm grado 8.8 zincado", 2.9),
        ("PERNO-M16X80", "Perno hexagonal M16 x 80 mm grado 8.8 zincado", 6.5),
        ("TUERCA-M10", "Tuerca hexagonal M10 grado 8 zincada", 0.5),
        ("TUERCA-M12", "Tuerca hexagonal M12 grado 8 zincada", 0.8),
        ("ARAND-M10", "Arandela plana M10 zincada", 0.2),
        ("PRIS-M8X10", "Prisionero M8 x 10 mm punta cónica", 0.9),
        ("SOLD-6011", "Soldadura E6011 1/8\" · kg", 12.5),
        ("SOLD-7018", "Soldadura E7018 1/8\" · kg", 14.8),
        ("SOLD-INOX308", "Soldadura inox E308L 3/32\" · kg", 68.0)]:
    add(sku=f"GENERICO-{code}", codigo=code, desc=desc, marca="GENERICO",
        categoria="ferreteria", atributos={"tipo": "Pernería / consumible"},
        costo=costo, unidad="KG" if code.startswith("SOLD") else "UND",
        stock_min=30, grupo=code)
for code, desc, costo in [
        ("STHT-DEST6", "Juego de destornilladores 6 piezas Stanley", 78),
        ("STHT-ALICATE8", "Alicate universal 8\" Stanley", 52),
        ("STHT-MARTILLO16", "Martillo de uña 16 oz mango fibra Stanley", 68),
        ("STHT-WINCHA5", "Wincha PowerLock 5 m Stanley", 42),
        ("STHT-WINCHA8", "Wincha PowerLock 8 m Stanley", 62),
        ("STHT-SERRUCHO", "Serrucho SharpTooth 20\" Stanley", 85),
        ("STHT-NIVEL24", "Nivel de aluminio 24\" Stanley", 95),
        ("STHT-HEXSET", "Juego de llaves hexagonales 9 piezas Stanley", 58),
        ("STHT-LLAVEMIX", "Juego de llaves mixtas 12 piezas Stanley", 245),
        ("STHT-EXTRACTOR", "Extractor de rodamientos 3 patas 6\"", 165),
        ("SKF-TMMP2X60", "Extractor mecánico SKF TMMP 2x60", 685)]:
    marca = "SKF" if code.startswith("SKF") else "STANLEY"
    add(sku=f"{marca}-{code.split('-', 1)[1]}", codigo=code.split("-", 1)[1], desc=desc,
        marca=marca, categoria="ferreteria", atributos={"tipo": "Herramienta"},
        costo=costo, stock_min=2, grupo=code)

# ---------------------------------------------------------------------------
# Emitir SQL
# ---------------------------------------------------------------------------
def esc(s):
    return s.replace("'", "''")


rows = []
seen = set()
for p in productos:
    if p["sku"] in seen:
        continue
    seen.add(p["sku"])
    rows.append(
        "('{sku}','{cod}','{desc}',(select id from marcas where nombre='{marca}'),"
        "(select id from categorias where slug='{cat}'),'{unidad}','{attr}'::jsonb,"
        "{costo},{costo},{may},{fab},{imp},{smin},{smax},'{ubic}',{peso})".format(
            sku=esc(p["sku"]), cod=esc(p["codigo"]), desc=esc(p["desc"]), marca=p["marca"],
            cat=p["categoria"], unidad=p["unidad"],
            attr=esc(json.dumps(p["atributos"], ensure_ascii=False)),
            costo=p["costo"], may=p["may"], fab=p["fab"], imp=p["imp"],
            smin=p["stock_min"], smax=p["stock_min"] * 5, ubic=p["ubic"], peso=p["peso"]))

with io.open(OUT, "w", encoding="utf-8") as f:
    f.write("-- ERP RODATECH · Semilla del maestro de productos (generado)\n")
    f.write("-- Productos: %d\n\n" % len(rows))
    CH = 200
    for i in range(0, len(rows), CH):
        f.write("insert into productos (sku, codigo_fabricante, descripcion, marca_id, categoria_id,"
                " unidad, atributos, costo_promedio, ultimo_costo, precio_mayorista, precio_fabrica,"
                " precio_importacion, stock_minimo, stock_maximo, ubicacion, peso_kg) values\n")
        f.write(",\n".join(rows[i:i + CH]))
        f.write("\non conflict (sku) do nothing;\n\n")

    # --- Equivalencias (cross-reference) -----------------------------------
    f.write("-- Cross-reference: equivalencias exactas entre marcas del mismo código\n")
    pares = []
    for base, skus in grupos.items():
        skus = sorted(set(skus))
        for i in range(len(skus)):
            for j in range(i + 1, len(skus)):
                pares.append((skus[i], skus[j], "exacta",
                              "Mismo código de fabricante · intercambiable dimensionalmente"))
    # Equivalencias "similares": mismo tipo/dimensiones con distinto sufijo de sellado
    dim_index = {}
    for p in productos:
        a = p["atributos"]
        if a.get("tipo") in ("Rígido de bolas",) and "d_mm" in a:
            key = (a["d_mm"], a["D_mm"], a["B_mm"])
            dim_index.setdefault(key, []).append((p["sku"], p["codigo"]))
    for key, lst in dim_index.items():
        bases = {}
        for sku, cod in lst:
            bases.setdefault(cod, []).append(sku)
        codes = sorted(bases.keys())
        for i in range(len(codes)):
            for j in range(i + 1, len(codes)):
                if codes[i].split("-")[0] != codes[j].split("-")[0]:
                    continue
                a, b = bases[codes[i]][0], bases[codes[j]][0]
                pares.append((a, b, "similar",
                              "Misma dimensión %sx%sx%s · variante de sellado" % key))

    vistos = set()
    limpio = []
    for a, b, t, n in pares:
        k = (a, b)
        if k in vistos or a == b:
            continue
        vistos.add(k)
        limpio.append((a, b, t, n))

    f.write("-- Pares: %d\n" % len(limpio))
    CH2 = 400
    for i in range(0, len(limpio), CH2):
        f.write("insert into producto_equivalencias (producto_id, equivalente_id, tipo, nota)\n"
                "select p1.id, p2.id, v.tipo::tipo_equivalencia, v.nota from (values\n")
        f.write(",\n".join(
            "('%s','%s','%s','%s')" % (esc(a), esc(b), t, esc(n))
            for a, b, t, n in limpio[i:i + CH2]))
        f.write("\n) as v(sku1, sku2, tipo, nota)\n"
                "join productos p1 on p1.sku = v.sku1\n"
                "join productos p2 on p2.sku = v.sku2\n"
                "on conflict do nothing;\n\n")

print("Productos: %d · Equivalencias: %d" % (len(rows), len(limpio)))
