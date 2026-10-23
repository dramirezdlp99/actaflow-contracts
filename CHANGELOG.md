# Cambios de actaflow-contracts

Versionado semántico. Los consumidores fijan una versión exacta en `contracts.lock.json` y CI
rechaza cambios incompatibles (`buf breaking`, regla `WIRE_JSON`).

## v0.4.0

- `actaflow.identity.v1.AuthService.ConfirmPresence`: confirma con un código TOTP que la persona
  está presente y devuelve una prueba firmada de 2 minutos atada a un propósito. Así legal-case
  exige el segundo factor para aceptar un acta sin tener el secreto TOTP.
- `actaflow.minutes.v1.AcceptFinalDocumentRequest`: nuevo campo `presence_token = 4` (la prueba
  anterior, con propósito `accept-minute:<documento>:<sha256>`).
- `actaflow.minutes.v1.FinalContent`: contenido final del acta sellado para el motor en
  `CloseMinute`.
- `actaflow.engine.v1.DocumentService.RenderMinutePdf`: el motor de IA hace de procesador de
  documentos y genera el PDF del acta sin que legal-case lo vea; devuelve el PDF cifrado y su
  SHA-256 para el sello.
- El navegador llena la plantilla (ADR 0004): `FillMinute` queda por compatibilidad.
- Cambios compatibles: solo se agregan RPC, mensajes y un campo.

## v0.3.0

- `actaflow.templates.v1.TemplateService`: nuevas RPC `ListOrganizationTemplates` (para que un
  administrador vuelva a encontrar los borradores de su organización que aún no publica) y
  `GetTemplateVersion` (una versión con su fuente, para volver a abrir un borrador en el editor).
- `actaflow.templates.v1.TemplateDiagnostics`: detalle de error de `SaveTemplateDraft` cuando la
  fuente tiene errores (junto al `ErrorReason` `TEMPLATE_SYNTAX_ERROR`).
- Comentarios alineados con la implementación: verificador guardado como HMAC-SHA-256, tokens
  EdDSA (Ed25519) de 15 minutos, renovación de 30 días, invitación no válida con
  `FAILED_PRECONDITION` y código TOTP incorrecto con `UNAUTHENTICATED`.
- Cambios compatibles: solo se agregan RPC y mensajes.

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
