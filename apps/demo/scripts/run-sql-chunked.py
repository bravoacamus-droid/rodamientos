#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Ejecuta un .sql grande dividiéndolo en bloques (separados por punto y coma
seguido de línea en blanco), para no exceder el límite de la Management API.

Uso:
    SUPABASE_PROJECT_REF=xxxx SUPABASE_MGMT_TOKEN=sbp_xxxx \
        python scripts/run-sql-chunked.py supabase/migrations/005_seed_productos.sql
"""
import io
import json
import os
import sys
import urllib.error
import urllib.request

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF")
TOKEN = os.environ.get("SUPABASE_MGMT_TOKEN")

if not PROJECT_REF or not TOKEN:
    raise SystemExit(
        "Faltan variables de entorno:\n"
        "  SUPABASE_PROJECT_REF  ref del proyecto Supabase\n"
        "  SUPABASE_MGMT_TOKEN   personal access token (sbp_...)"
    )

URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"


def run(sql: str):
    req = urllib.request.Request(
        URL,
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "curl/8.7.1",
            "Accept": "*/*",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return True, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return False, e.read().decode("utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sql = io.open(sys.argv[1], encoding="utf-8").read()
    bloques = [b.strip() for b in sql.split(";\n\n") if b.strip()]
    print(f"{len(bloques)} bloques")

    for i, bloque in enumerate(bloques, 1):
        if not bloque.endswith(";"):
            bloque += ";"
        ok, out = run(bloque)
        if not ok:
            print(f"[{i}/{len(bloques)}] ERROR\n{out[:2500]}")
            sys.exit(1)
        print(f"[{i}/{len(bloques)}] ok")

    print("COMPLETO")
