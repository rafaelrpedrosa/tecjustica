export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Erro ao ler arquivo'))
    reader.readAsText(file, 'utf-8')
  })
}

function splitCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }
    current += char
  }

  values.push(current)
  return values.map(value => value.trim())
}

export function parseCsv(text: string): Record<string, string>[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line)
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header.trim()] = cols[index] ?? ''
      return acc
    }, {})
  })
}

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function normalizeBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined
  const normalized = normalizeHeader(value)
  if (['1', 'sim', 'true', 'yes', 'y'].includes(normalized)) return true
  if (['0', 'nao', 'false', 'no', 'n'].includes(normalized)) return false
  return undefined
}
