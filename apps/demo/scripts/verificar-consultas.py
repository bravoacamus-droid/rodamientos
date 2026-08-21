#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Ejecuta contra PostgREST cada consulta `.from(...).select(...)` del código.

El compilador de TypeScript no valida las relaciones embebidas: un `select`
con una relación mal referenciada compila igual y solo falla en tiempo de
ejecución, donde `.single()` devuelve null y la página responde 404. Este
script recorre el código, reconstruye cada consulta y la ejecuta con un usuario
real para detectar esos fallos antes de desplegar.

Uso:
    python scripts/verificar-consultas.py
"""
import glob
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cargar_entorno():
    ruta = os.path.join(RAIZ, ".env.local")
    if not os.path.exists(ruta):
        raise SystemExit("No se encontró .env.local")
    env = {}
    for linea in io.open(ruta, encoding="utf-8"):
        if "=" in linea and not linea.startswith("#"):
            k, v = linea.strip().split("=", 1)
            env[k] = v
    return env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]


URL, ANON = cargar_entorno()
USUARIO = os.environ.get("RODATECH_TEST_USER", "gerencia@rodatechperu.com")
CLAVE = os.environ.get("RODATECH_DEMO_PASSWORD", "Rodatech2026")


def autenticar():
    req = urllib.request.Request(
        f"{URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": USUARIO, "password": CLAVE}).encode(),
        headers={"apikey": ANON, "Content-Type": "application/json", "User-Agent": "curl/8.7.1"},
        method="POST",
    )
    return json.loads(urllib.request.urlopen(req, timeout=30).read())["access_token"]


# .from("tabla") ... .select("campos")  — admite saltos de línea entre ambos
PATRON = re.compile(
    r'\.from\(\s*"(?P<tabla>[a-z_]+)"\s*\)(?P<medio>(?:[^;]{0,400}?))\.select\(\s*(?P<sel>"(?:[^"\\]|\\.)*"(?:\s*\+\s*"(?:[^"\\]|\\.)*")*)',
    re.S,
)


def extraer():
    consultas = []
    for archivo in glob.glob(os.path.join(RAIZ, "src", "**", "*.ts*"), recursive=True):
        texto = io.open(archivo, encoding="utf-8").read()
        for m in PATRON.finditer(texto):
            crudo = m.group("sel")
            # Une literales concatenados y quita las comillas
            partes = re.findall(r'"((?:[^"\\]|\\.)*)"', crudo)
            select = "".join(partes).replace("\\n", " ").strip()
            if not select:
                continue
            linea = texto[: m.start()].count("\n") + 1
            consultas.append(
                {
                    "archivo": os.path.relpath(archivo, RAIZ).replace("\\", "/"),
                    "linea": linea,
                    "tabla": m.group("tabla"),
                    "select": select,
                }
            )
    return consultas


def probar(jwt, tabla, select):
    url = f"{URL}/rest/v1/{tabla}?select={urllib.parse.quote(select)}&limit=1"
    req = urllib.request.Request(
        url,
        headers={"apikey": ANON, "Authorization": f"Bearer {jwt}", "User-Agent": "curl/8.7.1"},
    )
    try:
        urllib.request.urlopen(req, timeout=45).read()
        return None
    except urllib.error.HTTPError as e:
        try:
            cuerpo = json.loads(e.read().decode())
            return f"{e.code} {cuerpo.get('message', '')} {cuerpo.get('details', '') or ''}".strip()
        except Exception:
            return f"{e.code}"


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    jwt = autenticar()
    consultas = extraer()

    vistas = set()
    unicas = []
    for c in consultas:
        clave = (c["tabla"], c["select"])
        if clave in vistas:
            continue
        vistas.add(clave)
        unicas.append(c)

    print(f"Verificando {len(unicas)} consultas únicas de {len(consultas)} apariciones\n")

    fallos = []
    for c in unicas:
        error = probar(jwt, c["tabla"], c["select"])
        if error:
            fallos.append((c, error))
            print(f"  FALLA  {c['archivo']}:{c['linea']}  ({c['tabla']})")
            print(f"         {error[:170]}")

    print()
    if fallos:
        print(f"{len(fallos)} consulta(s) fallan en tiempo de ejecución.")
        sys.exit(1)
    print(f"Las {len(unicas)} consultas se ejecutan correctamente.")
