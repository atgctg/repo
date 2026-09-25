import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('evals/:id', 'routes/eval.tsx'),
  route(':id', 'routes/story.tsx'),
] satisfies RouteConfig
