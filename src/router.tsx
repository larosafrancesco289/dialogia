import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { HomeClient } from '@/components/HomeClient';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  // Unknown paths are a dead end in a one-route SPA; send them home.
  notFoundComponent: () => {
    throw redirect({ to: '/' });
  },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeClient,
});

export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
