import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;
	if (
		pathname.startsWith('/_next') ||
		pathname.startsWith('/api/auth') ||
		pathname.startsWith('/favicon') ||
		pathname === '/login'
	) {
		return NextResponse.next();
	}
	const auth = req.cookies.get('auth')?.value;
	if (auth !== '1') {
		const url = req.nextUrl.clone();
		url.pathname = '/login';
		return NextResponse.redirect(url);
	}
	return NextResponse.next();
}

export const config = {
	matcher: ['/(.*)'],
};
