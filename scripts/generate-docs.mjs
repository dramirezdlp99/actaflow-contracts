// Genera docs/api-reference.md a partir de los contratos.
//
// Lee la imagen binaria de `buf build` (descriptores + comentarios), y escribe una
// referencia en Markdown: servicios, RPC, mensajes, campos, enums y las reglas de
// validacion (protovalidate) de cada campo. Como la documentacion sale de los comentarios
// del contrato, nunca queda desactualizada: CI falla si alguien cambia un .proto sin
// regenerarla.
//
// Uso: node scripts/generate-docs.mjs [--check]
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createFileRegistry, fromBinary, getOption, hasOption, toJson } from '@bufbuild/protobuf'
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = join(RAIZ, 'docs', 'api-reference.md')

/**
 * Compila los contratos con Buf y devuelve la imagen binaria (FileDescriptorSet con comentarios).
 * Se invoca el lanzador de Node de @bufbuild/buf con el mismo `node`, sin pasar por una
 * consola: asi funciona igual en Windows y Linux aunque la ruta tenga espacios.
 */
export function construirImagen() {
  const lanzador = createRequire(import.meta.url).resolve('@bufbuild/buf/bin/buf')
  return execFileSync(process.execPath, [lanzador, 'build', '-o', '-#format=binpb'], {
    cwd: RAIZ,
    maxBuffer: 64 * 1024 * 1024,
  })
}

/**
 * Ruta del elemento dentro de FileDescriptorProto (la misma que usa SourceCodeInfo):
 * mensaje 4, enum 5, servicio 6; dentro de un mensaje: campo 2, anidado 3, enum 4, oneof 8;
 * dentro de un enum: valor 2; dentro de un servicio: metodo 2.
 */
export function rutaFuente(desc) {
  switch (desc.kind) {
    case 'message':
      return desc.parent
        ? [...rutaFuente(desc.parent), 3, desc.parent.nestedMessages.indexOf(desc)]
        : [4, desc.file.messages.indexOf(desc)]
    case 'enum':
      return desc.parent
        ? [...rutaFuente(desc.parent), 4, desc.parent.nestedEnums.indexOf(desc)]
        : [5, desc.file.enums.indexOf(desc)]
    case 'service':
      return [6, desc.file.services.indexOf(desc)]
    case 'rpc':
      return [...rutaFuente(desc.parent), 2, desc.parent.methods.indexOf(desc)]
    case 'field':
      return [...rutaFuente(desc.parent), 2, desc.parent.proto.field.indexOf(desc.proto)]
    case 'enum_value':
      return [...rutaFuente(desc.parent), 2, desc.parent.values.indexOf(desc)]
    default:
      return []
  }
}

function archivoDe(desc) {
  let actual = desc
  while (!actual.file && actual.parent) actual = actual.parent
  return actual.file
}

/** Comentario principal de un elemento, limpio y en una linea por parrafo. */
export function comentario(desc) {
  const ruta = rutaFuente(desc).join(',')
  const ubicacion = archivoDe(desc).proto.sourceCodeInfo?.location.find((l) => l.path.join(',') === ruta)
  const texto = ubicacion?.leadingComments ?? ''
  return texto
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim()
}

/** Primera frase de un comentario, para tablas. */
export function resumen(texto) {
  const parrafo = texto.split(/\n\s*\n/)[0] ?? ''
  return parrafo.replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()
}

function nombreTipo(campo) {
  let base
  switch (campo.fieldKind) {
    case 'message':
      base = campo.message.typeName
      break
    case 'enum':
      base = campo.enum.typeName
      break
    case 'map': {
      const valor =
        campo.mapKind === 'message' ? campo.message.typeName : campo.mapKind === 'enum' ? campo.enum.typeName : campo.scalar
      return `map<${escalar(campo.mapKey)}, ${typeof valor === 'number' ? escalar(valor) : valor}>`
    }
    case 'list':
      base =
        campo.listKind === 'message'
          ? campo.message.typeName
          : campo.listKind === 'enum'
            ? campo.enum.typeName
            : escalar(campo.scalar)
      return `repeated ${base}`
    default:
      base = escalar(campo.scalar)
  }
  return base
}

const ESCALARES = {
  1: 'double', 2: 'float', 3: 'int64', 4: 'uint64', 5: 'int32', 6: 'fixed64', 7: 'fixed32', 8: 'bool',
  9: 'string', 12: 'bytes', 13: 'uint32', 15: 'sfixed32', 16: 'sfixed64', 17: 'sint32', 18: 'sint64',
}
function escalar(n) {
  return ESCALARES[n] ?? String(n)
}

/** Reglas protovalidate de un campo, como JSON compacto. */
export function reglas(registro, desc, nombreExtension) {
  const ext = registro.getExtension(nombreExtension)
  if (!ext || !hasOption(desc, ext)) return ''
  const valor = getOption(desc, ext)
  const json = toJson(ext.message, valor, { alwaysEmitImplicit: false })
  return JSON.stringify(json).replace(/\|/g, '\\|')
}

export function generarMarkdown(imagen) {
  const conjunto = fromBinary(FileDescriptorSetSchema, imagen)
  const registro = createFileRegistry(conjunto)
  const propios = []
  for (const archivo of registro.files) {
    if (archivo.proto.package.startsWith('actaflow.')) propios.push(archivo)
  }
  propios.sort((a, b) => a.name.localeCompare(b.name))

  const porPaquete = new Map()
  for (const archivo of propios) {
    const lista = porPaquete.get(archivo.proto.package) ?? []
    lista.push(archivo)
    porPaquete.set(archivo.proto.package, lista)
  }

  const servicios = propios.flatMap((f) => f.services)
  const rpcs = servicios.reduce((n, s) => n + s.methods.length, 0)
  const lineas = [
    '# ActaFlow API reference',
    '',
    '> Generated by `scripts/generate-docs.mjs` from the `.proto` contracts. Do not edit by hand.',
    '',
    `${porPaquete.size} packages, ${servicios.length} services, ${rpcs} RPCs.`,
    '',
    '## Contents',
    '',
  ]
  for (const paquete of porPaquete.keys()) {
    lineas.push(`- [\`${paquete}\`](#${paquete.replace(/\./g, '')})`)
  }

  for (const [paquete, archivos] of porPaquete) {
    lineas.push('', `## \`${paquete}\``, '')
    for (const archivo of archivos) {
      for (const servicio of archivo.services) {
        lineas.push(`### Service \`${servicio.name}\``, '', comentario(servicio), '')
        lineas.push('| RPC | Request | Response | Description |', '|---|---|---|---|')
        for (const m of servicio.methods) {
          const entrada = (m.methodKind === 'client_streaming' || m.methodKind === 'bidi_streaming' ? 'stream ' : '') + m.input.name
          const salida = (m.methodKind === 'server_streaming' || m.methodKind === 'bidi_streaming' ? 'stream ' : '') + m.output.name
          lineas.push(`| \`${m.name}\` | \`${entrada}\` | \`${salida}\` | ${resumen(comentario(m))} |`)
        }
        lineas.push('')
      }
    }
    for (const archivo of archivos) {
      for (const mensaje of todosLosMensajes(archivo.messages)) {
        lineas.push(`#### Message \`${mensaje.name}\``, '', comentario(mensaje) || '_No description._', '')
        if (mensaje.fields.length === 0) {
          lineas.push('_No fields._', '')
          continue
        }
        lineas.push('| # | Field | Type | Validation | Description |', '|---|---|---|---|---|')
        for (const campo of mensaje.fields) {
          const regla = reglas(registro, campo, 'buf.validate.field')
          const oneof = campo.oneof ? ` _(oneof \`${campo.oneof.name}\`)_` : ''
          lineas.push(
            `| ${campo.number} | \`${campo.name}\` | \`${nombreTipo(campo)}\` | ${regla ? `\`${regla}\`` : ''} | ${resumen(comentario(campo))}${oneof} |`,
          )
        }
        const reglaMensaje = reglas(registro, mensaje, 'buf.validate.message')
        if (reglaMensaje) lineas.push('', `Message rule: \`${reglaMensaje}\``)
        lineas.push('')
      }
      for (const enumeracion of todosLosEnums(archivo)) {
        lineas.push(`#### Enum \`${enumeracion.name}\``, '', comentario(enumeracion), '')
        lineas.push('| Value | Number | Description |', '|---|---|---|')
        for (const valor of enumeracion.values) {
          lineas.push(`| \`${valor.name}\` | ${valor.number} | ${resumen(comentario(valor))} |`)
        }
        lineas.push('')
      }
    }
  }
  return `${lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

function todosLosMensajes(mensajes) {
  return mensajes.flatMap((m) => [m, ...todosLosMensajes(m.nestedMessages)])
}

function todosLosEnums(archivo) {
  const anidados = todosLosMensajes(archivo.messages).flatMap((m) => m.nestedEnums)
  return [...archivo.enums, ...anidados]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const markdown = generarMarkdown(construirImagen())
  if (process.argv.includes('--check')) {
    const actual = readFileSync(SALIDA, 'utf8').replace(/\r\n/g, '\n')
    if (actual !== markdown) {
      console.error('docs/api-reference.md esta desactualizado. Ejecuta: npm run docs')
      process.exit(1)
    }
    console.log('docs/api-reference.md esta al dia')
  } else {
    writeFileSync(SALIDA, markdown)
    console.log(`Escrito ${SALIDA}`)
  }
}
