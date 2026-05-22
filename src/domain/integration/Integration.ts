import type { IntegrationData } from './repository.js'
import { IntegrationStatus } from './IntegrationStatus.js'

export class Integration {
  private _status: IntegrationStatus

  private constructor(
    readonly id: string,
    readonly orgId: string,
    readonly type: string,
    status: IntegrationStatus,
  ) {
    this._status = status
  }

  static fromData(data: IntegrationData): Integration {
    return new Integration(data.id, data.org_id, data.type, data.status)
  }

  get status(): IntegrationStatus {
    return this._status
  }

  isActive(): boolean {
    return this._status === IntegrationStatus.ACTIVE
  }

  activate(): void {
    this._status = IntegrationStatus.ACTIVE
  }

  deactivate(): void {
    this._status = IntegrationStatus.INACTIVE
  }
}
