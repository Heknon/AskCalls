import type { AppRoute } from '@askcalls/ui/components/AppSidebar';

/** Where each navigation destination lives. */
export const APP_HREFS: Record<AppRoute, string> = {
  calls: '/app',
  upload: '/app/upload',
  tags: '/app/tags',
  contacts: '/app/contacts',
  settings: '/app/settings',
  admin: '/admin/instance',
};

/** The navigation item a path belongs to (the call view belongs to Calls). */
export function routeOf(pathname: string): AppRoute {
  if (pathname.startsWith('/admin')) return 'admin';
  const seg = pathname.split('/')[2];
  switch (seg) {
    case 'upload':
    case 'tags':
    case 'contacts':
    case 'settings':
      return seg;
    default:
      return 'calls';
  }
}
