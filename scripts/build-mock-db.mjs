// Generates mock/db.json from the captured SVT responses in fixtures/.
// json-server serves a collection's items by id, so keying each response by
// its page number makes GET /api/100 resolve without a rewrite rules file.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = join(root, 'fixtures')
const outFile = join(root, 'mock', 'db.json')

const api = readdirSync(fixturesDir)
  .filter((name) => /^raw_\d{3}\.json$/.test(name))
  .sort()
  .map((name) => {
    const page = name.slice(4, 7)
    const body = JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'))
    return { id: page, ...body }
  })

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify({ api }, null, 2) + '\n')
console.log(`mock/db.json: ${api.length} pages (${api.map((p) => p.id).join(', ')})`)
