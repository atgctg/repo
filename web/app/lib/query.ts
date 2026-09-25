import { QueryClient, queryOptions } from '@tanstack/react-query'
import { fetchEvalRuns } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  },
})

export const worldsKey = ['worlds'] as const
export const storiesKey = ['stories'] as const
export const evalsKey = ['evals'] as const
export const worldKey = (id: string) => ['world', id] as const
export const storyKey = (id: string) => ['story', id] as const

export function evalsQuery() {
  return queryOptions({
    queryKey: evalsKey,
    queryFn: fetchEvalRuns,
  })
}
