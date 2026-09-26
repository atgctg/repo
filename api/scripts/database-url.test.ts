import { expect, test } from 'bun:test'
import { nodeDatabaseUrl } from './database-url'

test('drops sslrootcert=system and keeps sslmode', () => {
  expect(
    nodeDatabaseUrl(
      'postgresql://user:p%40ss@host:5432/postgres?sslmode=verify-full&sslrootcert=system',
    ),
  ).toBe('postgresql://user:p%40ss@host:5432/postgres?sslmode=verify-full')
})

test('leaves a real root cert path alone', () => {
  const url =
    'postgresql://user:pw@host:5432/postgres?sslmode=verify-full&sslrootcert=/etc/ssl/cert.pem'
  expect(nodeDatabaseUrl(url)).toBe(url)
})

test('leaves a string with no query alone', () => {
  expect(nodeDatabaseUrl('postgresql://user:pw@host:5432/postgres')).toBe(
    'postgresql://user:pw@host:5432/postgres',
  )
})
