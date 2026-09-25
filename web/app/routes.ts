import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('evals', 'routes/eval.tsx'),
  route(':id', 'routes/story.tsx', [
    index('routes/scenes.tsx'),
    route('cards', 'routes/cards.tsx'),
    route('raw', 'routes/raw.tsx'),
  ]),
] satisfies RouteConfig
