import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Loads a response captured live from the SVT API. Tests read these rather
 * than hand-written payloads so they stay anchored to the real wire format.
 */
export function rawFixture(pageNumber: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'fixtures', `raw_${pageNumber}.json`), 'utf8'))
}

export const FIXTURE_PAGES = ['100', '104', '105', '200', '331', '377'] as const
