#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Ejecuta un archivo .sql contra el proyecto Supabase vía Management API.

Uso:
    SUPABASE_PROJECT_REF=xxxx SUPABASE_MGMT_TOKEN=sbp_xxxx \
        python scripts/run-sql.py supabase/migrations/001_schema.sql
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
    ok, out = run(sql)
    print("OK" if ok else "ERROR")
    print(out[:4000])
    sys.exit(0 if ok else 1)
