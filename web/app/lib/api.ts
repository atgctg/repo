import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterContractClient } from '@orpc/contract'
import { createFrameClient } from 'shared'
import type { Contract } from 'shared/contract'

export const api: RouterContractClient<Contract> = createORPCClient(
  new RPCLink({ url: '/api' }),
)

export const frames = createFrameClient({ url: '/api' })

export async function found<T>(call: Promise<T>): Promise<T | undefined> {
  try {
    return await call
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'NOT_FOUND') return undefined
    throw error
  }
}
