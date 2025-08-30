"use client";

import { usePathname } from 'next/navigation';

export default function HeaderClient() {
	const pathname = usePathname();
	async function logout() {
		try { await fetch('/api/auth/logout', { method: 'POST' }); location.assign('/login'); } catch {}
	}
	return (
		<header className="border-b bg-white">
			<div className="mx-auto max-w-5xl p-3 flex items-center justify-between">
				<div className="font-medium">ElCamino Tee Bot</div>
				{pathname !== '/login' && (
					<button onClick={logout} className="text-sm text-blue-600">Logout</button>
				)}
			</div>
		</header>
	);
}
