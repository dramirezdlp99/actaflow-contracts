# 0002 · Tipado de punta a punta y la falsa seguridad de TypeScript

- **Estado:** aceptada
- **Fecha:** 15 de octubre de 2026

## La cadena de confianza

Un dato de ActaFlow pasa por cuatro capas. En cada eslabón el tipo **se deriva del anterior
por generación de código**; nunca se vuelve a escribir a mano:

```
PostgreSQL (migraciones Flyway: la fuente del esquema)
   │  jOOQ genera clases Java desde el esquema real de la base
   ▼
Java (registros jOOQ ──► mensajes protobuf generados)
   │  si una columna cambia de tipo, el mapeo a protobuf deja de compilar
   ▼
Contrato .proto (este repositorio, fuente única de verdad de la API)
   │  protoc-gen-es genera los tipos TypeScript
   ▼
BFF de Next (clientes ConnectRPC tipados)
   │  los Server Components pasan los mensajes como props
   ▼
Componentes React (props con los tipos generados)
```

Equivalencias con lo visto en clase:

| Concepto | En un stack TypeScript | En ActaFlow |
|---|---|---|
| Esquema de la base | PostgreSQL | PostgreSQL (Flyway) |
| ORM o *query builder* que genera tipos | Prisma, Drizzle | **jOOQ** (backend Java) |
| Transporte tipado | tRPC, GraphQL | **gRPC + Protocol Buffers** |
| UI tipada | Props inferidas | Props con los tipos generados por `protoc-gen-es` |

jOOQ entra con las primeras tablas de negocio (las de identidad, en el bloque BE-2). Hasta
entonces, la única tabla propia es la cola de trabajos.

Si el *resolver* del backend devuelve algo que no coincide con el contrato, **falla la
compilación de Java**. Si el frontend usa un campo que el contrato no tiene, **falla la
compilación de TypeScript**.

## La falsa seguridad de TypeScript (*type erasure*)

TypeScript borra los tipos al compilar. Esto **no** protege nada en tiempo de ejecución:

```ts
const usuario = (await respuesta.json()) as Usuario // TypeScript "confía"; nadie comprobó nada
```

Si la API devuelve otra forma, el error aparece mucho después, lejos de su causa.

### Regla de ActaFlow: parsear, no afirmar

Todo dato que cruza una frontera **se parsea** (se valida y se convierte al tipo) en la
frontera misma:

| Frontera | Cómo se parsea |
|---|---|
| Respuestas gRPC de los servicios | `protobuf-es` decodifica el binario contra el esquema; protovalidate comprueba las reglas del contrato |
| Peticiones que llegan a cada servicio | protovalidate en un interceptor (TypeScript, Java y Python aplican las mismas reglas) |
| Datos del navegador hacia el BFF (formularios, Server Actions) | **Zod** |
| Variables de entorno, IndexedDB, `localStorage` | **Zod** |

Además, en el frontend la regla de ESLint `@typescript-eslint/consistent-type-assertions`
prohíbe `as` en el código de producción: no se puede "afirmar" un tipo; hay que parsearlo.

### Validar frente a parsear

- **Validar** responde "¿este dato cumple?" y devuelve un sí o un no. El dato sigue sin tipo.
- **Parsear** responde "dame este dato como `T` o explícame por qué no se puede". Devuelve
  un valor del tipo correcto o un error con la ruta del problema.

Zod (`schema.parse`) y la decodificación de protobuf parsean. protovalidate valida, después
de que el mensaje ya fue parseado por protobuf. Juntos cubren la estructura y las reglas de
negocio.
