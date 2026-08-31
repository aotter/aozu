import { parseStarterPackage, validateLoadedStarterPackage, type ValidatedStarterPackage } from '../../core/domain/starter.ts'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const readJson = async (response: Response, label: string): Promise<unknown> => {
  if (!response.ok) throw new Error(`${label} could not be loaded`)
  try {
    return await response.json()
  } catch {
    throw new Error(`Invalid ${label}`)
  }
}

export async function loadStarterCatalog(
  fetcher: Fetch,
  inspectCharacter: Parameters<typeof validateLoadedStarterPackage>[1],
  inspectScene: Parameters<typeof validateLoadedStarterPackage>[2],
  backboneVersion: string,
  catalogUrl = '/starters/index.json',
): Promise<ValidatedStarterPackage[]> {
  const catalogResponse = await fetcher(catalogUrl)
  const value = await readJson(catalogResponse, 'Starter catalog')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Starter catalog')
  const catalog = value as Record<string, unknown>
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.packages) || !catalog.packages.length) throw new Error('Unsupported Starter catalog')
  const paths = catalog.packages.map((path) => {
    if (typeof path !== 'string' || !path || path.includes('\\')) throw new Error('Invalid Starter catalog path')
    return path
  })
  if (new Set(paths).size !== paths.length) throw new Error('Duplicate Starter catalog path')

  const catalogBase = catalogResponse.url || new URL(catalogUrl, globalThis.location?.href ?? 'http://localhost/').href
  const packages = await Promise.all(paths.map(async (path) => {
    const manifestUrl = new URL(path, catalogBase)
    if (manifestUrl.origin !== new URL(catalogBase).origin) throw new Error('Starter package must be same-origin')
    const response = await fetcher(manifestUrl)
    const starter = parseStarterPackage(await readJson(response, 'Starter package'))
    const base = response.url || manifestUrl.href
    const assets = await Promise.all(starter.assetFiles.map(async (file) => {
      const assetUrl = new URL(file.path, base)
      if (assetUrl.origin !== manifestUrl.origin) throw new Error('Starter asset must be same-origin')
      const assetResponse = await fetcher(assetUrl)
      if (!assetResponse.ok) throw new Error(`Starter asset could not be loaded: ${file.blobId}`)
      return { id: file.blobId, blob: new Blob([await assetResponse.arrayBuffer()], { type: file.mediaType }) }
    }))
    return validateLoadedStarterPackage({ starter, assets }, inspectCharacter, inspectScene, backboneVersion)
  }))
  const identities = packages.map(({ starter }) => `${starter.id}@${starter.version}`)
  if (new Set(identities).size !== identities.length) throw new Error('Duplicate Starter package identity')
  return packages
}
