# Gestion de Proveedores

Aplicacion web para consultar, registrar y administrar proveedores con busqueda inteligente en una sola barra.

## Funciones incluidas

- Busqueda por multiples palabras, sin importar orden y sin diferenciar mayusculas/minusculas.
- Regla especial por ciudad: devuelve coincidencias de ciudad y cobertura nacional (`TODO EL PAIS` o `NACIONAL`).
- Tabla resumida y panel de detalle completo.
- Autenticacion por usuario/PIN con sesion activa:
  - `admin` / `1234` (crear, editar, importar)
  - `proveedor` / `1234` (solo crear su registro)
- Formulario completo con validaciones obligatorias.
- Carga inicial de datos por CSV, TSV/TXT o JSON (solo administrador).

## Ejecutar en local

```bash
npm install
npm start
```

Abrir en: [http://localhost:3000](http://localhost:3000)

## Estructura de datos para importacion

Formatos soportados: `CSV`, `TSV/TXT` y `JSON`.

Se recomienda usar estos campos:

`codigo_sap, razon_social, nombre_comercial, contacto_comercial, cargo_comercial, correo_electronico, telefono_fijo, extension, celular, ciudad, cobertura_despacho, categoria, materiales, servicios, marca, contacto_facturacion, correo_facturacion, telefono_facturacion`

Tambien se aceptan encabezados comunes del cliente, por ejemplo:

`COD SAP, RAZON SOCIAL, NOMBRE COMERCIAL, CONTACTO COMERCIAL, CARGO COMERCIAL, CORREO ELECTRONICO, FIJO, EXT, CELULAR, CIUDAD, DESPACHA, CATEGORIA, MATERIALES, SERVICIOS, MARCA, CONTACTO FACTURACION, CORREO, TELEFONO FACTURACION`

Ejemplo base creado automaticamente en:

`data/proveedores-ejemplo.csv`

## Publicar con enlace

Opciones rapidas:

1. Railway (recomendado)
2. Render
3. Fly.io

Solo se debe desplegar el proyecto Node y exponer el puerto `3000` (o usar `PORT` del proveedor).
