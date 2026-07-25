import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { TierProvider } from '@/lib/auth/tierContext';
import { HomeClient } from '@/components/HomeClient';
import { isHostedBuild } from '@/lib/env/public';
import { lazyClient } from '@/lib/ui/lazy';

const AccessPage = lazyClient(() =>
  import('@/components/AccessPage').then((mod) => ({ default: mod.AccessPage })),
);

const rootRoute = createRootRoute({
  component: () => (
    <TierProvider>
      <Outlet />
    </TierProvider>
  ),
  // Unknown paths are a dead end in a two-route SPA; send them home.
  notFoundComponent: () => {
    throw redirect({ to: '/' });
  },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeClient,
});

// The access gate exists only in the hosted build; the BYOK build has no gate
// to pass, so the route is dropped from the tree entirely.
const accessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/access',
  component: () => <AccessPage />,
});

const routeTree = rootRoute.addChildren(isHostedBuild() ? [indexRoute, accessRoute] : [indexRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
