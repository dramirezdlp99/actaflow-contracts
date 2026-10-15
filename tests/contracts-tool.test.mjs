import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { comprobar, diferencias, huella, huellas, sincronizar } from '../tools/contracts.mjs'

function git(cwd, ...args) {
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'ignore' })
}

/** Repositorio de contratos falso con dos versiones etiquetadas. */
function repositorioFalso() {
  const raiz = mkdtempSync(join(tmpdir(), 'contratos falsos '))
  mkdirSync(join(raiz, 'proto', 'actaflow', 'demo', 'v1'), { recursive: true })
  writeFileSync(join(raiz, 'proto', 'actaflow', 'demo', 'v1', 'demo.proto'), 'syntax = "proto3";\n')
  writeFileSync(join(raiz, 'README.md'), 'no se copia\n')
  git(raiz, 'init', '-q', '-b', 'main')
  git(raiz, 'add', '.')
  git(raiz, 'commit', '-qm', 'v1')
  git(raiz, 'tag', 'v0.1.0')
  writeFileSync(join(raiz, 'proto', 'actaflow', 'demo', 'v1', 'extra.proto'), 'syntax = "proto3";\n')
  git(raiz, 'add', '.')
  git(raiz, 'commit', '-qm', 'v2')
  git(raiz, 'tag', 'v0.2.0')
  return raiz
}

test('la huella ignora la diferencia entre CRLF y LF', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'huella-'))
  writeFileSync(join(carpeta, 'a.proto'), 'linea 1\nlinea 2\n')
  writeFileSync(join(carpeta, 'b.proto'), 'linea 1\r\nlinea 2\r\n')
  assert.equal(huella(join(carpeta, 'a.proto')), huella(join(carpeta, 'b.proto')))
  rmSync(carpeta, { recursive: true, force: true })
})

test('diferencias describe faltantes, modificados y sobrantes', () => {
  assert.deepEqual(diferencias({ a: '1', b: '2' }, { b: '3', c: '4' }), ['falta a', 'modificado b', 'sobra c'])
  assert.deepEqual(diferencias({ a: '1' }, { a: '1' }), [])
})

test('sync copia solo proto/ de la etiqueta pedida y escribe el lock', () => {
  const origen = repositorioFalso()
  const consumidor = mkdtempSync(join(tmpdir(), 'consumidor con espacios '))
  try {
    const lock = sincronizar(consumidor, 'v0.1.0', origen)
    assert.equal(lock.version, 'v0.1.0')
    assert.deepEqual(Object.keys(lock.files), ['actaflow/demo/v1/demo.proto'])
    assert.deepEqual(JSON.parse(readFileSync(join(consumidor, 'contracts.lock.json'), 'utf8')), lock)
    assert.deepEqual(Object.keys(huellas(join(consumidor, 'contracts'))), ['actaflow/demo/v1/demo.proto'])

    const nuevo = sincronizar(consumidor, 'v0.2.0', origen)
    assert.deepEqual(Object.keys(nuevo.files).sort(), ['actaflow/demo/v1/demo.proto', 'actaflow/demo/v1/extra.proto'])
  } finally {
    rmSync(origen, { recursive: true, force: true })
    rmSync(consumidor, { recursive: true, force: true })
  }
})

test('check detecta un contrato editado a mano en el consumidor', () => {
  const origen = repositorioFalso()
  const consumidor = mkdtempSync(join(tmpdir(), 'consumidor-'))
  try {
    sincronizar(consumidor, 'v0.1.0', origen)
    assert.deepEqual(comprobar(consumidor).problemas, [])
    writeFileSync(join(consumidor, 'contracts', 'actaflow', 'demo', 'v1', 'demo.proto'), 'cambiado\n')
    assert.deepEqual(comprobar(consumidor).problemas, ['modificado actaflow/demo/v1/demo.proto'])
  } finally {
    rmSync(origen, { recursive: true, force: true })
    rmSync(consumidor, { recursive: true, force: true })
  }
})

test('check --remote detecta un lock que no corresponde a la etiqueta publicada', () => {
  const origen = repositorioFalso()
  const consumidor = mkdtempSync(join(tmpdir(), 'consumidor-'))
  try {
    sincronizar(consumidor, 'v0.1.0', origen)
    assert.deepEqual(comprobar(consumidor, { remoto: true }).problemas, [])
    const lock = JSON.parse(readFileSync(join(consumidor, 'contracts.lock.json'), 'utf8'))
    lock.version = 'v0.2.0'
    writeFileSync(join(consumidor, 'contracts.lock.json'), JSON.stringify(lock))
    assert.deepEqual(comprobar(consumidor, { remoto: true }).problemas, [
      'falta actaflow/demo/v1/extra.proto respecto a v0.2.0 publicado',
    ])
  } finally {
    rmSync(origen, { recursive: true, force: true })
    rmSync(consumidor, { recursive: true, force: true })
  }
})

test('rechaza versiones que no son etiquetas semanticas', () => {
  assert.throws(() => sincronizar('.', 'main'), /Version invalida/)
})
