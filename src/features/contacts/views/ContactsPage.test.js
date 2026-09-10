import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./ContactsPage.vue', import.meta.url), 'utf8')

test('renders and associates the relationship dialog title', () => {
  assert.match(
    source,
    /role="dialog"[^>]*aria-labelledby="contacts-relationship-title"/,
  )
  assert.match(
    source,
    /<h2 id="contacts-relationship-title" class="contacts-relationship-sheet__title">Elige el parentesco del contacto<\/h2>/,
  )
  assert.doesNotMatch(
    source,
    /<h2[^>]*contacts-relationship-sheet__title[^>]*aria-hidden/,
  )
})
