import { route, type RouteConfig } from '@react-router/dev/routes';

export const queryRoutes = [route('api/query', 'query/route.ts')] satisfies RouteConfig;
