# ActaFlow · Contratos

**Fuente única de verdad** de la comunicación entre las piezas de ActaFlow, la plataforma de
generación y maquetación de minutas para audiencias de conciliación y mediaciones legales.

Aquí se **diseña primero** (Contract-First) toda la API: servicios gRPC, funciones remotas,
mensajes, reglas de validación y comentarios, en Protocol Buffers y en inglés. Los otros tres
repositorios generan su código a partir de una versión publicada de este:

| Repositorio | Genera | Con |
|---|---|---|
| `actaflow-frontend` | Tipos y clientes TypeScript, *mocks* tipados | `protoc-gen-es` + ConnectRPC |
| `actaflow-backend` | Mensajes Java y bases de servicio | `protoc` 3.25.8 + `protoc-gen-grpc-java` 1.84.3 (Maven) |
| `actaflow-ai-engine` | Mensajes y servicios Python | `grpcio-tools` |

**14 paquetes, 20 servicios y 74 RPC.** La referencia completa está en
[`docs/api-reference.md`](docs/api-reference.md), generada desde los comentarios de los `.proto`.

## Estructura

```
proto/
  actaflow/
    common/v1/         tipos compartidos: paginación, dinero, fechas, errores
    crypto/v1/         sobres de cifrado del navegador y claves de los procesadores
    system/v1/         estado de cada servicio (lo implementan los tres)
    identity/v1/       autenticación de conocimiento cero con 2FA, cuentas, organización
    cases/v1/          expedientes, participantes, anexos cifrados
    templates/v1/      plantillas jurídicas y su lenguaje (variables, condicionales, cláusulas repetibles)
    legal/v1/          vocabulario jurídico de la IA: transcripción y las 5 familias de entidades
    hearings/v1/       audiencia en vivo: segmentos de audio, extracción y revisión humana
    minutes/v1/        minutas, autocompletado, PDF con sello de integridad y aceptación
    collaboration/v1/  edición colaborativa CRDT y tramas del WebSocket
    jobs/v1/           trabajos asíncronos
    notifications/v1/  avisos dentro de la app
    audit/v1/          quién vio o cambió qué
    engine/v1/         motor de IA: transcripción, extracción y diagnóstico
  buf/validate/        protovalidate v1.2.2 (copia fiel, licencia Apache-2.0 de Buf Technologies)
docs/
  api-reference.md     referencia generada
  mapa-de-servicios.md qué servicio implementa cada contrato y quién lo llama
  decisiones/          por qué gRPC, tipado de punta a punta, gRPC-Web en Render Free
```

## Reglas del contrato

- **Paquetes versionados** (`actaflow.<dominio>.v1`) y estilo `STANDARD` de Buf.
- **Comentarios obligatorios** en cada elemento (`COMMENTS`): la documentación sale de ahí.
- **Validación en el contrato** con [protovalidate](https://github.com/bufbuild/protovalidate):
  formatos, rangos y reglas CEL entre campos. La aplican el BFF, los microservicios y el motor.
- **Compatibilidad:** `buf breaking` (categoría `WIRE_JSON`) en CI. Un contrato publicado solo
  crece: se agregan campos nuevos, nunca se cambia el tipo ni el número de uno existente.
- **Idempotencia:** toda operación que crea o cambia algo lleva una `idempotency_key` UUID
  generada en el cliente, para que la bandeja de salida sin conexión pueda repetir sin duplicar.
- **Errores:** códigos de estado gRPC estándar más detalles tipados (ver `common/v1/errors.proto`).
  A quien no participa en un expediente se le responde siempre `NOT_FOUND`.

## Uso (PowerShell)

```powershell
npm ci
npm run verify     # formato, lint, compilación, documentación al día y tests de las reglas
npm run docs       # regenera docs/api-reference.md después de cambiar un .proto
npm run format     # aplica el formato canónico de Buf
```

## Publicar una versión

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Cada repositorio consumidor fija la versión en su `contracts.lock.json` y la actualiza con
`node scripts/contracts.mjs sync <version>`.
