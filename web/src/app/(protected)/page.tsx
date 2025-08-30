"use client";

import { useState, useRef } from 'react';

export default function HomePage() {
	const [form, setForm] = useState({
		user: '',
		password: '',
		hostURL: 'https://www.elcaminoclub.com/',
		MEMBER_NAME: 'Scott Manwaring',
		TARGET_YEAR: new Date().getFullYear().toString(),
		DRY_RUN: '1',
		DEBUG: '0',
		GOLFERS: '["Scott Manwaring"]',
		EXECUTE_TIME: '',
		EARLIEST_TIME: '',
	});
	const [running, setRunning] = useState(false);
	const logRef = useRef<HTMLTextAreaElement>(null);

	async function handleRun(e: React.FormEvent) {
		e.preventDefault();
		setRunning(true);
		if (logRef.current) logRef.current.value = '';

		const res = await fetch('/api/run-bot', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form),
		});

		const reader = res.body?.getReader();
		const decoder = new TextDecoder();
		while (reader) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = decoder.decode(value);
			if (logRef.current) {
				logRef.current.value += chunk;
				logRef.current.scrollTop = logRef.current.scrollHeight;
			}
		}
		setRunning(false);
	}

	function onInput(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
		const { name, value } = e.target;
		setForm((f) => ({ ...f, [name]: value }));
	}

	return (
		<main className="mx-auto max-w-4xl p-6 space-y-6">
			<h1 className="text-2xl font-semibold">ElCamino Tee Bot</h1>
			<form onSubmit={handleRun} className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded border">
				<label className="flex flex-col gap-1">
					<span className="text-sm text-gray-600">User</span>
					<input name="user" className="input" value={form.user} onChange={onInput} required />
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-sm text-gray-600">Password</span>
					<input name="password" type="password" className="input" value={form.password} onChange={onInput} required />
				</label>
				<label className="flex flex-col gap-1 col-span-2">
					<span className="text-sm text-gray-600">Host URL</span>
					<input name="hostURL" className="input" value={form.hostURL} onChange={onInput} required />
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-sm text-gray-600">Member Name</span>
					<input name="MEMBER_NAME" className="input" value={form.MEMBER_NAME} onChange={onInput} />
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-sm text-gray-600">Target Year</span>
					<input name="TARGET_YEAR" className="input" value={form.TARGET_YEAR} onChange={onInput} required />
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-sm text-gray-600">Server Execute Time (HH:MM:SS AM/PM)</span>
					<input name="EXECUTE_TIME" className="input" value={form.EXECUTE_TIME} onChange={onInput} placeholder="7:00:00 PM" />
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-sm text-gray-600">Earliest Time (e.g. 6:45 AM)</span>
					<input name="EARLIEST_TIME" className="input" value={form.EARLIEST_TIME} onChange={onInput} placeholder="6:45 AM" />
				</label>
				<label className="flex flex-col gap-1 sm:col-span-2">
					<span className="text-sm text-gray-600">Golfers (JSON array)</span>
					<textarea name="GOLFERS" rows={2} className="input" value={form.GOLFERS} onChange={onInput} />
				</label>
				<div className="sm:col-span-2 flex gap-3">
					<button disabled={running} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60">{running ? 'Running…' : 'Run Bot'}</button>
				</div>
			</form>

			<div>
				<h2 className="font-medium mb-2">Logs</h2>
				<textarea ref={logRef} readOnly rows={16} className="w-full p-2 font-mono text-sm bg-black text-green-200 rounded" />
			</div>
		</main>
	);
}


