export function nodeDatabaseUrl(connectionString: string): string {
  const query = connectionString.indexOf('?')
  if (query === -1) return connectionString
  const base = connectionString.slice(0, query)
  const params = connectionString
    .slice(query + 1)
    .split('&')
    .filter((param) => param !== 'sslrootcert=system')
  return params.length === 0 ? base : `${base}?${params.join('&')}`
}
