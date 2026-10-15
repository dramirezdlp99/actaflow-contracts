// Medicion del trade-off "binario vs texto" con mensajes reales del contrato.
// Los numeros se citan en docs/decisiones/0001-paradigmas-de-comunicacion.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { create, createFileRegistry, fromBinary, toBinary, toJsonString } from '@bufbuild/protobuf'
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'
import { construirImagen } from '../scripts/generate-docs.mjs'

const registro = createFileRegistry(fromBinary(FileDescriptorSetSchema, construirImagen()))

export function medir(tipo, datos) {
  const esquema = registro.getMessage(tipo)
  const mensaje = create(esquema, datos)
  const binario = toBinary(esquema, mensaje).length
  const json = Buffer.byteLength(toJsonString(esquema, mensaje, { registry: registro }))
  return { binario, json, ahorro: 1 - binario / json }
}

function entidadMonto(i) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    value: {
      case: 'amount',
      value: {
        amount: { currencyCode: 'COP', units: 1500000n },
        writtenForm: 'un millón quinientos mil pesos',
        installments: 3,
        installmentAmount: { currencyCode: 'COP', units: 500000n },
        debtorPartyIndex: 1,
        creditorPartyIndex: 0,
      },
    },
    source: { segmentIndex: i, span: { start: 120, end: 151 }, fragment: 'la suma de un millón quinientos mil pesos' },
    confidence: 0.93,
  }
}

test('un resultado de extraccion con 20 montos pesa mucho menos en protobuf que en JSON', () => {
  const r = medir('actaflow.legal.v1.EntityExtractionResult', {
    amounts: Array.from({ length: 20 }, (_, i) => entidadMonto(i)),
    referenceDate: { year: 2026, month: 10, day: 15 },
    pipelineVersion: 'actaflow-ner-1.0+es_core_news_sm-3.8',
  })
  console.log(`EntityExtractionResult (20 montos): protobuf ${r.binario} B, JSON ${r.json} B, ahorro ${(r.ahorro * 100).toFixed(1)} %`)
  assert.ok(r.binario < r.json)
  assert.ok(r.ahorro > 0.3)
})

test('un segmento de audio cifrado: el JSON tendria que codificar los bytes en base64 (+33 %)', () => {
  const audio = new Uint8Array(120000)
  const blob = { suite: 1, keyId: 'k', nonce: new Uint8Array(12), ciphertext: audio }
  const r = medir('actaflow.crypto.v1.EncryptedBlob', blob)
  console.log(`EncryptedBlob (120 KB de audio): protobuf ${r.binario} B, JSON ${r.json} B, ahorro ${(r.ahorro * 100).toFixed(1)} %`)
  assert.ok(r.json > r.binario * 1.3)
})

test('el estado del sistema con tres componentes', () => {
  const componente = (id) => ({ id, kind: 1, state: 1, latencyMs: 12n, detail: 'PostgreSQL responde; esquema v2', version: '2' })
  const r = medir('actaflow.system.v1.GetServiceStatusResponse', {
    status: {
      serviceName: 'legal-case-service', version: '0.2.0', state: 1, servedVia: 2,
      checkedAt: { seconds: 1760000000n }, components: [componente('database'), componente('ai-engine'), componente('x')],
    },
  })
  console.log(`GetServiceStatusResponse: protobuf ${r.binario} B, JSON ${r.json} B, ahorro ${(r.ahorro * 100).toFixed(1)} %`)
  assert.ok(r.binario < r.json)
})
