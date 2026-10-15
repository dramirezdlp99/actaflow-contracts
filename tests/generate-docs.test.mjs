import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFileRegistry, fromBinary } from '@bufbuild/protobuf'
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'
import { comentario, construirImagen, generarMarkdown, resumen, rutaFuente } from '../scripts/generate-docs.mjs'

const imagen = construirImagen()
const registro = createFileRegistry(fromBinary(FileDescriptorSetSchema, imagen))
const markdown = generarMarkdown(imagen)

test('resumen toma solo el primer parrafo y escapa las barras de las tablas', () => {
  assert.equal(resumen('Primera linea\nsigue.\n\nSegundo parrafo.'), 'Primera linea sigue.')
  assert.equal(resumen('a | b'), 'a \\| b')
})

test('la ruta de fuente sigue la numeracion de FileDescriptorProto', () => {
  const servicio = registro.getService('actaflow.system.v1.ServiceStatusService')
  assert.deepEqual(rutaFuente(servicio), [6, 0])
  assert.deepEqual(rutaFuente(servicio.methods[0]), [6, 0, 2, 0])
  const mensaje = registro.getMessage('actaflow.system.v1.ComponentStatus')
  assert.equal(rutaFuente(mensaje)[0], 4)
  assert.deepEqual(rutaFuente(mensaje.fields[0]).slice(-2), [2, 0])
})

test('extrae los comentarios de servicios, metodos, campos y valores de enum', () => {
  const servicio = registro.getService('actaflow.engine.v1.TranscriptionService')
  assert.match(comentario(servicio), /professional secrecy/)
  assert.match(comentario(servicio.methods[0]), /Transcribes one sealed audio segment/)
  const campo = registro.getMessage('actaflow.common.v1.Money').fields[0]
  assert.match(comentario(campo), /ISO 4217/)
  const valor = registro.getEnum('actaflow.system.v1.Transport').values[2]
  assert.match(comentario(valor), /gRPC-Web/)
})

test('documenta todos los paquetes propios y ninguno ajeno', () => {
  for (const paquete of ['common', 'crypto', 'system', 'identity', 'cases', 'templates', 'legal', 'hearings',
    'minutes', 'collaboration', 'jobs', 'notifications', 'audit', 'engine']) {
    assert.ok(markdown.includes(`## \`actaflow.${paquete}.v1\``), paquete)
  }
  assert.ok(!markdown.includes('## `buf.validate`'))
  assert.ok(!markdown.includes('## `google.protobuf`'))
})

test('cada elemento tiene descripcion (el lint COMMENTS lo exige y la doc lo refleja)', () => {
  assert.ok(!markdown.includes('_No description._'))
  assert.equal(markdown.split('\n').filter((l) => /\|\s*\|$/.test(l)).length, 0)
})

test('muestra las reglas de validacion de campos y de mensajes', () => {
  assert.match(markdown, /`idempotency_key` \| `string` \| `\{"string":\{"uuid":true\}\}`/)
  assert.match(markdown, /Message rule: `\{"cel":\[\{"id":"money.sign"/)
})

test('marca los RPC con streaming', () => {
  assert.match(markdown, /\| `StreamTranscription` \| `stream StreamTranscriptionRequest` \| `stream StreamTranscriptionResponse` \|/)
  assert.match(markdown, /\| `WatchHearingEvents` \| `WatchHearingEventsRequest` \| `stream WatchHearingEventsResponse` \|/)
})
