export const runtime = 'nodejs';

export async function POST() {
	const res = new Response('OK', { status: 200 });
	res.headers.append('Set-Cookie', `auth=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
	return res;
}
