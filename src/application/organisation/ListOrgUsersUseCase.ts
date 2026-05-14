import type { OrganisationRepository } from '../../domain/organisation/repository.js'

export interface ListUsersParams {
  search?: string
  limit?: number
  offset?: number
}

export class ListOrgUsersUseCase {
  constructor(private readonly orgRepo: OrganisationRepository) {}

  async execute(orgId: string, params?: ListUsersParams) {
    return this.orgRepo.listUsers(orgId, params || {})
  }
}
