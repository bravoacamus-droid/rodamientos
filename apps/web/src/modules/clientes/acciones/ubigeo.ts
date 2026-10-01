"use server";

import { perfilActual } from "@rodatech/db/servidor";

import { ubigeoDepartamentos, ubigeoDistritos, ubigeoProvincias } from "../api/consultas";

/**
 * Los tres niveles del ubigeo, para el selector en cascada desde un
 * componente de cliente.
 *
 * `pagina-formulario.tsx` los declaraba en línea para la ficha del cliente;
 * el alta rápida de proveedor (01/10) los necesita dentro de un diálogo que
 * vive en otras pantallas —compras, productos—, así que salen aquí. Mismo
 * argumento de riesgo: es la lista pública de distritos del Perú. Se pide
 * sesión para que no sea un endpoint abierto a cualquiera.
 */
export async function departamentosUbigeo(): Promise<string[]> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return [];
  return ubigeoDepartamentos();
}

export async function provinciasUbigeo(departamento: string): Promise<string[]> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo || typeof departamento !== "string") return [];
  return ubigeoProvincias(departamento.slice(0, 80));
}

export async function distritosUbigeo(
  departamento: string,
  provincia: string,
): Promise<{ codigo: string; distrito: string }[]> {
  const perfil = await perfilActual();
  if (!perfil || !perfil.activo) return [];
  if (typeof departamento !== "string" || typeof provincia !== "string") return [];
  return ubigeoDistritos(departamento.slice(0, 80), provincia.slice(0, 80));
}
