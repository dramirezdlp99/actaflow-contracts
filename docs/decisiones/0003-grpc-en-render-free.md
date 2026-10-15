# 0003 · gRPC nativo y gRPC-Web: el mismo contrato en dos transportes

- **Estado:** aceptada
- **Fecha:** 15 de octubre de 2026

## Contexto

gRPC nativo necesita **HTTP/2 de punta a punta** (usa *trailers* y multiplexación). Render
Free solo expone HTTP/1.1 hacia internet; gRPC funciona allí únicamente entre servicios de la
red privada, que es de pago
([foro de Render](https://community.render.com/t/grpc-working-on-render/7389)). Vercel tampoco
abre conexiones HTTP/2 de larga duración desde sus funciones.

## Decisión

Cada servicio atiende **los dos transportes con el mismo código**:

| | gRPC nativo | gRPC-Web |
|---|---|---|
| Transporte | HTTP/2 (h2c) | HTTP/1.1 |
| Dónde se usa | Local, CI, redes con HTTP/2 | Producción (Render Free ↔ Vercel) |
| Puerto | Propio (`identity` 9198, `legal-case` 9197, motor 8102) | El puerto web (`identity` 9098, `legal-case` 9097, motor 8002) |
| Unario y streaming del servidor | Sí | Sí |
| Streaming del cliente y bidireccional | Sí | **No** |
| Multiplexación | Sí | No |

El puerto web de cada servicio incluye una **pasarela gRPC-Web interna**:

1. recibe la petición gRPC-Web;
2. desarma las tramas;
3. la reenvía al servidor gRPC del mismo proceso (en memoria, en Java; en `localhost`, en Python);
4. devuelve la respuesta como tramas gRPC-Web.

Así los interceptores (firma HMAC, validación) y las implementaciones son exactamente los
mismos en ambos transportes.

El cliente elige el transporte por configuración:
`ACTAFLOW_RPC_TRANSPORT=grpc` (local) o `grpc-web` (producción).

## Autenticación entre servicios

Cada llamada lleva en los metadatos gRPC una firma HMAC-SHA256 con un secreto compartido
distinto para cada par de servicios:

```
x-actaflow-timestamp: <segundos Unix>
x-actaflow-signature: hex(HMAC-SHA256(secreto, "<timestamp>\nRPC\n/<paquete.Servicio>/<Metodo>\n<sha256 hex del mensaje>"))
```

- El hash cubre los **bytes protobuf exactos** de la petición: un intermediario no puede
  alterarla sin invalidar la firma.
- Las firmas tienen una ventana de 300 segundos.
- En los RPC con streaming del cliente, el hash es el de un mensaje vacío. Los trozos de audio
  ya van protegidos por AES-GCM, que detecta cualquier alteración.
- Los vectores de prueba son los mismos en TypeScript, Java y Python.

## Consecuencias

- En producción el audio viaja **por segmentos unarios** (`SubmitAudioSegment`, ≤ 30 s), lo
  que encaja con la transcripción por intervención medida en el bloque 0 (`tiny` con un
  factor de tiempo real de 0,62).
- `StreamTranscription` (bidireccional) y la multiplexación se demuestran en local y en CI.
- Si algún día los servicios se mueven a una red privada con HTTP/2, basta con cambiar
  `ACTAFLOW_RPC_TRANSPORT`: no hay que tocar código ni contratos.
