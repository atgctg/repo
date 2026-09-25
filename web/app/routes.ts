import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('evals', 'routes/eval.tsx'),
  route(':id/raw', 'routes/raw.tsx'),
  route(':id', 'routes/story.tsx'),
] satisfies RouteConfig
