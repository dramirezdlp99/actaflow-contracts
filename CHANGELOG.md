# Cambios de actaflow-contracts

Versionado semántico. Los consumidores fijan una versión exacta en `contracts.lock.json` y CI
rechaza cambios incompatibles (`buf breaking`, regla `WIRE_JSON`).

## v0.2.0

- `actaflow.identity.v1.InviteMemberResponse`: nuevo campo `invitation_token = 3`. Sin servicio de
  correo, el administrador recibe una sola vez el secreto de la invitación para compartir el enlace
  de registro; el servidor solo guarda su hash. Cambio compatible: agrega un campo.
- ADR 0002: enmienda sobre la persistencia de identity-service (JDBC directo con tests de
  integración en lugar de jOOQ, por ahora).

## v0.1.0

- Primera versión: 14 paquetes, 20 servicios y 74 RPC (identidad, expedientes, audiencias,
  plantillas, actas, colaboración, trabajos, motor de IA, cifrado, estado, notificaciones y
  auditoría).
