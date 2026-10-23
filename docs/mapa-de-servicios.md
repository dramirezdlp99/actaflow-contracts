# Mapa de servicios

Qué microservicio implementa cada contrato y quién lo llama.

```
Navegador ──Server Actions──► BFF (Next, Vercel) ──gRPC/gRPC-Web──► identity-service
                                    │                                (Java, Render)
                                    └──────────gRPC/gRPC-Web──► legal-case-service ──gRPC/gRPC-Web──► ai-engine
                                                                   (Java, Render)          ▲          (Python, Render)
Navegador ◄═════ WebSocket (tramas protobuf, ticket de un solo uso) ═════╝
```

| Servicio gRPC | Paquete | Implementa | Lo llama |
|---|---|---|---|
| `ServiceStatusService` | `actaflow.system.v1` | identity-service, legal-case-service, ai-engine | BFF; legal-case-service (al motor) |
| `AuthService` | `actaflow.identity.v1` | identity-service | BFF |
| `AccountService` | `actaflow.identity.v1` | identity-service | BFF |
| `KeyDirectoryService` | `actaflow.identity.v1` | identity-service | BFF |
| `TokenVerificationService` | `actaflow.identity.v1` | identity-service | legal-case-service |
| `OrganizationService` | `actaflow.identity.v1` | identity-service | BFF |
| `CaseService` | `actaflow.cases.v1` | legal-case-service | BFF |
| `ParticipantService` | `actaflow.cases.v1` | legal-case-service | BFF |
| `AttachmentService` | `actaflow.cases.v1` | legal-case-service | BFF |
| `TemplateService` | `actaflow.templates.v1` | legal-case-service | BFF (la biblioteca pública usa ISR) |
| `HearingService` | `actaflow.hearings.v1` | legal-case-service | BFF |
| `MinuteService` | `actaflow.minutes.v1` | legal-case-service | BFF |
| `CollaborationService` | `actaflow.collaboration.v1` | legal-case-service | BFF (y el WebSocket del navegador) |
| `JobService` | `actaflow.jobs.v1` | legal-case-service | BFF |
| `NotificationService` | `actaflow.notifications.v1` | legal-case-service | BFF |
| `AuditService` | `actaflow.audit.v1` | legal-case-service | BFF |
| `ProcessorKeyService` | `actaflow.crypto.v1` | legal-case-service, ai-engine | BFF; legal-case-service (al motor) |
| `TranscriptionService` | `actaflow.engine.v1` | ai-engine | legal-case-service |
| `ExtractionService` | `actaflow.engine.v1` | ai-engine | legal-case-service |
| `DocumentService` | `actaflow.engine.v1` | ai-engine (procesador de documentos) | legal-case-service |
| `EngineDiagnosticsService` | `actaflow.engine.v1` | ai-engine | script de mediciones |

Los paquetes `actaflow.common.v1` y `actaflow.legal.v1` solo definen tipos compartidos, no
servicios. `actaflow.legal.v1` contiene el vocabulario jurídico de la IA (transcripción y
entidades) que viaja siempre cifrado.

## Puertos locales

| Servicio | Web (gRPC-Web y salud) | gRPC nativo (HTTP/2) |
|---|---|---|
| Frontend (BFF) | 3001 | — |
| legal-case-service | 9097 | 9197 |
| identity-service | 9098 | 9198 |
| ai-engine | 8002 | 8102 |

El 8080 lo usa Jenkins y PanelVault usa 3000/9096/8001: ninguno de estos puertos choca con ellos.
