import type { WorkspaceData } from './repository.js'
import { WorkspaceStatus } from './WorkspaceStatus.js'
import { InvalidTransitionError } from '../shared/errors.js'

export class Workspace {
  private _status: WorkspaceStatus

  private constructor(
    readonly id: string,
    readonly name: string,
    readonly isDefault: boolean,
    status: WorkspaceStatus,
  ) {
    this._status = status
  }

  static fromData(data: WorkspaceData): Workspace {
    return new Workspace(data.id, data.name, data.is_default, data.status)
  }

  get status(): WorkspaceStatus {
    return this._status
  }

  isActive(): boolean {
    return this._status === WorkspaceStatus.ACTIVE
  }

  canDelete(): boolean {
    return !this.isDefault
  }

  activate(): void {
    if (this._status === WorkspaceStatus.ACTIVE) return
    if (this._status === WorkspaceStatus.ARCHIVED) {
      throw new InvalidTransitionError(this._status, WorkspaceStatus.ACTIVE)
    }
    this._status = WorkspaceStatus.ACTIVE
  }

  pause(): void {
    if (this._status !== WorkspaceStatus.ACTIVE) {
      throw new InvalidTransitionError(this._status, WorkspaceStatus.PAUSED)
    }
    this._status = WorkspaceStatus.PAUSED
  }

  archive(): void {
    this._status = WorkspaceStatus.ARCHIVED
  }
}
