import { NextResponse } from 'next/server';
import { saveLocale } from '../../../server/actions/locale';
import { isMarketingPath } from '../_data/routes';

/**
 * The marketing header's language form: saves the choice like the app's switcher (cookie, and
 * the account when signed in) and sends the browser back to the page it came from.
 */
export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== 'null' && new URL(origin).host !== req.headers.get('host')) {
    return new NextResponse(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const form = await req.formData();
  await saveLocale(String(form.get('locale') ?? ''));
  const next = String(form.get('next') ?? '/');
  return new NextResponse(null, {
    status: 303,
    headers: { Location: isMarketingPath(next) ? next : '/', 'Cache-Control': 'no-store' },
  });
}
