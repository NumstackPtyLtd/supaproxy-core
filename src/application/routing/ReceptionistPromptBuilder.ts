import type { WorkspaceRoutingSummary } from '../../domain/workspace/repository.js'
import { buildReceptionistPrompt } from '../../prompts.js'

export class ReceptionistPromptBuilder {
  build(orgName: string, workspaces: WorkspaceRoutingSummary[], groundingLine = ''): string {
    return buildReceptionistPrompt(orgName, workspaces, groundingLine)
  }
}
