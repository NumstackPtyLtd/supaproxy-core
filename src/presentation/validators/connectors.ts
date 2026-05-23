import { z } from 'zod'
import { MAX_MCP_URL_LENGTH, MAX_MCP_COMMAND_LENGTH, MAX_MCP_ARGS_COUNT, MAX_MCP_HEADER_LENGTH } from '../../defaults.js'

export const mcpTestSchema = z.object({ transport: z.enum(['http', 'stdio']).optional(), url: z.string().url().max(MAX_MCP_URL_LENGTH).optional(), command: z.string().max(MAX_MCP_COMMAND_LENGTH).optional(), headers: z.record(z.string().max(MAX_MCP_HEADER_LENGTH)).optional() })
export const mcpSaveSchema = z.object({ workspace_id: z.string().min(1).max(255), name: z.string().min(1).max(255), transport: z.enum(['http', 'stdio']).optional(), url: z.string().url().max(MAX_MCP_URL_LENGTH).optional(), command: z.string().max(MAX_MCP_COMMAND_LENGTH).optional(), args: z.array(z.string().max(MAX_MCP_COMMAND_LENGTH)).max(MAX_MCP_ARGS_COUNT).optional(), headers: z.record(z.string().max(MAX_MCP_HEADER_LENGTH)).optional(), env: z.record(z.string().max(MAX_MCP_HEADER_LENGTH)).optional() })
export const consumerChannelSchema = z.object({ type: z.string().min(1), workspace_id: z.string().min(1).max(255), channel_id: z.string().min(1).max(100), channel_name: z.string().max(255).optional() })
export const consumerConnectSchema = z.object({ type: z.string().min(1), workspace_id: z.string().min(1).max(255), credentials: z.record(z.string().max(500)), channel_id: z.string().max(100).optional() })
