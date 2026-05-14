export type RoutingMode = 'receptionist' | 'direct'

export interface IntegrationData {
  id: string
  org_id: string
  type: string
  status: 'active' | 'inactive'
  created_at?: string
  updated_at?: string
}

export interface EntryPointData {
  id: string
  integration_id: string
  channel_id: string
  channel_name: string | null
  routing_mode: RoutingMode
  direct_workspace_id: string | null
  created_at?: string
}

export interface EntryPointWithIntegration extends EntryPointData {
  integration_type: string
  org_id: string
}

export interface IntegrationRepository {
  findByOrg(orgId: string): Promise<IntegrationData[]>
  findByOrgAndType(orgId: string, type: string): Promise<IntegrationData | null>
  create(data: IntegrationData): Promise<void>
  updateStatus(id: string, status: 'active' | 'inactive'): Promise<void>
  delete(id: string): Promise<void>
}

export interface EntryPointRepository {
  findByIntegration(integrationId: string): Promise<EntryPointData[]>
  findByChannel(type: string, channelId: string): Promise<EntryPointWithIntegration | null>
  findById(id: string): Promise<EntryPointData | null>
  create(data: EntryPointData): Promise<void>
  update(id: string, data: { channel_name?: string; routing_mode?: RoutingMode; direct_workspace_id?: string | null }): Promise<void>
  delete(id: string): Promise<void>
  findByOrg(orgId: string): Promise<Array<EntryPointData & { integration_type: string }>>
}
