#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Crea (o actualiza) los usuarios de demostración del ERP en Supabase Auth.

Es idempotente: puede ejecutarse varias veces sin duplicar usuarios.

Uso:
    NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=eyJ... \
        python scripts/seed-usuarios.py
"""
import json
import os
import sys
import urllib.error
import urllib.request

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SERVICE_KEY:
    raise SystemExit(
        "Faltan variables de entorno:\n"
        "  NEXT_PUBLIC_SUPABASE_URL   https://<ref>.supabase.co\n"
        "  SUPABASE_SERVICE_ROLE_KEY  service role key del proyecto"
    )

PASSWORD = os.environ.get("RODATECH_DEMO_PASSWORD", "Rodatech2026")

USUARIOS = [
    ("gerencia@rodatechperu.com",  "Willy Fernández", "gerencia",  "Gerente General",       "981 191 487"),
    ("admin@rodatechperu.com",     "Karla Espinoza",  "admin",     "Administradora",        "981 191 488"),
    ("ventas@rodatechperu.com",    "Diego Ramírez",   "ventas",    "Ejecutivo Comercial",   "981 191 489"),
    ("almacen@rodatechperu.com",   "Marco Salazar",   "almacen",   "Jefe de Almacén",       "981 191 490"),
    ("compras@rodatechperu.com",   "Lucía Ynga",      "compras",   "Jefa de Compras",       "981 191 491"),
    ("cobranzas@rodatechperu.com", "Paola Mendoza",   "cobranzas", "Analista de Cobranzas", "981 191 492"),
]


def api(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        data=json.dumps(body).encode() if body else None,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "curl/8.7.1",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    _, existentes = api("/auth/v1/admin/users?per_page=200")
    por_email = {u["email"]: u for u in (existentes.get("users") or [])}

    for email, nombre, rol, cargo, telefono in USUARIOS:
        meta = {"nombre": nombre, "rol": rol, "cargo": cargo, "telefono": telefono}

        if email in por_email:
            uid = por_email[email]["id"]
            st, res = api(
                f"/auth/v1/admin/users/{uid}",
                "PUT",
                {"password": PASSWORD, "user_metadata": meta, "email_confirm": True},
            )
            estado = "ACTUALIZADO" if st < 300 else f"ERROR {st} {json.dumps(res)}"
        else:
            st, res = api(
                "/auth/v1/admin/users",
                "POST",
                {"email": email, "password": PASSWORD, "email_confirm": True, "user_metadata": meta},
            )
            estado = "CREADO" if st < 300 else f"ERROR {st} {json.dumps(res)}"

        print(f"{estado:12s} {email} · {rol}")
