import type { ConversationData } from './repository.js'
import { ConversationStatus } from './ConversationStatus.js'
import { InvalidTransitionError } from '../shared/errors.js'

export { InvalidTransitionError }

export class Conversation {
  private _status: ConversationStatus

  private constructor(
    readonly id: string,
    readonly workspaceId: string,
    status: ConversationStatus,
  ) {
    this._status = status
  }

  static fromData(data: ConversationData): Conversation {
    return new Conversation(data.id, data.workspace_id, data.status)
  }

  get status(): ConversationStatus {
    return this._status
  }

  isActive(): boolean {
    return this._status === ConversationStatus.OPEN || this._status === ConversationStatus.COLD
  }

  isClosed(): boolean {
    return this._status === ConversationStatus.CLOSED
  }

  canReopen(): boolean {
    return this._status === ConversationStatus.COLD
  }

  reopenFromCold(): void {
    if (this._status !== ConversationStatus.COLD) {
      throw new InvalidTransitionError(this._status, ConversationStatus.OPEN)
    }
    this._status = ConversationStatus.OPEN
  }

  transitionToCold(): void {
    if (this._status !== ConversationStatus.OPEN) {
      throw new InvalidTransitionError(this._status, ConversationStatus.COLD)
    }
    this._status = ConversationStatus.COLD
  }

  close(): void {
    this._status = ConversationStatus.CLOSED
  }
}
