export interface ModelData {
  id: string
  label: string
  is_default: boolean
  provider?: string
}

export interface ModelRepository {
  listByProvider(provider: string): Promise<ModelData[]>
  listAll(): Promise<ModelData[]>
}
