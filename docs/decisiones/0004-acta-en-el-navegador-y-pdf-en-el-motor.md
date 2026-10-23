# ADR 0004 · El acta se llena en el navegador y el PDF lo genera el motor

Estado: aceptada (v0.4.0).

## Contexto

La v0.1.0 preveía un "document worker" que llenara la plantilla y generara el PDF como
procesador sellado. Ese servicio no existe, y el acta es la pieza más confidencial del caso.

## Decisión

1. **Llenado en el navegador.** El lenguaje de plantillas es público y determinista: el navegador
   llena la versión publicada con las entidades revisadas y los datos del caso. Nadie más ve el
   borrador. `FillMinute` queda en el contrato por compatibilidad y legal-case responde
   `UNIMPLEMENTED`.
2. **PDF en el motor de IA.** Al cerrar el acta, el navegador sella el contenido final
   (`FinalContent`) para la clave del motor, igual que el audio. El motor
   (`DocumentService.RenderMinutePdf`) genera el PDF en memoria y lo devuelve cifrado con la misma
   clave de contenido, junto con su SHA-256.
3. **Sello sin ver el documento.** legal-case firma el SHA-256 (firma CMS separada, con atributos
   firmados) con el certificado propio de ActaFlow. Para eso no necesita el PDF.
4. **Aceptación con segundo factor.** El TOTP lo guarda identity. `AuthService.ConfirmPresence`
   verifica el código y entrega una prueba firmada (2 minutos, un solo propósito:
   `accept-minute:<documento>:<sha256>`) que legal-case verifica con las claves públicas de
   identity. La prueba nunca vale como token de acceso.

## Consecuencias

- El borrador no se guarda en el servidor: se reconstruye en el navegador desde la plantilla, las
  entidades revisadas y los datos del caso. Lo que se escribe a mano se completa al cerrar.
- El motor gana una responsabilidad más, pero reutiliza el mismo esquema de sobres y la misma cola.
- El sello es de integridad, no una firma digital certificada (Ley 527 de 1999).
