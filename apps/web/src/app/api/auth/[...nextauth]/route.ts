import type { NextRequest } from 'next/server';
import { handlers } from '../../../../server/auth/nextauth';
import { withoutSessionCookie } from '../../../../server/auth/sign-in-request';

export const GET = (req: NextRequest) => handlers.GET(withoutSessionCookie(req));
export const POST = (req: NextRequest) => handlers.POST(withoutSessionCookie(req));
