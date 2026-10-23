// Las reglas de validacion son parte del contrato: estos tests prueban que hacen lo que
// dicen, con el mismo motor (protovalidate) que usan el BFF, el backend y el motor de IA.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { create, createFileRegistry, fromBinary } from '@bufbuild/protobuf'
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'
import { createValidator } from '@bufbuild/protovalidate'
import { construirImagen } from '../scripts/generate-docs.mjs'

const registro = createFileRegistry(fromBinary(FileDescriptorSetSchema, construirImagen()))
const validador = createValidator({ registry: registro })
const UUID = '0b8f6f4e-1c2d-4e3f-9a8b-7c6d5e4f3a2b'

function validar(tipo, datos) {
  const esquema = registro.getMessage(tipo)
  assert.ok(esquema, `no existe ${tipo}`)
  const resultado = validador.validate(esquema, create(esquema, datos))
  return resultado.kind === 'valid' ? [] : resultado.violations.map((v) => v.rule ?? v.toString())
}

function reglasRotas(tipo, datos) {
  const esquema = registro.getMessage(tipo)
  const resultado = validador.validate(esquema, create(esquema, datos))
  if (resultado.kind === 'valid') return []
  return resultado.violations.map((v) => v.ruleId ?? v.toString())
}

test('Money: codigo ISO 4217 y signos coherentes', () => {
  assert.deepEqual(validar('actaflow.common.v1.Money', { currencyCode: 'COP', units: 1500000n }), [])
  assert.notDeepEqual(reglasRotas('actaflow.common.v1.Money', { currencyCode: 'pesos', units: 1n }), [])
  assert.ok(reglasRotas('actaflow.common.v1.Money', { currencyCode: 'COP', units: 1n, nanos: -5 }).includes('money.sign'))
})

test('CalendarDate: rangos de mes y dia', () => {
  assert.deepEqual(validar('actaflow.common.v1.CalendarDate', { year: 2026, month: 11, day: 30 }), [])
  assert.notDeepEqual(validar('actaflow.common.v1.CalendarDate', { year: 2026, month: 13, day: 1 }), [])
})

test('TextSpan: el final no puede ir antes del inicio', () => {
  assert.ok(reglasRotas('actaflow.common.v1.TextSpan', { start: 10, end: 3 }).includes('text_span.order'))
})

test('EncryptedBlob: nonce de 12 bytes y solo AES-256-GCM', () => {
  const valido = { suite: 1, keyId: 'case:x:v1', nonce: new Uint8Array(12), ciphertext: new Uint8Array(32) }
  assert.deepEqual(validar('actaflow.crypto.v1.EncryptedBlob', valido), [])
  assert.notDeepEqual(validar('actaflow.crypto.v1.EncryptedBlob', { ...valido, nonce: new Uint8Array(8) }), [])
  assert.notDeepEqual(validar('actaflow.crypto.v1.EncryptedBlob', { ...valido, suite: 2 }), [])
})

test('InviteParticipantRequest: las partes necesitan lado y calidad; los demas roles no', () => {
  const base = {
    caseId: UUID, email: 'parte@example.com', displayName: 'Maria Lopez', idempotencyKey: UUID,
  }
  assert.deepEqual(validar('actaflow.cases.v1.InviteParticipantRequest', { ...base, role: 3, side: 1, capacity: 1 }), [])
  assert.ok(
    reglasRotas('actaflow.cases.v1.InviteParticipantRequest', { ...base, role: 3 }).includes('invite_participant.party_fields'),
  )
  assert.ok(
    reglasRotas('actaflow.cases.v1.InviteParticipantRequest', { ...base, role: 1, side: 1, capacity: 1 }).includes(
      'invite_participant.party_fields',
    ),
  )
})

test('CompleteSecondFactorRequest: exige exactamente un segundo factor con formato valido', () => {
  const tipo = 'actaflow.identity.v1.CompleteSecondFactorRequest'
  assert.deepEqual(validar(tipo, { challengeId: UUID, factor: { case: 'totpCode', value: '123456' } }), [])
  assert.deepEqual(validar(tipo, { challengeId: UUID, factor: { case: 'recoveryCode', value: 'ABCDE-12345' } }), [])
  assert.notDeepEqual(validar(tipo, { challengeId: UUID }), [])
  assert.notDeepEqual(validar(tipo, { challengeId: UUID, factor: { case: 'totpCode', value: '12345' } }), [])
})

test('CreateCaseRequest: radicado con formato y clave idempotente UUID', () => {
  const tipo = 'actaflow.cases.v1.CreateCaseRequest'
  const blob = { suite: 1, keyId: 'case:x:v1', nonce: new Uint8Array(12), ciphertext: new Uint8Array(32) }
  const llave = {
    suite: 2, recipientKeyId: 'user:x:v1', ephemeralPublicKey: new Uint8Array(65), nonce: new Uint8Array(12),
    wrappedKey: new Uint8Array(48),
  }
  const valido = { caseNumber: 'CC-2026-0142', kind: 1, details: blob, wrappedCaseKey: llave, idempotencyKey: UUID }
  assert.deepEqual(validar(tipo, valido), [])
  assert.notDeepEqual(validar(tipo, { ...valido, caseNumber: 'cc 2026' }), [])
  assert.notDeepEqual(validar(tipo, { ...valido, idempotencyKey: 'no-es-uuid' }), [])
  assert.notDeepEqual(validar(tipo, { ...valido, kind: 0 }), [])
  assert.notDeepEqual(validar(tipo, { ...valido, details: undefined }), [])
})

test('SubmitAudioSegmentRequest: segmentos de maximo 30 segundos', () => {
  const tipo = 'actaflow.hearings.v1.SubmitAudioSegmentRequest'
  const blob = { suite: 1, keyId: 'k', nonce: new Uint8Array(12), ciphertext: new Uint8Array(32) }
  const llave = {
    suite: 2, recipientKeyId: 'processor:engine:v1', ephemeralPublicKey: new Uint8Array(65),
    nonce: new Uint8Array(12), wrappedKey: new Uint8Array(48),
  }
  const sobre = { payload: blob, processorKey: llave, contentKeyForCase: blob }
  const valido = {
    hearingId: UUID, segmentId: UUID, sequence: 0, speakerParticipantId: UUID, durationMs: 20000n, audio: sobre,
  }
  assert.deepEqual(validar(tipo, valido), [])
  assert.notDeepEqual(validar(tipo, { ...valido, durationMs: 45000n }), [])
})

test('RunBenchmarkRequest: modelos definidos y sin repetir', () => {
  const tipo = 'actaflow.engine.v1.RunBenchmarkRequest'
  assert.deepEqual(validar(tipo, { models: [1, 2] }), [])
  assert.notDeepEqual(validar(tipo, { models: [] }), [])
  assert.notDeepEqual(validar(tipo, { models: [1, 1] }), [])
  assert.notDeepEqual(validar(tipo, { models: [0] }), [])
})

test('ConfirmPresenceRequest: codigo de 6 digitos y proposito en minusculas', () => {
  const tipo = 'actaflow.identity.v1.ConfirmPresenceRequest'
  const proposito = `accept-minute:${UUID}:${'a'.repeat(64)}`
  assert.deepEqual(validar(tipo, { totpCode: '123456', purpose: proposito }), [])
  assert.notDeepEqual(validar(tipo, { totpCode: '123456', purpose: '' }), [])
  assert.notDeepEqual(validar(tipo, { totpCode: '123456', purpose: 'Aceptar Acta' }), [])
  assert.notDeepEqual(validar(tipo, { totpCode: '12a456', purpose: proposito }), [])
})

test('AcceptFinalDocumentRequest: exige la prueba de presencia de identity', () => {
  const tipo = 'actaflow.minutes.v1.AcceptFinalDocumentRequest'
  const base = { documentId: UUID, sha256Hex: 'f'.repeat(64), totpCode: '654321' }
  assert.deepEqual(validar(tipo, { ...base, presenceToken: 'a.b.c' }), [])
  assert.notDeepEqual(validar(tipo, base), [])
  assert.notDeepEqual(validar(tipo, { ...base, sha256Hex: 'F'.repeat(64), presenceToken: 'a.b.c' }), [])
})

test('FinalContent y RenderMinutePdfRequest: contenido no vacio y sobre obligatorio', () => {
  assert.deepEqual(validar('actaflow.minutes.v1.FinalContent', { title: 'Acta', html: '<p>x</p>' }), [])
  assert.notDeepEqual(validar('actaflow.minutes.v1.FinalContent', { title: 'Acta', html: '' }), [])
  assert.notDeepEqual(validar('actaflow.engine.v1.RenderMinutePdfRequest', { caseId: UUID, minuteId: UUID }), [])
})
