export type NavigationAction = 'POP' | 'PUSH' | 'REPLACE';

export function routeScrollTop(action: NavigationAction, savedPosition?: number) {
  return action === 'POP' ? savedPosition ?? 0 : 0;
}
