import { redirect } from "next/navigation";

export default function Inicio() {
  // El middleware ya decidió si hay sesión: si llegamos aquí, la hay.
  redirect("/dashboard");
}
