export interface OrgData {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface UserData {
  id: string
  org_id: string | null
  email: string
  name: string
  password_hash: string
  org_role: 'admin' | 'workspace_admin' | 'user'
  created_at: string
}

export interface OrgSettingData {
  id: string
  key_name: string
  value: string
  is_secret: boolean
}

export interface TeamData {
  id: string
  name: string
}

export interface OrganisationRepository {
  findById(id: string): Promise<OrgData | null>
  create(id: string, name: string, slug: string): Promise<void>
  updateName(id: string, name: string): Promise<void>

  findUserByEmail(email: string): Promise<UserData | null>
  findUserById(id: string): Promise<UserData | null>
  userExistsByEmail(email: string): Promise<boolean>
  createUser(id: string, orgId: string, email: string, name: string, passwordHash: string, role: string): Promise<void>
  listUsers(orgId: string): Promise<Array<{ id: string; name: string; email: string; org_role: string; created_at: string }>>

  listSettings(orgId: string): Promise<OrgSettingData[]>
  findSetting(orgId: string, key: string): Promise<OrgSettingData | null>
  upsertSetting(id: string, orgId: string, key: string, value: string, isSecret: boolean): Promise<void>
  getSettingValue(key: string): Promise<string | null>
  getSettingValues(keys: string[]): Promise<Record<string, string>>

  listTeams(orgId: string): Promise<TeamData[]>
  findTeamByName(orgId: string, name: string): Promise<TeamData | null>
  createTeam(id: string, orgId: string, name: string): Promise<void>

  getFirstOrgId(): Promise<string | null>
}
