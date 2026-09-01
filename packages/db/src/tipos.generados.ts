/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Se regenera con:  pnpm db:tipos
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      actividad: {
        Row: {
          accion: string
          creado_en: string
          descripcion: string | null
          entidad: string
          entidad_id: string | null
          id: number
          metadata: Json
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          accion: string
          creado_en?: string
          descripcion?: string | null
          entidad: string
          entidad_id?: string | null
          id?: never
          metadata?: Json
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          accion?: string
          creado_en?: string
          descripcion?: string | null
          entidad?: string
          entidad_id?: string | null
          id?: never
          metadata?: Json
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actividad_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agencias_transporte: {
        Row: {
          activo: boolean
          actualizado_en: string
          busqueda: string | null
          contacto: string | null
          creado_en: string
          direccion: string | null
          id: string
          nombre_corto: string | null
          notas: string | null
          numero_documento: string | null
          razon_social: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          busqueda?: string | null
          contacto?: string | null
          creado_en?: string
          direccion?: string | null
          id?: string
          nombre_corto?: string | null
          notas?: string | null
          numero_documento?: string | null
          razon_social: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          busqueda?: string | null
          contacto?: string | null
          creado_en?: string
          direccion?: string | null
          id?: string
          nombre_corto?: string | null
          notas?: string | null
          numero_documento?: string | null
          razon_social?: string
          telefono?: string | null
        }
        Relationships: []
      }
      ajuste_items: {
        Row: {
          ajuste_id: string
          cantidad_fisica: number
          cantidad_sistema: number
          costo_unitario: number
          diferencia: number | null
          id: string
          producto_id: string
        }
        Insert: {
          ajuste_id: string
          cantidad_fisica: number
          cantidad_sistema: number
          costo_unitario?: number
          diferencia?: number | null
          id?: string
          producto_id: string
        }
        Update: {
          ajuste_id?: string
          cantidad_fisica?: number
          cantidad_sistema?: number
          costo_unitario?: number
          diferencia?: number | null
          id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ajuste_items_ajuste_id_fkey"
            columns: ["ajuste_id"]
            isOneToOne: false
            referencedRelation: "ajustes_inventario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajuste_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajuste_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajuste_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
        ]
      }
      ajustes_inventario: {
        Row: {
          anulado: boolean
          creado_en: string
          fecha: string
          id: string
          motivo: string
          numero: string
          tipo: Database["public"]["Enums"]["tipo_ajuste"]
          usuario_id: string | null
        }
        Insert: {
          anulado?: boolean
          creado_en?: string
          fecha?: string
          id?: string
          motivo: string
          numero: string
          tipo?: Database["public"]["Enums"]["tipo_ajuste"]
          usuario_id?: string | null
        }
        Update: {
          anulado?: boolean
          creado_en?: string
          fecha?: string
          id?: string
          motivo?: string
          numero?: string
          tipo?: Database["public"]["Enums"]["tipo_ajuste"]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_inventario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          accion_url: string | null
          archivada: boolean
          entidad_id: string | null
          entidad_nombre: string | null
          entidad_tipo: string | null
          generada_en: string
          huella: string
          id: string
          leida: boolean
          mensaje: string
          notificado_en: string | null
          severidad: Database["public"]["Enums"]["severidad_alerta"]
          tipo: string
          titulo: string
          valor: number | null
        }
        Insert: {
          accion_url?: string | null
          archivada?: boolean
          entidad_id?: string | null
          entidad_nombre?: string | null
          entidad_tipo?: string | null
          generada_en?: string
          huella: string
          id?: string
          leida?: boolean
          mensaje: string
          notificado_en?: string | null
          severidad?: Database["public"]["Enums"]["severidad_alerta"]
          tipo: string
          titulo: string
          valor?: number | null
        }
        Update: {
          accion_url?: string | null
          archivada?: boolean
          entidad_id?: string | null
          entidad_nombre?: string | null
          entidad_tipo?: string | null
          generada_en?: string
          huella?: string
          id?: string
          leida?: boolean
          mensaje?: string
          notificado_en?: string | null
          severidad?: Database["public"]["Enums"]["severidad_alerta"]
          tipo?: string
          titulo?: string
          valor?: number | null
        }
        Relationships: []
      }
      cliente_contactos: {
        Row: {
          activo: boolean
          actualizado_en: string
          area: string | null
          busqueda: string | null
          cargo: string | null
          cliente_id: string
          creado_en: string
          email: string | null
          id: string
          nombre: string
          notas: string | null
          principal: boolean
          telefono: string | null
          whatsapp: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          area?: string | null
          busqueda?: string | null
          cargo?: string | null
          cliente_id: string
          creado_en?: string
          email?: string | null
          id?: string
          nombre: string
          notas?: string | null
          principal?: boolean
          telefono?: string | null
          whatsapp?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          area?: string | null
          busqueda?: string | null
          cargo?: string | null
          cliente_id?: string
          creado_en?: string
          email?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          principal?: boolean
          telefono?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_contactos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_contactos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_contactos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean
          actualizado_en: string
          bloqueado: boolean
          busq_documento: string | null
          busq_razon_social: string | null
          busqueda: string | null
          codigo: string
          condicion_pago: Database["public"]["Enums"]["condicion_pago"]
          creado_en: string
          dias_credito: number
          dias_gracia: number
          direccion: string | null
          email: string | null
          id: string
          linea_credito: number
          motivo_bloqueo: string | null
          nombre_comercial: string | null
          notas: string | null
          numero_documento: string | null
          razon_social: string
          referencia_direccion: string | null
          sector: string | null
          telefono: string | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo_codigo: string | null
          vendedor_id: string | null
          whatsapp: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          bloqueado?: boolean
          busq_documento?: string | null
          busq_razon_social?: string | null
          busqueda?: string | null
          codigo: string
          condicion_pago?: Database["public"]["Enums"]["condicion_pago"]
          creado_en?: string
          dias_credito?: number
          dias_gracia?: number
          direccion?: string | null
          email?: string | null
          id?: string
          linea_credito?: number
          motivo_bloqueo?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          numero_documento?: string | null
          razon_social: string
          referencia_direccion?: string | null
          sector?: string | null
          telefono?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo_codigo?: string | null
          vendedor_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          bloqueado?: boolean
          busq_documento?: string | null
          busq_razon_social?: string | null
          busqueda?: string | null
          codigo?: string
          condicion_pago?: Database["public"]["Enums"]["condicion_pago"]
          creado_en?: string
          dias_credito?: number
          dias_gracia?: number
          direccion?: string | null
          email?: string | null
          id?: string
          linea_credito?: number
          motivo_bloqueo?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          numero_documento?: string | null
          razon_social?: string
          referencia_direccion?: string | null
          sector?: string | null
          telefono?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo_codigo?: string | null
          vendedor_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_ubigeo_codigo_fkey"
            columns: ["ubigeo_codigo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_items: {
        Row: {
          cantidad: number
          cantidad_recibida: number
          compra_id: string
          costo_unitario: number
          id: string
          importe: number | null
          orden: number
          producto_id: string
          unidad_codigo: string
        }
        Insert: {
          cantidad: number
          cantidad_recibida?: number
          compra_id: string
          costo_unitario?: number
          id?: string
          importe?: number | null
          orden?: number
          producto_id: string
          unidad_codigo?: string
        }
        Update: {
          cantidad?: number
          cantidad_recibida?: number
          compra_id?: string
          costo_unitario?: number
          id?: string
          importe?: number | null
          orden?: number
          producto_id?: string
          unidad_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_unidad_codigo_fkey"
            columns: ["unidad_codigo"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["codigo"]
          },
        ]
      }
      compras: {
        Row: {
          actualizado_en: string
          comprador_id: string | null
          courier: string | null
          creado_en: string
          documento_proveedor: string | null
          estado: Database["public"]["Enums"]["estado_compra"]
          fecha: string
          fecha_estimada: string | null
          gastos_importacion: number
          guia_proveedor: string | null
          id: string
          igv: number
          moneda: string
          motivo_anulacion: string | null
          numero: string
          observaciones: string | null
          proveedor_id: string
          subtotal: number
          tipo: Database["public"]["Enums"]["tipo_compra"]
          tipo_cambio: number | null
          total: number
          tracking: string | null
        }
        Insert: {
          actualizado_en?: string
          comprador_id?: string | null
          courier?: string | null
          creado_en?: string
          documento_proveedor?: string | null
          estado?: Database["public"]["Enums"]["estado_compra"]
          fecha?: string
          fecha_estimada?: string | null
          gastos_importacion?: number
          guia_proveedor?: string | null
          id?: string
          igv?: number
          moneda?: string
          motivo_anulacion?: string | null
          numero: string
          observaciones?: string | null
          proveedor_id: string
          subtotal?: number
          tipo?: Database["public"]["Enums"]["tipo_compra"]
          tipo_cambio?: number | null
          total?: number
          tracking?: string | null
        }
        Update: {
          actualizado_en?: string
          comprador_id?: string | null
          courier?: string | null
          creado_en?: string
          documento_proveedor?: string | null
          estado?: Database["public"]["Enums"]["estado_compra"]
          fecha?: string
          fecha_estimada?: string | null
          gastos_importacion?: number
          guia_proveedor?: string | null
          id?: string
          igv?: number
          moneda?: string
          motivo_anulacion?: string | null
          numero?: string
          observaciones?: string | null
          proveedor_id?: string
          subtotal?: number
          tipo?: Database["public"]["Enums"]["tipo_compra"]
          tipo_cambio?: number | null
          total?: number
          tracking?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_comprador_id_fkey"
            columns: ["comprador_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobante_cuotas: {
        Row: {
          comprobante_id: string
          fecha_vencimiento: string
          id: string
          monto: number
          numero: number
          pagado: number
          saldo: number | null
        }
        Insert: {
          comprobante_id: string
          fecha_vencimiento: string
          id?: string
          monto: number
          numero: number
          pagado?: number
          saldo?: number | null
        }
        Update: {
          comprobante_id?: string
          fecha_vencimiento?: string
          id?: string
          monto?: number
          numero?: number
          pagado?: number
          saldo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_cuotas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_cuotas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_cuotas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["comprobante_id"]
          },
        ]
      }
      comprobante_items: {
        Row: {
          cantidad: number
          codigo: string
          comprobante_id: string
          costo_unitario: number
          descripcion: string
          descuento_pct: number
          id: string
          igv_item: number
          importe: number | null
          marca: string | null
          orden: number
          producto_id: string | null
          tipo_afectacion: string
          unidad_codigo: string
          valor_unitario: number
        }
        Insert: {
          cantidad?: number
          codigo: string
          comprobante_id: string
          costo_unitario?: number
          descripcion: string
          descuento_pct?: number
          id?: string
          igv_item?: number
          importe?: number | null
          marca?: string | null
          orden?: number
          producto_id?: string | null
          tipo_afectacion?: string
          unidad_codigo?: string
          valor_unitario?: number
        }
        Update: {
          cantidad?: number
          codigo?: string
          comprobante_id?: string
          costo_unitario?: number
          descripcion?: string
          descuento_pct?: number
          id?: string
          igv_item?: number
          importe?: number | null
          marca?: string | null
          orden?: number
          producto_id?: string | null
          tipo_afectacion?: string
          unidad_codigo?: string
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_items_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_unidad_codigo_fkey"
            columns: ["unidad_codigo"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["codigo"]
          },
        ]
      }
      comprobantes: {
        Row: {
          actualizado_en: string
          anulado_en: string | null
          anulado_por: string | null
          cliente_id: string
          condicion_pago: Database["public"]["Enums"]["condicion_pago"]
          correlativo: number
          costo_total: number
          cotizacion_id: string | null
          creado_en: string
          descuento_global: number
          detraccion_aplica: boolean
          detraccion_codigo: string | null
          detraccion_cuenta: string | null
          detraccion_monto: number
          detraccion_porcentaje: number
          dias_credito: number
          estado: Database["public"]["Enums"]["estado_comprobante"]
          estado_sunat: Database["public"]["Enums"]["estado_sunat"]
          fecha_emision: string
          fecha_vencimiento: string | null
          guia_id: string | null
          id: string
          igv: number
          mostrar_cuenta: boolean
          motivo_anulacion: string | null
          motivo_nota_codigo: string | null
          numero: string | null
          observaciones: string | null
          op_exonerada: number
          op_gravada: number
          op_inafecta: number
          orden_compra_cliente: string | null
          pagado: number
          referencia_id: string | null
          retencion_aplica: boolean
          retencion_monto: number
          retencion_porcentaje: number
          saldo: number | null
          serie: string
          sunat_cdr_url: string | null
          sunat_codigo_respuesta: string | null
          sunat_enviado_en: string | null
          sunat_hash_cdr: string | null
          sunat_mensaje: string | null
          sunat_respuesta: Json | null
          sunat_ticket: string | null
          sunat_xml_firmado: string | null
          tipo: Database["public"]["Enums"]["tipo_documento"]
          total: number
          total_letras: string | null
          vendedor_id: string | null
        }
        Insert: {
          actualizado_en?: string
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id: string
          condicion_pago?: Database["public"]["Enums"]["condicion_pago"]
          correlativo: number
          costo_total?: number
          cotizacion_id?: string | null
          creado_en?: string
          descuento_global?: number
          detraccion_aplica?: boolean
          detraccion_codigo?: string | null
          detraccion_cuenta?: string | null
          detraccion_monto?: number
          detraccion_porcentaje?: number
          dias_credito?: number
          estado?: Database["public"]["Enums"]["estado_comprobante"]
          estado_sunat?: Database["public"]["Enums"]["estado_sunat"]
          fecha_emision?: string
          fecha_vencimiento?: string | null
          guia_id?: string | null
          id?: string
          igv?: number
          mostrar_cuenta?: boolean
          motivo_anulacion?: string | null
          motivo_nota_codigo?: string | null
          numero?: string | null
          observaciones?: string | null
          op_exonerada?: number
          op_gravada?: number
          op_inafecta?: number
          orden_compra_cliente?: string | null
          pagado?: number
          referencia_id?: string | null
          retencion_aplica?: boolean
          retencion_monto?: number
          retencion_porcentaje?: number
          saldo?: number | null
          serie: string
          sunat_cdr_url?: string | null
          sunat_codigo_respuesta?: string | null
          sunat_enviado_en?: string | null
          sunat_hash_cdr?: string | null
          sunat_mensaje?: string | null
          sunat_respuesta?: Json | null
          sunat_ticket?: string | null
          sunat_xml_firmado?: string | null
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          total?: number
          total_letras?: string | null
          vendedor_id?: string | null
        }
        Update: {
          actualizado_en?: string
          anulado_en?: string | null
          anulado_por?: string | null
          cliente_id?: string
          condicion_pago?: Database["public"]["Enums"]["condicion_pago"]
          correlativo?: number
          costo_total?: number
          cotizacion_id?: string | null
          creado_en?: string
          descuento_global?: number
          detraccion_aplica?: boolean
          detraccion_codigo?: string | null
          detraccion_cuenta?: string | null
          detraccion_monto?: number
          detraccion_porcentaje?: number
          dias_credito?: number
          estado?: Database["public"]["Enums"]["estado_comprobante"]
          estado_sunat?: Database["public"]["Enums"]["estado_sunat"]
          fecha_emision?: string
          fecha_vencimiento?: string | null
          guia_id?: string | null
          id?: string
          igv?: number
          mostrar_cuenta?: boolean
          motivo_anulacion?: string | null
          motivo_nota_codigo?: string | null
          numero?: string | null
          observaciones?: string | null
          op_exonerada?: number
          op_gravada?: number
          op_inafecta?: number
          orden_compra_cliente?: string | null
          pagado?: number
          referencia_id?: string | null
          retencion_aplica?: boolean
          retencion_monto?: number
          retencion_porcentaje?: number
          saldo?: number | null
          serie?: string
          sunat_cdr_url?: string | null
          sunat_codigo_respuesta?: string | null
          sunat_enviado_en?: string | null
          sunat_hash_cdr?: string | null
          sunat_mensaje?: string | null
          sunat_respuesta?: Json | null
          sunat_ticket?: string | null
          sunat_xml_firmado?: string | null
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          total?: number
          total_letras?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comp_motivo_nota_fk"
            columns: ["tipo", "motivo_nota_codigo"]
            isOneToOne: false
            referencedRelation: "motivos_nota"
            referencedColumns: ["tipo", "codigo"]
          },
          {
            foreignKeyName: "comprobantes_anulado_por_fkey"
            columns: ["anulado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "comprobantes_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cotizacion_id"]
          },
          {
            foreignKeyName: "comprobantes_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "guias_remision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["guia_id"]
          },
          {
            foreignKeyName: "comprobantes_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "v_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_referencia_id_fkey"
            columns: ["referencia_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "comprobantes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_sunat: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          ambiente: string
          certificado_caduca_en: string | null
          certificado_nombre: string | null
          certificado_sujeto: string | null
          id: number
          probado_en: string | null
          probado_mensaje: string | null
          probado_ok: boolean | null
          serie_boleta: string
          serie_factura: string
          usuario_sol: string | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          ambiente?: string
          certificado_caduca_en?: string | null
          certificado_nombre?: string | null
          certificado_sujeto?: string | null
          id?: number
          probado_en?: string | null
          probado_mensaje?: string | null
          probado_ok?: boolean | null
          serie_boleta?: string
          serie_factura?: string
          usuario_sol?: string | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          ambiente?: string
          certificado_caduca_en?: string | null
          certificado_nombre?: string | null
          certificado_sujeto?: string | null
          id?: number
          probado_en?: string | null
          probado_mensaje?: string | null
          probado_ok?: boolean | null
          serie_boleta?: string
          serie_factura?: string
          usuario_sol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "config_sunat_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      config_sunat_secretos: {
        Row: {
          actualizado_en: string
          certificado_clave_cifrada: string | null
          certificado_pfx_cifrado: string | null
          clave_sol_cifrada: string | null
          id: number
        }
        Insert: {
          actualizado_en?: string
          certificado_clave_cifrada?: string | null
          certificado_pfx_cifrado?: string | null
          clave_sol_cifrada?: string | null
          id?: number
        }
        Update: {
          actualizado_en?: string
          certificado_clave_cifrada?: string | null
          certificado_pfx_cifrado?: string | null
          clave_sol_cifrada?: string | null
          id?: number
        }
        Relationships: []
      }
      consultas_cache: {
        Row: {
          clave: string
          creado_en: string
          espacio: string
          expira_en: string | null
          ok: boolean
          payload: Json | null
        }
        Insert: {
          clave: string
          creado_en?: string
          espacio: string
          expira_en?: string | null
          ok: boolean
          payload?: Json | null
        }
        Update: {
          clave?: string
          creado_en?: string
          espacio?: string
          expira_en?: string | null
          ok?: boolean
          payload?: Json | null
        }
        Relationships: []
      }
      consultas_cuota: {
        Row: {
          actualizado: string
          agotado_forzado: boolean
          consumidas: number
          fin_ciclo: string
          inicio_ciclo: string
          limite: number
          periodo: string
          plan: string
          ultimo_umbral_notificado: number
        }
        Insert: {
          actualizado?: string
          agotado_forzado?: boolean
          consumidas?: number
          fin_ciclo: string
          inicio_ciclo: string
          limite: number
          periodo: string
          plan: string
          ultimo_umbral_notificado?: number
        }
        Update: {
          actualizado?: string
          agotado_forzado?: boolean
          consumidas?: number
          fin_ciclo?: string
          inicio_ciclo?: string
          limite?: number
          periodo?: string
          plan?: string
          ultimo_umbral_notificado?: number
        }
        Relationships: []
      }
      consultas_log: {
        Row: {
          creado_en: string
          desde_cache: boolean
          endpoint: string
          id: number
          ms: number | null
          param_hash: string | null
          periodo: string
          prioridad: string
          status_code: number | null
        }
        Insert: {
          creado_en?: string
          desde_cache?: boolean
          endpoint: string
          id?: number
          ms?: number | null
          param_hash?: string | null
          periodo: string
          prioridad: string
          status_code?: number | null
        }
        Update: {
          creado_en?: string
          desde_cache?: boolean
          endpoint?: string
          id?: number
          ms?: number | null
          param_hash?: string | null
          periodo?: string
          prioridad?: string
          status_code?: number | null
        }
        Relationships: []
      }
      cotizacion_items: {
        Row: {
          cantidad: number
          cantidad_aprobada: number | null
          codigo: string
          costo_unitario: number
          cotizacion_id: string
          descripcion: string
          descuento_pct: number
          dias_entrega: number | null
          disponibilidad: Database["public"]["Enums"]["disponibilidad_item"]
          entrega: string | null
          id: string
          importe: number | null
          marca: string | null
          orden: number
          precio_minimo_ref: number
          producto_id: string | null
          unidad_codigo: string
          valor_unitario: number
        }
        Insert: {
          cantidad?: number
          cantidad_aprobada?: number | null
          codigo: string
          costo_unitario?: number
          cotizacion_id: string
          descripcion: string
          descuento_pct?: number
          dias_entrega?: number | null
          disponibilidad?: Database["public"]["Enums"]["disponibilidad_item"]
          entrega?: string | null
          id?: string
          importe?: number | null
          marca?: string | null
          orden?: number
          precio_minimo_ref?: number
          producto_id?: string | null
          unidad_codigo?: string
          valor_unitario?: number
        }
        Update: {
          cantidad?: number
          cantidad_aprobada?: number | null
          codigo?: string
          costo_unitario?: number
          cotizacion_id?: string
          descripcion?: string
          descuento_pct?: number
          dias_entrega?: number | null
          disponibilidad?: Database["public"]["Enums"]["disponibilidad_item"]
          entrega?: string | null
          id?: string
          importe?: number | null
          marca?: string | null
          orden?: number
          precio_minimo_ref?: number
          producto_id?: string | null
          unidad_codigo?: string
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_items_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_items_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cotizacion_id"]
          },
          {
            foreignKeyName: "cotizacion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_items_unidad_codigo_fkey"
            columns: ["unidad_codigo"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["codigo"]
          },
        ]
      }
      cotizaciones: {
        Row: {
          actualizado_en: string
          aprobada_en: string | null
          aprobada_por: string | null
          cliente_id: string
          condiciones: string | null
          contacto: string | null
          contacto_id: string | null
          correlativo: number
          costo_total: number
          creado_en: string
          descuento_total: number
          enviada_en: string | null
          estado: Database["public"]["Enums"]["estado_cotizacion"]
          fecha: string
          fecha_vencimiento: string | null
          id: string
          igv: number
          margen_pct: number
          mostrar_descuento: boolean
          mostrar_disponibilidad: boolean
          motivo_rechazo: string | null
          numero: string | null
          observaciones: string | null
          orden_compra_cliente: string | null
          serie: string
          subtotal: number
          tiempo_entrega: string | null
          total: number
          validez_dias: number
          vendedor_id: string | null
        }
        Insert: {
          actualizado_en?: string
          aprobada_en?: string | null
          aprobada_por?: string | null
          cliente_id: string
          condiciones?: string | null
          contacto?: string | null
          contacto_id?: string | null
          correlativo: number
          costo_total?: number
          creado_en?: string
          descuento_total?: number
          enviada_en?: string | null
          estado?: Database["public"]["Enums"]["estado_cotizacion"]
          fecha?: string
          fecha_vencimiento?: string | null
          id?: string
          igv?: number
          margen_pct?: number
          mostrar_descuento?: boolean
          mostrar_disponibilidad?: boolean
          motivo_rechazo?: string | null
          numero?: string | null
          observaciones?: string | null
          orden_compra_cliente?: string | null
          serie?: string
          subtotal?: number
          tiempo_entrega?: string | null
          total?: number
          validez_dias?: number
          vendedor_id?: string | null
        }
        Update: {
          actualizado_en?: string
          aprobada_en?: string | null
          aprobada_por?: string | null
          cliente_id?: string
          condiciones?: string | null
          contacto?: string | null
          contacto_id?: string | null
          correlativo?: number
          costo_total?: number
          creado_en?: string
          descuento_total?: number
          enviada_en?: string | null
          estado?: Database["public"]["Enums"]["estado_cotizacion"]
          fecha?: string
          fecha_vencimiento?: string | null
          id?: string
          igv?: number
          margen_pct?: number
          mostrar_descuento?: boolean
          mostrar_disponibilidad?: boolean
          motivo_rechazo?: string | null
          numero?: string | null
          observaciones?: string | null
          orden_compra_cliente?: string | null
          serie?: string
          subtotal?: number
          tiempo_entrega?: string | null
          total?: number
          validez_dias?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cotizaciones_contacto_id_fkey"
            columns: ["contacto_id"]
            isOneToOne: false
            referencedRelation: "cliente_contactos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa: {
        Row: {
          actualizado_en: string
          agente_retencion: boolean
          banco: string | null
          cci: string | null
          celular: string | null
          cuenta_corriente: string | null
          cuenta_detraccion: string | null
          detraccion_monto_minimo: number
          detraccion_porcentaje: number
          direccion: string | null
          email: string | null
          email_ventas: string | null
          eslogan: string | null
          id: number
          igv_porcentaje: number
          logo_url: string | null
          moneda: string
          nombre_comercial: string
          razon_social: string
          retencion_porcentaje: number
          ruc: string
          telefono: string | null
          ubigeo_codigo: string | null
          web: string | null
        }
        Insert: {
          actualizado_en?: string
          agente_retencion?: boolean
          banco?: string | null
          cci?: string | null
          celular?: string | null
          cuenta_corriente?: string | null
          cuenta_detraccion?: string | null
          detraccion_monto_minimo?: number
          detraccion_porcentaje?: number
          direccion?: string | null
          email?: string | null
          email_ventas?: string | null
          eslogan?: string | null
          id?: number
          igv_porcentaje?: number
          logo_url?: string | null
          moneda?: string
          nombre_comercial: string
          razon_social: string
          retencion_porcentaje?: number
          ruc: string
          telefono?: string | null
          ubigeo_codigo?: string | null
          web?: string | null
        }
        Update: {
          actualizado_en?: string
          agente_retencion?: boolean
          banco?: string | null
          cci?: string | null
          celular?: string | null
          cuenta_corriente?: string | null
          cuenta_detraccion?: string | null
          detraccion_monto_minimo?: number
          detraccion_porcentaje?: number
          direccion?: string | null
          email?: string | null
          email_ventas?: string | null
          eslogan?: string | null
          id?: number
          igv_porcentaje?: number
          logo_url?: string | null
          moneda?: string
          nombre_comercial?: string
          razon_social?: string
          retencion_porcentaje?: number
          ruc?: string
          telefono?: string | null
          ubigeo_codigo?: string | null
          web?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_ubigeo_fk"
            columns: ["ubigeo_codigo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      familias: {
        Row: {
          activo: boolean
          codigo: string
          descripcion: string | null
          icono: string | null
          id: string
          nombre: string
          nombre_norm: string | null
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          descripcion?: string | null
          icono?: string | null
          id?: string
          nombre: string
          nombre_norm?: string | null
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          descripcion?: string | null
          icono?: string | null
          id?: string
          nombre?: string
          nombre_norm?: string | null
          orden?: number
        }
        Relationships: []
      }
      gastos_importacion: {
        Row: {
          compra_id: string
          concepto: string
          creado_en: string
          documento: string | null
          fecha: string
          id: string
          monto: number
        }
        Insert: {
          compra_id: string
          concepto: string
          creado_en?: string
          documento?: string | null
          fecha?: string
          id?: string
          monto: number
        }
        Update: {
          compra_id?: string
          concepto?: string
          creado_en?: string
          documento?: string | null
          fecha?: string
          id?: string
          monto?: number
        }
        Relationships: [
          {
            foreignKeyName: "gastos_importacion_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
        ]
      }
      gestiones_cobranza: {
        Row: {
          canal: string
          cliente_id: string
          comprobante_id: string | null
          compromiso_fecha: string | null
          fecha: string
          id: string
          nota: string | null
          resultado: string | null
          usuario_id: string | null
        }
        Insert: {
          canal?: string
          cliente_id: string
          comprobante_id?: string | null
          compromiso_fecha?: string | null
          fecha?: string
          id?: string
          nota?: string | null
          resultado?: string | null
          usuario_id?: string | null
        }
        Update: {
          canal?: string
          cliente_id?: string
          comprobante_id?: string | null
          compromiso_fecha?: string | null
          fecha?: string
          id?: string
          nota?: string | null
          resultado?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gestiones_cobranza_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_cobranza_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_cobranza_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "gestiones_cobranza_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_cobranza_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gestiones_cobranza_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "gestiones_cobranza_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guia_items: {
        Row: {
          cantidad: number
          codigo: string
          cotizacion_item_id: string | null
          descripcion: string
          guia_id: string
          id: string
          orden: number
          peso_kg: number
          producto_id: string
          unidad_codigo: string
        }
        Insert: {
          cantidad: number
          codigo: string
          cotizacion_item_id?: string | null
          descripcion: string
          guia_id: string
          id?: string
          orden?: number
          peso_kg?: number
          producto_id: string
          unidad_codigo?: string
        }
        Update: {
          cantidad?: number
          codigo?: string
          cotizacion_item_id?: string | null
          descripcion?: string
          guia_id?: string
          id?: string
          orden?: number
          peso_kg?: number
          producto_id?: string
          unidad_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "guia_items_cotizacion_item_id_fkey"
            columns: ["cotizacion_item_id"]
            isOneToOne: false
            referencedRelation: "cotizacion_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guia_items_cotizacion_item_id_fkey"
            columns: ["cotizacion_item_id"]
            isOneToOne: false
            referencedRelation: "v_comprometido"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "guia_items_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "guias_remision"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guia_items_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["guia_id"]
          },
          {
            foreignKeyName: "guia_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guia_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guia_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guia_items_unidad_codigo_fkey"
            columns: ["unidad_codigo"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["codigo"]
          },
        ]
      }
      guias_remision: {
        Row: {
          actualizado_en: string
          agencia_id: string | null
          anulada_en: string | null
          anulada_por: string | null
          cliente_id: string
          conductor_documento: string | null
          conductor_licencia: string | null
          conductor_nombre: string | null
          correlativo: number
          cotizacion_id: string | null
          creado_en: string
          creado_por: string | null
          direccion_llegada: string
          direccion_partida: string
          entregado_por: string | null
          estado: Database["public"]["Enums"]["estado_guia"]
          estado_sunat: Database["public"]["Enums"]["estado_sunat"]
          fecha_emision: string
          fecha_traslado: string
          id: string
          modalidad_traslado: string
          motivo_anulacion: string | null
          motivo_codigo: string
          motivo_descripcion: string | null
          numero: string | null
          numero_bultos: number
          observaciones: string | null
          orden_compra_cliente: string | null
          peso_bruto_kg: number
          recibido_por: string | null
          serie: string
          sunat_cdr_url: string | null
          sunat_codigo_respuesta: string | null
          sunat_enviado_en: string | null
          sunat_hash_cdr: string | null
          sunat_mensaje: string | null
          sunat_ticket: string | null
          sunat_xml_url: string | null
          transportista_documento: string | null
          transportista_placa: string | null
          transportista_razon_social: string | null
          ubigeo_llegada: string
          ubigeo_partida: string
          unidad_peso: string
        }
        Insert: {
          actualizado_en?: string
          agencia_id?: string | null
          anulada_en?: string | null
          anulada_por?: string | null
          cliente_id: string
          conductor_documento?: string | null
          conductor_licencia?: string | null
          conductor_nombre?: string | null
          correlativo: number
          cotizacion_id?: string | null
          creado_en?: string
          creado_por?: string | null
          direccion_llegada: string
          direccion_partida: string
          entregado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_guia"]
          estado_sunat?: Database["public"]["Enums"]["estado_sunat"]
          fecha_emision?: string
          fecha_traslado?: string
          id?: string
          modalidad_traslado?: string
          motivo_anulacion?: string | null
          motivo_codigo?: string
          motivo_descripcion?: string | null
          numero?: string | null
          numero_bultos?: number
          observaciones?: string | null
          orden_compra_cliente?: string | null
          peso_bruto_kg: number
          recibido_por?: string | null
          serie?: string
          sunat_cdr_url?: string | null
          sunat_codigo_respuesta?: string | null
          sunat_enviado_en?: string | null
          sunat_hash_cdr?: string | null
          sunat_mensaje?: string | null
          sunat_ticket?: string | null
          sunat_xml_url?: string | null
          transportista_documento?: string | null
          transportista_placa?: string | null
          transportista_razon_social?: string | null
          ubigeo_llegada: string
          ubigeo_partida: string
          unidad_peso?: string
        }
        Update: {
          actualizado_en?: string
          agencia_id?: string | null
          anulada_en?: string | null
          anulada_por?: string | null
          cliente_id?: string
          conductor_documento?: string | null
          conductor_licencia?: string | null
          conductor_nombre?: string | null
          correlativo?: number
          cotizacion_id?: string | null
          creado_en?: string
          creado_por?: string | null
          direccion_llegada?: string
          direccion_partida?: string
          entregado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_guia"]
          estado_sunat?: Database["public"]["Enums"]["estado_sunat"]
          fecha_emision?: string
          fecha_traslado?: string
          id?: string
          modalidad_traslado?: string
          motivo_anulacion?: string | null
          motivo_codigo?: string
          motivo_descripcion?: string | null
          numero?: string | null
          numero_bultos?: number
          observaciones?: string | null
          orden_compra_cliente?: string | null
          peso_bruto_kg?: number
          recibido_por?: string | null
          serie?: string
          sunat_cdr_url?: string | null
          sunat_codigo_respuesta?: string | null
          sunat_enviado_en?: string | null
          sunat_hash_cdr?: string | null
          sunat_mensaje?: string | null
          sunat_ticket?: string | null
          sunat_xml_url?: string | null
          transportista_documento?: string | null
          transportista_placa?: string | null
          transportista_razon_social?: string | null
          ubigeo_llegada?: string
          ubigeo_partida?: string
          unidad_peso?: string
        }
        Relationships: [
          {
            foreignKeyName: "guias_remision_agencia_id_fkey"
            columns: ["agencia_id"]
            isOneToOne: false
            referencedRelation: "agencias_transporte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_anulada_por_fkey"
            columns: ["anulada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "guias_remision_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cotizacion_id"]
          },
          {
            foreignKeyName: "guias_remision_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guias_remision_motivo_codigo_fkey"
            columns: ["motivo_codigo"]
            isOneToOne: false
            referencedRelation: "motivos_traslado"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "guias_remision_ubigeo_llegada_fkey"
            columns: ["ubigeo_llegada"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "guias_remision_ubigeo_partida_fkey"
            columns: ["ubigeo_partida"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      marcas: {
        Row: {
          activo: boolean
          creado_en: string
          descripcion: string | null
          id: string
          nombre: string
          nombre_norm: string | null
          orden: number
          pais: string | null
          segmento: string | null
        }
        Insert: {
          activo?: boolean
          creado_en?: string
          descripcion?: string | null
          id?: string
          nombre: string
          nombre_norm?: string | null
          orden?: number
          pais?: string | null
          segmento?: string | null
        }
        Update: {
          activo?: boolean
          creado_en?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          nombre_norm?: string | null
          orden?: number
          pais?: string | null
          segmento?: string | null
        }
        Relationships: []
      }
      motivos_nota: {
        Row: {
          activo: boolean
          codigo: string
          descripcion: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
        }
        Insert: {
          activo?: boolean
          codigo: string
          descripcion: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
        }
        Update: {
          activo?: boolean
          codigo?: string
          descripcion?: string
          tipo?: Database["public"]["Enums"]["tipo_documento"]
        }
        Relationships: []
      }
      motivos_traslado: {
        Row: {
          activo: boolean
          codigo: string
          descripcion: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          descripcion: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          descripcion?: string
          orden?: number
        }
        Relationships: []
      }
      movimientos_inventario: {
        Row: {
          cantidad: number
          costo_promedio: number
          costo_unitario: number
          creado_en: string
          fecha: string
          id: number
          motivo: string | null
          producto_id: string
          referencia_id: string | null
          referencia_numero: string | null
          referencia_tipo: string | null
          saldo_cantidad: number
          saldo_valorizado: number
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          costo_promedio?: number
          costo_unitario?: number
          creado_en?: string
          fecha?: string
          id?: never
          motivo?: string | null
          producto_id: string
          referencia_id?: string | null
          referencia_numero?: string | null
          referencia_tipo?: string | null
          saldo_cantidad: number
          saldo_valorizado: number
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          costo_promedio?: number
          costo_unitario?: number
          creado_en?: string
          fecha?: string
          id?: never
          motivo?: string | null
          producto_id?: string
          referencia_id?: string | null
          referencia_numero?: string | null
          referencia_tipo?: string | null
          saldo_cantidad?: number
          saldo_valorizado?: number
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          comprobante_id: string
          creado_en: string
          cuota_id: string | null
          fecha: string
          id: string
          medio: string
          monto: number
          observaciones: string | null
          referencia: string | null
          registrado_por: string | null
        }
        Insert: {
          comprobante_id: string
          creado_en?: string
          cuota_id?: string | null
          fecha?: string
          id?: string
          medio?: string
          monto: number
          observaciones?: string | null
          referencia?: string | null
          registrado_por?: string | null
        }
        Update: {
          comprobante_id?: string
          creado_en?: string
          cuota_id?: string | null
          fecha?: string
          id?: string
          medio?: string
          monto?: number
          observaciones?: string | null
          referencia?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_cartera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "pagos_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "comprobante_cuotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          activo: boolean
          cargo: string | null
          creado_en: string
          email: string | null
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          telefono: string | null
          ultimo_acceso: string | null
        }
        Insert: {
          activo?: boolean
          cargo?: string | null
          creado_en?: string
          email?: string | null
          id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          telefono?: string | null
          ultimo_acceso?: string | null
        }
        Update: {
          activo?: boolean
          cargo?: string | null
          creado_en?: string
          email?: string | null
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          telefono?: string | null
          ultimo_acceso?: string | null
        }
        Relationships: []
      }
      permisos_rol: {
        Row: {
          escribir: boolean
          nota: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          tabla: string
        }
        Insert: {
          escribir?: boolean
          nota?: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          tabla: string
        }
        Update: {
          escribir?: boolean
          nota?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          tabla?: string
        }
        Relationships: []
      }
      producto_equivalencias: {
        Row: {
          clase: string
          creado_en: string
          creado_por: string | null
          equivalente_id: string
          id: string
          nota: string | null
          producto_id: string
        }
        Insert: {
          clase?: string
          creado_en?: string
          creado_por?: string | null
          equivalente_id: string
          id?: string
          nota?: string | null
          producto_id: string
        }
        Update: {
          clase?: string
          creado_en?: string
          creado_por?: string | null
          equivalente_id?: string
          id?: string
          nota?: string | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_equivalencias_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_equivalencias_equivalente_id_fkey"
            columns: ["equivalente_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_equivalencias_equivalente_id_fkey"
            columns: ["equivalente_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_equivalencias_equivalente_id_fkey"
            columns: ["equivalente_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_equivalencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_equivalencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_equivalencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          actualizado_en: string
          archivado: boolean
          archivado_en: string | null
          archivado_por: string | null
          atributos: Json
          busq_codigo: string | null
          busq_codigo_fab: string | null
          busq_descripcion: string | null
          busqueda: string | null
          codigo: string
          codigo_fabricante: string | null
          codigo_norm: string | null
          costo_promedio: number
          creado_en: string
          creado_por: string | null
          descripcion: string
          designacion_base: string | null
          familia_id: string
          id: string
          imagen_url: string | null
          marca_id: string
          margen_objetivo_pct: number
          motivo_archivado: string | null
          peso_kg: number
          precio_mercado: number
          precio_minimo: number
          precio_promedio: number
          precio_promedio_actualizado_en: string | null
          precio_venta: number
          proveedor_id: string | null
          stock_maximo: number
          stock_minimo: number
          subfamilia_id: string
          tipo_id: string | null
          ubicacion: string | null
          ultimo_costo: number
          unidad_codigo: string
        }
        Insert: {
          actualizado_en?: string
          archivado?: boolean
          archivado_en?: string | null
          archivado_por?: string | null
          atributos?: Json
          busq_codigo?: string | null
          busq_codigo_fab?: string | null
          busq_descripcion?: string | null
          busqueda?: string | null
          codigo: string
          codigo_fabricante?: string | null
          codigo_norm?: string | null
          costo_promedio?: number
          creado_en?: string
          creado_por?: string | null
          descripcion: string
          designacion_base?: string | null
          familia_id: string
          id?: string
          imagen_url?: string | null
          marca_id: string
          margen_objetivo_pct?: number
          motivo_archivado?: string | null
          peso_kg?: number
          precio_mercado?: number
          precio_minimo?: number
          precio_promedio?: number
          precio_promedio_actualizado_en?: string | null
          precio_venta?: number
          proveedor_id?: string | null
          stock_maximo?: number
          stock_minimo?: number
          subfamilia_id: string
          tipo_id?: string | null
          ubicacion?: string | null
          ultimo_costo?: number
          unidad_codigo?: string
        }
        Update: {
          actualizado_en?: string
          archivado?: boolean
          archivado_en?: string | null
          archivado_por?: string | null
          atributos?: Json
          busq_codigo?: string | null
          busq_codigo_fab?: string | null
          busq_descripcion?: string | null
          busqueda?: string | null
          codigo?: string
          codigo_fabricante?: string | null
          codigo_norm?: string | null
          costo_promedio?: number
          creado_en?: string
          creado_por?: string | null
          descripcion?: string
          designacion_base?: string | null
          familia_id?: string
          id?: string
          imagen_url?: string | null
          marca_id?: string
          margen_objetivo_pct?: number
          motivo_archivado?: string | null
          peso_kg?: number
          precio_mercado?: number
          precio_minimo?: number
          precio_promedio?: number
          precio_promedio_actualizado_en?: string | null
          precio_venta?: number
          proveedor_id?: string | null
          stock_maximo?: number
          stock_minimo?: number
          subfamilia_id?: string
          tipo_id?: string | null
          ubicacion?: string | null
          ultimo_costo?: number
          unidad_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_archivado_por_fkey"
            columns: ["archivado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_subfamilia_fk"
            columns: ["subfamilia_id", "familia_id"]
            isOneToOne: false
            referencedRelation: "subfamilias"
            referencedColumns: ["id", "familia_id"]
          },
          {
            foreignKeyName: "productos_tipo_fk"
            columns: ["tipo_id", "subfamilia_id"]
            isOneToOne: false
            referencedRelation: "tipos"
            referencedColumns: ["id", "subfamilia_id"]
          },
          {
            foreignKeyName: "productos_unidad_codigo_fkey"
            columns: ["unidad_codigo"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["codigo"]
          },
        ]
      }
      proveedor_marcas: {
        Row: {
          marca_id: string
          proveedor_id: string
        }
        Insert: {
          marca_id: string
          proveedor_id: string
        }
        Update: {
          marca_id?: string
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proveedor_marcas_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proveedor_marcas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          actualizado_en: string
          busq_documento: string | null
          busq_razon_social: string | null
          busqueda: string | null
          codigo: string
          contacto: string | null
          creado_en: string
          dias_pago: number
          direccion: string | null
          email: string | null
          id: string
          lead_time_dias: number
          notas: string | null
          numero_documento: string | null
          pais: string
          razon_social: string
          telefono: string | null
          tipo: Database["public"]["Enums"]["tipo_compra"]
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo_codigo: string | null
          whatsapp: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          busq_documento?: string | null
          busq_razon_social?: string | null
          busqueda?: string | null
          codigo: string
          contacto?: string | null
          creado_en?: string
          dias_pago?: number
          direccion?: string | null
          email?: string | null
          id?: string
          lead_time_dias?: number
          notas?: string | null
          numero_documento?: string | null
          pais?: string
          razon_social: string
          telefono?: string | null
          tipo?: Database["public"]["Enums"]["tipo_compra"]
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo_codigo?: string | null
          whatsapp?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          busq_documento?: string | null
          busq_razon_social?: string | null
          busqueda?: string | null
          codigo?: string
          contacto?: string | null
          creado_en?: string
          dias_pago?: number
          direccion?: string | null
          email?: string | null
          id?: string
          lead_time_dias?: number
          notas?: string | null
          numero_documento?: string | null
          pais?: string
          razon_social?: string
          telefono?: string | null
          tipo?: Database["public"]["Enums"]["tipo_compra"]
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_identidad"]
          ubigeo_codigo?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_ubigeo_codigo_fkey"
            columns: ["ubigeo_codigo"]
            isOneToOne: false
            referencedRelation: "ubigeo"
            referencedColumns: ["codigo"]
          },
        ]
      }
      recepcion_items: {
        Row: {
          cantidad: number
          costo_unitario: number
          id: string
          producto_id: string
          recepcion_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario?: number
          id?: string
          producto_id: string
          recepcion_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          id?: string
          producto_id?: string
          recepcion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "recepciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "v_precios_compra"
            referencedColumns: ["recepcion_id"]
          },
        ]
      }
      recepciones: {
        Row: {
          anulada: boolean
          compra_id: string | null
          creado_en: string
          factura_proveedor: string | null
          fecha: string
          guia_proveedor: string | null
          id: string
          moneda: string
          numero: string
          observaciones: string | null
          proveedor_id: string | null
          recibido_por: string | null
          tipo_cambio: number | null
        }
        Insert: {
          anulada?: boolean
          compra_id?: string | null
          creado_en?: string
          factura_proveedor?: string | null
          fecha?: string
          guia_proveedor?: string | null
          id?: string
          moneda?: string
          numero: string
          observaciones?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          tipo_cambio?: number | null
        }
        Update: {
          anulada?: boolean
          compra_id?: string | null
          creado_en?: string
          factura_proveedor?: string | null
          fecha?: string
          guia_proveedor?: string | null
          id?: string
          moneda?: string
          numero?: string
          observaciones?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          tipo_cambio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recepciones_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_recibido_por_fkey"
            columns: ["recibido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      series_documento: {
        Row: {
          activo: boolean
          correlativo_actual: number
          correlativo_inicial: number
          creado_en: string
          descripcion: string | null
          id: string
          longitud: number
          predeterminada: boolean
          serie: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
        }
        Insert: {
          activo?: boolean
          correlativo_actual?: number
          correlativo_inicial?: number
          creado_en?: string
          descripcion?: string | null
          id?: string
          longitud?: number
          predeterminada?: boolean
          serie: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
        }
        Update: {
          activo?: boolean
          correlativo_actual?: number
          correlativo_inicial?: number
          creado_en?: string
          descripcion?: string | null
          id?: string
          longitud?: number
          predeterminada?: boolean
          serie?: string
          tipo?: Database["public"]["Enums"]["tipo_documento"]
        }
        Relationships: []
      }
      stock: {
        Row: {
          actualizado_en: string
          cantidad: number
          costo_promedio: number
          producto_id: string
          reservado: number
          valorizado: number
        }
        Insert: {
          actualizado_en?: string
          cantidad?: number
          costo_promedio?: number
          producto_id: string
          reservado?: number
          valorizado?: number
        }
        Update: {
          actualizado_en?: string
          cantidad?: number
          costo_promedio?: number
          producto_id?: string
          reservado?: number
          valorizado?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: true
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
        ]
      }
      subfamilias: {
        Row: {
          activo: boolean
          codigo: string
          familia_id: string
          id: string
          nombre: string
          nombre_norm: string | null
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          familia_id: string
          id?: string
          nombre: string
          nombre_norm?: string | null
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          familia_id?: string
          id?: string
          nombre?: string
          nombre_norm?: string | null
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "subfamilias_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subfamilias_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "v_valorizacion_inventario"
            referencedColumns: ["familia_id"]
          },
        ]
      }
      tipos: {
        Row: {
          activo: boolean
          codigo: string
          familia_id: string
          id: string
          nombre: string
          nombre_norm: string | null
          orden: number
          subfamilia_id: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          familia_id: string
          id?: string
          nombre: string
          nombre_norm?: string | null
          orden?: number
          subfamilia_id: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          familia_id?: string
          id?: string
          nombre?: string
          nombre_norm?: string | null
          orden?: number
          subfamilia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_subfamilia_fk"
            columns: ["subfamilia_id", "familia_id"]
            isOneToOne: false
            referencedRelation: "subfamilias"
            referencedColumns: ["id", "familia_id"]
          },
        ]
      }
      ubigeo: {
        Row: {
          busqueda: string | null
          codigo: string
          codigo_sunat: string | null
          departamento: string
          distrito: string
          etiqueta: string | null
          origen: string
          provincia: string
        }
        Insert: {
          busqueda?: string | null
          codigo: string
          codigo_sunat?: string | null
          departamento: string
          distrito: string
          etiqueta?: string | null
          origen?: string
          provincia: string
        }
        Update: {
          busqueda?: string | null
          codigo?: string
          codigo_sunat?: string | null
          departamento?: string
          distrito?: string
          etiqueta?: string | null
          origen?: string
          provincia?: string
        }
        Relationships: []
      }
      unidades_medida: {
        Row: {
          abreviatura: string
          activo: boolean
          codigo: string
          etiqueta: string
          orden: number
        }
        Insert: {
          abreviatura: string
          activo?: boolean
          codigo: string
          etiqueta: string
          orden?: number
        }
        Update: {
          abreviatura?: string
          activo?: boolean
          codigo?: string
          etiqueta?: string
          orden?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_cartera: {
        Row: {
          cliente: string | null
          cliente_id: string | null
          condicion_pago: Database["public"]["Enums"]["condicion_pago"] | null
          detraccion_aplica: boolean | null
          detraccion_monto: number | null
          dias_vencido: number | null
          documento: string | null
          estado: Database["public"]["Enums"]["estado_comprobante"] | null
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string | null
          numero: string | null
          orden_compra_cliente: string | null
          pagado: number | null
          retencion_aplica: boolean | null
          retencion_monto: number | null
          saldo: number | null
          tipo: Database["public"]["Enums"]["tipo_documento"] | null
          total: number | null
          tramo_aging: string | null
          vendedor: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_comprometido: {
        Row: {
          cliente: string | null
          cliente_id: string | null
          codigo: string | null
          comprometido: number | null
          costo_referencia: number | null
          cotizacion: string | null
          cotizacion_id: string | null
          cotizado: number | null
          descripcion: string | null
          dias_entrega: number | null
          disponibilidad:
            | Database["public"]["Enums"]["disponibilidad_item"]
            | null
          falta: number | null
          fecha: string | null
          item_id: string | null
          marca: string | null
          producto_id: string | null
          stock: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_items_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_items_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cotizacion_id"]
          },
          {
            foreignKeyName: "cotizacion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_resumen_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "v_trazabilidad_venta"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      v_historial_precios: {
        Row: {
          cantidad: number | null
          cliente: string | null
          cliente_id: string | null
          descuento_pct: number | null
          documento: string | null
          estado: string | null
          fecha: string | null
          origen: string | null
          producto_id: string | null
          valor_unitario: number | null
        }
        Relationships: []
      }
      v_kardex: {
        Row: {
          codigo: string | null
          costo_promedio: number | null
          costo_unitario: number | null
          descripcion: string | null
          entrada: number | null
          fecha: string | null
          id: number | null
          motivo: string | null
          producto_id: string | null
          referencia_id: string | null
          referencia_numero: string | null
          referencia_tipo: string | null
          saldo_cantidad: number | null
          saldo_valorizado: number | null
          salida: number | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"] | null
          usuario: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
        ]
      }
      v_precios_compra: {
        Row: {
          cantidad: number | null
          codigo: string | null
          costo_anterior_usd: number | null
          costo_moneda: number | null
          costo_usd: number | null
          descripcion: string | null
          documento: string | null
          fecha: string | null
          moneda: string | null
          producto_id: string | null
          proveedor: string | null
          proveedor_id: string | null
          recepcion_id: string | null
          tipo_cambio: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcion_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_productos_stock: {
        Row: {
          actualizado_en: string | null
          archivado: boolean | null
          codigo: string | null
          codigo_fabricante: string | null
          codigo_norm: string | null
          costo_promedio: number | null
          creado_en: string | null
          descripcion: string | null
          disponible: number | null
          estado_stock: string | null
          familia: string | null
          familia_id: string | null
          id: string | null
          marca: string | null
          marca_id: string | null
          marca_segmento: string | null
          margen_pct: number | null
          peso_kg: number | null
          precio_mercado: number | null
          precio_minimo: number | null
          precio_promedio: number | null
          precio_venta: number | null
          proveedor: string | null
          proveedor_id: string | null
          reservado: number | null
          stock: number | null
          stock_maximo: number | null
          stock_minimo: number | null
          subfamilia: string | null
          subfamilia_id: string | null
          tipo: string | null
          tipo_id: string | null
          ubicacion: string | null
          ultimo_costo: number | null
          unidad: string | null
          unidad_codigo: string | null
          valorizado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_subfamilia_fk"
            columns: ["subfamilia_id", "familia_id"]
            isOneToOne: false
            referencedRelation: "subfamilias"
            referencedColumns: ["id", "familia_id"]
          },
          {
            foreignKeyName: "productos_tipo_fk"
            columns: ["tipo_id", "subfamilia_id"]
            isOneToOne: false
            referencedRelation: "tipos"
            referencedColumns: ["id", "subfamilia_id"]
          },
          {
            foreignKeyName: "productos_unidad_codigo_fkey"
            columns: ["unidad_codigo"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["codigo"]
          },
        ]
      }
      v_reposicion: {
        Row: {
          codigo: string | null
          consumo_diario: number | null
          costo_promedio: number | null
          descripcion: string | null
          dias_cobertura: number | null
          estado_stock: string | null
          familia: string | null
          id: string | null
          marca: string | null
          precio_venta: number | null
          stock: number | null
          stock_maximo: number | null
          stock_minimo: number | null
          subfamilia: string | null
          sugerido_comprar: number | null
          valorizado: number | null
        }
        Relationships: []
      }
      v_resumen_clientes: {
        Row: {
          bloqueado: boolean | null
          codigo: string | null
          dias_credito: number | null
          expuesto: number | null
          id: string | null
          linea_credito: number | null
          linea_disponible: number | null
          numero_documento: string | null
          razon_social: string | null
          ultima_venta: string | null
          uso_linea_pct: number | null
          vencido: number | null
          vendedor: string | null
          ventas_12m: number | null
        }
        Relationships: []
      }
      v_top_productos: {
        Row: {
          clientes: number | null
          codigo: string | null
          costo: number | null
          descripcion: string | null
          marca: string | null
          margen: number | null
          margen_pct: number | null
          producto_id: string | null
          subfamilia: string | null
          ultima_venta: string | null
          unidades: number | null
          venta: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_productos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobante_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "v_reposicion"
            referencedColumns: ["id"]
          },
        ]
      }
      v_trazabilidad_item: {
        Row: {
          cantidad: number | null
          contraparte: string | null
          contraparte_doc: string | null
          contraparte_id: string | null
          dia: string | null
          documento: string | null
          documento_id: string | null
          estado: string | null
          evento: string | null
          fecha: string | null
          importe: number | null
          lado: string | null
          producto_id: string | null
          referencia: string | null
          secuencia: number | null
          unitario: number | null
        }
        Relationships: []
      }
      v_trazabilidad_venta: {
        Row: {
          cliente: string | null
          cliente_id: string | null
          comprobante: string | null
          comprobante_id: string | null
          cotizacion: string | null
          cotizacion_id: string | null
          estado_comprobante:
            | Database["public"]["Enums"]["estado_comprobante"]
            | null
          estado_cotizacion:
            | Database["public"]["Enums"]["estado_cotizacion"]
            | null
          estado_guia: Database["public"]["Enums"]["estado_guia"] | null
          estado_sunat: Database["public"]["Enums"]["estado_sunat"] | null
          fecha_cotizacion: string | null
          fecha_emision: string | null
          fecha_traslado: string | null
          guia: string | null
          guia_id: string | null
          orden_compra_cliente: string | null
          peso_bruto_kg: number | null
          saldo: number | null
          total_cotizado: number | null
          total_facturado: number | null
        }
        Relationships: []
      }
      v_valorizacion_inventario: {
        Row: {
          familia: string | null
          familia_id: string | null
          margen_potencial: number | null
          skus: number | null
          skus_con_stock: number | null
          subfamilia: string | null
          subfamilia_id: string | null
          unidades: number | null
          valor_costo: number | null
          valor_venta: number | null
        }
        Relationships: []
      }
      v_ventas_mensuales: {
        Row: {
          costo: number | null
          documentos: number | null
          igv: number | null
          margen: number | null
          margen_pct: number | null
          mes: string | null
          total: number | null
          venta_neta: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _tres_letras: { Args: { n: number }; Returns: string }
      a_dolares: {
        Args: { p_moneda: string; p_monto: number; p_tipo_cambio: number }
        Returns: number
      }
      anular_compra: { Args: { p_id: string; p_motivo: string }; Returns: Json }
      anular_comprobante: {
        Args: { p_id: string; p_motivo: string }
        Returns: Json
      }
      anular_guia: { Args: { p_id: string; p_motivo: string }; Returns: Json }
      aprobar_cotizacion: {
        Args: { p_id: string; p_lineas?: Json }
        Returns: Json
      }
      asegurar_ubigeo: {
        Args: {
          p_codigo: string
          p_departamento: string
          p_distrito: string
          p_provincia: string
        }
        Returns: string
      }
      buscar_clientes: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          activo: boolean
          bloqueado: boolean
          codigo: string
          condicion_pago: Database["public"]["Enums"]["condicion_pago"]
          contacto: string
          contactos: number
          cotizaciones: number
          dias_credito: number
          email: string
          id: string
          linea_credito: number
          motivo_bloqueo: string
          nombre_comercial: string
          numero_documento: string
          puntaje: number
          razon_social: string
          telefono: string
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          ultima_cotizacion: string
          whatsapp: string
        }[]
      }
      buscar_productos: {
        Args: { p_limit?: number; p_q: string; p_solo_con_stock?: boolean }
        Returns: {
          codigo: string
          codigo_fabricante: string
          costo_promedio: number
          descripcion: string
          estado_stock: string
          familia: string
          id: string
          marca: string
          precio_minimo: number
          precio_promedio: number
          precio_venta: number
          relevancia: number
          stock: number
          subfamilia: string
          tipo: string
          unidad: string
        }[]
      }
      buscar_proveedores: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          activo: boolean
          codigo: string
          compras: number
          contacto: string
          dias_pago: number
          direccion: string
          email: string
          id: string
          lead_time_dias: number
          marcas: string[]
          numero_documento: string
          pais: string
          puntaje: number
          razon_social: string
          telefono: string
          tipo: Database["public"]["Enums"]["tipo_compra"]
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          ultima_compra: string
          whatsapp: string
        }[]
      }
      buscar_ubigeo: {
        Args: { p_limit?: number; p_q: string }
        Returns: {
          codigo: string
          departamento: string
          distrito: string
          etiqueta: string
          provincia: string
          relevancia: number
        }[]
      }
      clientes_de_producto: {
        Args: { p_desde: string; p_hasta: string; p_producto: string }
        Returns: {
          cliente: string
          cliente_id: string
          documentos: number
          ultima_compra: string
          ultimo_precio: number
          unidades: number
          venta: number
        }[]
      }
      clientes_sugeridos: {
        Args: { p_limit?: number }
        Returns: {
          activo: boolean
          bloqueado: boolean
          codigo: string
          condicion_pago: Database["public"]["Enums"]["condicion_pago"]
          contacto: string
          contactos: number
          cotizaciones: number
          dias_credito: number
          email: string
          id: string
          linea_credito: number
          motivo_bloqueo: string
          nombre_comercial: string
          numero_documento: string
          puntaje: number
          razon_social: string
          telefono: string
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          ultima_cotizacion: string
          whatsapp: string
        }[]
      }
      codigo_catalogo: {
        Args: { p_nombre: string; p_tabla: unknown }
        Returns: string
      }
      consultas_liberar_cuota: {
        Args: { p_periodo: string }
        Returns: undefined
      }
      consultas_marcar_agotado: {
        Args: { p_periodo: string }
        Returns: undefined
      }
      consultas_reservar_cuota: {
        Args: {
          p_fin_ciclo: string
          p_inicio_ciclo: string
          p_limite: number
          p_periodo: string
          p_plan: string
          p_prioridad: string
          p_reserva_pct: number
        }
        Returns: {
          concedido: boolean
          consumidas: number
          limite: number
          periodo: string
          plan: string
        }[]
      }
      contactos_de_cliente: {
        Args: { p_cliente: string }
        Returns: {
          area: string
          cargo: string
          email: string
          id: string
          nombre: string
          principal: boolean
          telefono: string
          whatsapp: string
        }[]
      }
      crear_compra: { Args: { p_datos: Json }; Returns: Json }
      crear_cotizacion: { Args: { p_datos: Json }; Returns: Json }
      crear_familia: { Args: { p_nombre: string }; Returns: Json }
      crear_marca: { Args: { p_nombre: string }; Returns: Json }
      crear_subfamilia: {
        Args: { p_familia: string; p_nombre: string }
        Returns: Json
      }
      crear_tipo: {
        Args: { p_nombre: string; p_subfamilia: string }
        Returns: Json
      }
      dias_por_defecto: {
        Args: { p_disp: Database["public"]["Enums"]["disponibilidad_item"] }
        Returns: number
      }
      emitir_comprobante: { Args: { p_datos: Json }; Returns: Json }
      emitir_guia: { Args: { p_id: string }; Returns: Json }
      es_gerencia: { Args: never; Returns: boolean }
      generar_alertas: { Args: never; Returns: Json }
      generar_guia_desde_cotizacion: { Args: { p_datos: Json }; Returns: Json }
      historial_precio_producto: {
        Args: { p_cliente?: string; p_limit?: number; p_producto: string }
        Returns: {
          cantidad: number
          cliente: string
          documento: string
          fecha: string
          mismo_cliente: boolean
          valor_unitario: number
        }[]
      }
      importar_productos: {
        Args: { p_filas: Json; p_simular?: boolean }
        Returns: Json
      }
      kpis_dashboard: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: Json
      }
      mi_rol: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      normalizar_codigo: { Args: { p_codigo: string }; Returns: string }
      normalizar_texto: { Args: { p_texto: string }; Returns: string }
      numero_a_letras: {
        Args: { p_moneda?: string; p_monto: number }
        Returns: string
      }
      pendiente_de_recibir: {
        Args: { p_compra: string }
        Returns: {
          codigo: string
          costo_unitario: number
          descripcion: string
          marca: string
          pedido: number
          pendiente: number
          producto_id: string
          recibido: number
          unidad_codigo: string
        }[]
      }
      productos_pagina: {
        Args: {
          p_archivados?: boolean
          p_cursor?: string
          p_familia?: string
          p_limit?: number
          p_marca?: string
          p_q?: string
          p_subfamilia?: string
          p_tipo?: string
        }
        Returns: {
          archivado: boolean
          codigo: string
          codigo_fabricante: string
          codigo_norm: string
          costo_promedio: number
          descripcion: string
          estado_stock: string
          familia: string
          id: string
          marca: string
          precio_promedio: number
          precio_venta: number
          stock: number
          stock_maximo: number
          stock_minimo: number
          subfamilia: string
          tipo: string
          unidad: string
        }[]
      }
      proveedores_sugeridos: {
        Args: { p_limit?: number }
        Returns: {
          activo: boolean
          codigo: string
          compras: number
          contacto: string
          dias_pago: number
          direccion: string
          email: string
          id: string
          lead_time_dias: number
          marcas: string[]
          numero_documento: string
          pais: string
          puntaje: number
          razon_social: string
          telefono: string
          tipo: Database["public"]["Enums"]["tipo_compra"]
          tipo_documento: Database["public"]["Enums"]["tipo_documento_identidad"]
          ultima_compra: string
          whatsapp: string
        }[]
      }
      puede_escribir: { Args: { p_tabla: string }; Returns: boolean }
      recalcular_precios_promedio: {
        Args: { p_meses?: number; p_productos?: Json }
        Returns: number
      }
      recepcionar_mercaderia: { Args: { p_datos: Json }; Returns: Json }
      refrescar_alertas: { Args: never; Returns: Json }
      registrar_ajuste_inventario: { Args: { p_datos: Json }; Returns: Json }
      registrar_movimiento: {
        Args: {
          p_cantidad: number
          p_costo?: number
          p_motivo?: string
          p_producto: string
          p_referencia_id?: string
          p_referencia_numero?: string
          p_referencia_tipo?: string
          p_tipo: Database["public"]["Enums"]["tipo_movimiento"]
          p_usuario?: string
        }
        Returns: number
      }
      registrar_movimientos: {
        Args: { p_movimientos: Json; p_usuario?: string }
        Returns: Json
      }
      registrar_pagos: { Args: { p_pagos: Json }; Returns: Json }
      resumen_trazabilidad: { Args: { p_producto: string }; Returns: Json }
      serie_compras: {
        Args: { p_desde: string; p_grano?: string; p_hasta: string }
        Returns: {
          costo_total: number
          gastos: number
          ordenes: number
          periodo: string
          proveedores: number
          subtotal: number
        }[]
      }
      serie_ventas: {
        Args: { p_desde: string; p_grano?: string; p_hasta: string }
        Returns: {
          costo: number
          documentos: number
          margen: number
          margen_pct: number
          periodo: string
          unidades: number
          venta: number
        }[]
      }
      siguiente_correlativo: {
        Args: {
          p_serie?: string
          p_tipo: Database["public"]["Enums"]["tipo_documento"]
        }
        Returns: number
      }
      siguiente_numero_interno: {
        Args: { p_tipo: Database["public"]["Enums"]["tipo_documento"] }
        Returns: string
      }
      sustitutos_de: {
        Args: {
          p_limit?: number
          p_producto: string
          p_tolerancia_pct?: number
        }
        Returns: {
          codigo: string
          descripcion: string
          diferencia_pct: number
          id: string
          marca: string
          mejor_oferta: boolean
          origen: string
          precio_minimo: number
          precio_venta: number
          prioridad: number
          stock: number
        }[]
      }
      tiene_rol: { Args: { p_roles: string[] }; Returns: boolean }
      top_clientes_rango: {
        Args: { p_desde: string; p_hasta: string; p_limit?: number }
        Returns: {
          cliente: string
          cliente_id: string
          costo: number
          dias_entre_compras: number
          dias_sin_comprar: number
          documento: string
          documentos: number
          margen: number
          margen_pct: number
          primera_compra: string
          ultima_compra: string
          venta: number
        }[]
      }
      top_productos_rango: {
        Args: { p_desde: string; p_hasta: string; p_limit?: number }
        Returns: {
          cliente_principal: string
          cliente_principal_id: string
          cliente_principal_pct: number
          clientes: number
          codigo: string
          costo: number
          descripcion: string
          documentos: number
          marca: string
          margen: number
          margen_pct: number
          producto_id: string
          ultima_venta: string
          unidades: number
          venta: number
        }[]
      }
      ubigeo_de_sunat: { Args: { p_codigo: string }; Returns: string }
      ubigeo_departamentos: {
        Args: never
        Returns: {
          departamento: string
          distritos: number
        }[]
      }
      ubigeo_distritos: {
        Args: { p_departamento: string; p_provincia: string }
        Returns: {
          codigo: string
          distrito: string
          origen: string
        }[]
      }
      ubigeo_provincias: {
        Args: { p_departamento: string }
        Returns: {
          distritos: number
          provincia: string
        }[]
      }
      unidad_periodo: { Args: { p_grano: string }; Returns: string }
    }
    Enums: {
      condicion_pago: "contado" | "credito"
      disponibilidad_item: "inmediata" | "exterior" | "fabricacion"
      estado_compra: "registrada" | "recibida_parcial" | "recibida" | "anulada"
      estado_comprobante:
        | "emitido"
        | "parcial"
        | "pagado"
        | "vencido"
        | "anulado"
      estado_cotizacion:
        | "borrador"
        | "enviada"
        | "aprobada"
        | "rechazada"
        | "vencida"
        | "atendida"
        | "anulada"
      estado_guia: "borrador" | "emitida" | "anulada"
      estado_sunat:
        | "no_enviado"
        | "pendiente"
        | "enviado"
        | "aceptado"
        | "observado"
        | "rechazado"
        | "baja_solicitada"
        | "baja_aceptada"
      rol_usuario:
        | "gerencia"
        | "admin"
        | "ventas"
        | "almacen"
        | "compras"
        | "cobranzas"
      severidad_alerta: "info" | "baja" | "media" | "alta" | "critica"
      tipo_ajuste:
        | "cuadre_inicial"
        | "descuadre"
        | "merma"
        | "devolucion_interna"
      tipo_compra: "local" | "importacion"
      tipo_documento:
        | "cotizacion"
        | "guia_remision"
        | "factura"
        | "boleta"
        | "nota_credito"
        | "nota_debito"
        | "compra"
        | "recepcion"
        | "ajuste_inventario"
      tipo_documento_identidad: "RUC" | "DNI" | "CE" | "PAS" | "SIN_DOC"
      tipo_movimiento:
        | "ingreso"
        | "salida"
        | "ajuste_positivo"
        | "ajuste_negativo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      condicion_pago: ["contado", "credito"],
      disponibilidad_item: ["inmediata", "exterior", "fabricacion"],
      estado_compra: ["registrada", "recibida_parcial", "recibida", "anulada"],
      estado_comprobante: [
        "emitido",
        "parcial",
        "pagado",
        "vencido",
        "anulado",
      ],
      estado_cotizacion: [
        "borrador",
        "enviada",
        "aprobada",
        "rechazada",
        "vencida",
        "atendida",
        "anulada",
      ],
      estado_guia: ["borrador", "emitida", "anulada"],
      estado_sunat: [
        "no_enviado",
        "pendiente",
        "enviado",
        "aceptado",
        "observado",
        "rechazado",
        "baja_solicitada",
        "baja_aceptada",
      ],
      rol_usuario: [
        "gerencia",
        "admin",
        "ventas",
        "almacen",
        "compras",
        "cobranzas",
      ],
      severidad_alerta: ["info", "baja", "media", "alta", "critica"],
      tipo_ajuste: [
        "cuadre_inicial",
        "descuadre",
        "merma",
        "devolucion_interna",
      ],
      tipo_compra: ["local", "importacion"],
      tipo_documento: [
        "cotizacion",
        "guia_remision",
        "factura",
        "boleta",
        "nota_credito",
        "nota_debito",
        "compra",
        "recepcion",
        "ajuste_inventario",
      ],
      tipo_documento_identidad: ["RUC", "DNI", "CE", "PAS", "SIN_DOC"],
      tipo_movimiento: [
        "ingreso",
        "salida",
        "ajuste_positivo",
        "ajuste_negativo",
      ],
    },
  },
} as const
