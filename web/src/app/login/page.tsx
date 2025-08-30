"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		const res = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password }),
		});
		if (res.ok) {
			router.replace('/');
		} else {
			setError(await res.text());
		}
	}

	return (
		<main className="min-h-screen flex items-center justify-center p-6">
			<form onSubmit={onSubmit} className="w-full max-w-sm bg-white p-6 rounded border space-y-4">
				<h1 className="text-xl font-semibold">Login</h1>
				<label className="flex flex-col gap-1">
					<span className="text-sm text-gray-600">Username</span>
					<input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-sm text-gray-600">Password</span>
					<input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
				</label>
				{error && <p className="text-sm text-red-600">{error}</p>}
				<button className="w-full px-4 py-2 rounded bg-blue-600 text-white">Sign in</button>
			</form>
		</main>
	);
}
