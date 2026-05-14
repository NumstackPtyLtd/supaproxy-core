export interface PluginMetadata {
  name: string
  description: string
  author: string
  version: string
  stage: string
  icon?: string
  configSchema: { fields: Array<{ name: string; label: string; type: string; required?: boolean; placeholder?: string; helpText?: string; options?: Array<{ value: string; label: string }>; defaultValue?: string | boolean | number }> }
}

export interface InstalledGuardrailData {
  id: string
  org_id: string
  plugin_id: string
  package_name: string
  package_version: string
  plugin_metadata: PluginMetadata
  installed_by: string
  installed_at?: string
}

export interface InstalledGuardrailRepository {
  findByOrg(orgId: string): Promise<InstalledGuardrailData[]>
  findByOrgAndPlugin(orgId: string, pluginId: string): Promise<InstalledGuardrailData | null>
  install(data: InstalledGuardrailData): Promise<void>
  uninstall(orgId: string, pluginId: string): Promise<void>
}
