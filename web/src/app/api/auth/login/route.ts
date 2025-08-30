import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
	const { username, password } = await req.json();
	if (username !== 'admin' || password !== 'admin') {
		return new Response('Invalid credentials', { status: 401 });
	}
	const res = new Response('OK', { status: 200 });
	res.headers.append('Set-Cookie', `auth=1; Path=/; HttpOnly; SameSite=Lax`);
	return res;
}
