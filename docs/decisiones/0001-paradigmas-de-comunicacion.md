# 0001 · Paradigmas de comunicación: gRPC con contratos primero

- **Estado:** aceptada
- **Fecha:** 15 de octubre de 2026
- **Alcance:** toda la comunicación entre las piezas de ActaFlow

## Contexto

ActaFlow tiene cuatro piezas desplegadas por separado: el BFF (Next.js en Vercel), dos
microservicios en Java (`identity-service` y `legal-case-service`, en Render) y el motor de IA
en Python (Render). Se comunican entre sí constantemente y en tres lenguajes distintos.

Requisitos que condicionan la elección:

1. **Tres lenguajes** (TypeScript, Java y Python) deben compartir exactamente los mismos tipos.
2. **Contenido cifrado y binario:** audio, borradores y documentos viajan como bytes cifrados.
3. **Streaming:** eventos de la audiencia en vivo y transcripción continua.
4. **Contrato primero:** el diseño de la API es lo primero que se hace y es la única fuente de
   verdad; el código se genera a partir de él.
5. **Plan gratuito:** Render Free solo expone HTTP/1.1 hacia internet.

## Opciones evaluadas

| Criterio | REST + JSON (OpenAPI) | GraphQL | tRPC | **gRPC (Protocol Buffers)** |
|---|---|---|---|---|
| Unidad de diseño | Recursos y verbos HTTP | Grafo de tipos y consultas | Procedimientos TypeScript | **Funciones remotas (RPC)** |
| Contrato | OpenAPI (opcional y a menudo escrito después) | Esquema SDL | No hay: el tipo es el código del servidor | **`.proto`, obligatorio y previo al código** |
| Lenguajes | Todos | Todos | **Solo TypeScript** | Todos, con generadores oficiales |
| Formato | Texto (JSON) | Texto (JSON) | Texto (JSON) | **Binario compacto** |
| Bytes (audio cifrado) | Base64 (+33 %) | Base64 (+33 %) | Base64 (+33 %) | **Nativos** |
| Streaming | No nativo (SSE aparte) | Suscripciones (WebSocket aparte) | Suscripciones | **Servidor, cliente y bidireccional** |
| Transporte | HTTP/1.1 | HTTP/1.1 | HTTP/1.1 | **HTTP/2 multiplexado** |
| Validación en el contrato | JSON Schema | Escalares personalizados | Zod (solo TS) | **protovalidate en los tres lenguajes** |
| Detección de cambios incompatibles | Herramientas externas | Herramientas externas | El compilador de TS | **`buf breaking` en CI** |

### Por qué no las otras

- **tRPC** da tipado de punta a punta excelente, pero solo si cliente y servidor son
  TypeScript. Nuestro backend es Java y el motor es Python: no aplica.
- **GraphQL** resuelve la sobre-obtención de datos de clientes muy variados. Aquí el único
  cliente es nuestro BFF, que pide exactamente lo que necesita. Añadiría resolvers, el
  problema N+1 y caché compleja, sin aportar binario ni streaming bidireccional.
- **REST** organiza la API en recursos y verbos (GET, POST, PUT). Nuestras operaciones son
  acciones de negocio (`StartHearing`, `SubmitAudioSegment`, `FillMinute`, `AcceptFinalDocument`)
  que encajan mal en ese molde. Además, JSON obliga a convertir el audio cifrado a base64.

## Decisión

**Todos los servicios se comunican con gRPC, diseñado contrato primero en este repositorio.**

| Tramo | Paradigma | Por qué |
|---|---|---|
| Navegador → BFF | **Server Actions y Server Components de Next** (llamadas a funciones tipadas, sin endpoints REST) | El navegador no puede hablar gRPC nativo (ninguno puede: no expone los *trailers* de HTTP/2) |
| BFF → microservicios | **gRPC** (local y CI) / **gRPC-Web** (producción) | Ver la decisión 0003 |
| `legal-case-service` → motor de IA | **gRPC** / **gRPC-Web** | Igual |
| Colaboración en vivo | **WebSocket** con tramas **protobuf binarias** (`ClientFrame` / `ServerFrame`) | Vercel no mantiene sockets largos; el contrato cubre también este canal |
| Chequeo de salud de Render | `GET /health` y `GET /actuator/health` | Es infraestructura (Render solo sabe hacer GET), no parte de la API |

### Contract-First en la práctica

1. **Diseñar:** se escriben los `.proto` en `proto/actaflow/<dominio>/v1/`: servicios, RPC,
   mensajes, reglas de validación y comentarios. Todo en inglés.
2. **Verificar el diseño:** `buf lint` (estilo STANDARD, comentarios obligatorios, reglas
   protovalidate que compilan), `buf breaking` (nada que rompa a los clientes desplegados) y
   tests de las reglas.
3. **Publicar una versión:** una etiqueta `vX.Y.Z` en este repositorio.
4. **Generar:** cada repositorio consumidor fija una versión y genera su código:
   - frontend: tipos y clientes TypeScript (`protoc-gen-es` + ConnectRPC) y *mocks* tipados;
   - backend: mensajes Java y bases de servicio (`protoc` + `protoc-gen-grpc-java` en Maven);
   - motor de IA: mensajes y servicios Python (`grpcio-tools`).
5. **Programar:** solo queda rellenar las clases generadas con la lógica de negocio.

Como el frontend genera *mocks* a partir del mismo contrato, puede avanzar sin esperar a que
el backend implemente un servicio: si el contrato cambia, los *mocks* dejan de compilar.

## Mediciones

Tamaño del mismo mensaje en protobuf binario frente a JSON, medido con mensajes reales del
contrato (`tests/payload-size.test.mjs`):

| Mensaje | Protobuf | JSON | Ahorro |
|---|---|---|---|
| `EntityExtractionResult` con 20 montos | 3.285 B | 7.833 B | **58,1 %** |
| `GetServiceStatusResponse` con 3 componentes | 198 B | 621 B | **68,1 %** |
| `EncryptedBlob` con 120 KB de audio | 120.023 B | 160.091 B | **25,0 %** (JSON obliga a usar base64) |

## Consecuencias y *trade-offs* aceptados

- **Depuración:** el binario no se lee en las DevTools del navegador. Se mitiga con logs
  estructurados en cada servicio y con `buf curl`, que habla gRPC desde la terminal.
- **gRPC-Web en producción** pierde el streaming del cliente al servidor y el bidireccional
  (ver 0003). Por eso el audio se envía por segmentos unarios (`SubmitAudioSegment`), y
  `StreamTranscription` queda para local, CI y redes con HTTP/2.
- **Disciplina de versiones:** un contrato publicado no se puede cambiar libremente. Solo se
  agregan campos nuevos, y CI rechaza cualquier cambio incompatible.
- **Curva de aprendizaje y herramientas:** Buf, protoc y los generadores de cada lenguaje.
