"use client";

import { useState, useRef } from 'react';

export default function HomePage() {
	const [form, setForm] = useState({
		user: 'UnderPar',
		password: '',
		hostURL: 'https://www.elcaminoclub.com/',
		MEMBER_NAME: 'Scott Manwaring',
		TARGET_YEAR: new Date().getFullYear().toString(),
		DRY_RUN: '0',
		DEBUG: '0',
		GOLFERS: '["Scott Manwaring", "Leslie Manwaring"]',
		EXECUTE_TIME: '7:00:00 PM',
		EARLIEST_TIME: '',
	});
	const [running, setRunning] = useState(false);
	const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
	const logRef = useRef<HTMLTextAreaElement>(null);

	async function handleRun(e: React.FormEvent) {
		e.preventDefault();
		setRunning(true);
		if (logRef.current) logRef.current.value = '';
		const controller = new AbortController();
		setAbortCtrl(controller);

		const res = await fetch('/api/run-bot', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form),
			signal: controller.signal,
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
		setAbortCtrl(null);
	}

	function handleKill() {
		if (abortCtrl) {
			abortCtrl.abort();
			if (logRef.current) {
				logRef.current.value += "\n[kill] Aborting execution...\n";
				logRef.current.scrollTop = logRef.current.scrollHeight;
			}
			setRunning(false);
			setAbortCtrl(null);
		}
	}

	function onInput(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
		const { name, value } = e.target;
		setForm((f) => ({ ...f, [name]: value }));
	}

	return (
		<main className="mx-auto max-w-xl md:max-w-4xl p-4 md:p-6 space-y-4 md:space-y-6">
		<h1 className="text-xl md:text-2xl font-semibold">ElCamino Tee Bot</h1>
  
		<form
		  onSubmit={handleRun}
		  className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 bg-white p-3 md:p-4 rounded-lg border shadow-sm"
		>
		  <label className="flex flex-col gap-1">
			<span className="text-sm text-gray-600">User</span>
			<input
			  name="user"
			  className="input h-11 px-3 text-base md:text-sm"
			  value={form.user}
			  onChange={onInput}
			  autoComplete="username"
			  required
			/>
		  </label>
  
		  <label className="flex flex-col gap-1">
			<span className="text-sm text-gray-600">Password</span>
			<input
			  name="password"
			  type="password"
			  className="input h-11 px-3 text-base md:text-sm"
			  value={form.password}
			  onChange={onInput}
			  autoComplete="current-password"
			  required
			/>
		  </label>
  
		  <label className="flex flex-col gap-1 md:col-span-2">
			<span className="text-sm text-gray-600">Host URL</span>
			<input
			  name="hostURL"
			  className="input h-11 px-3 text-base md:text-sm"
			  value={form.hostURL}
			  onChange={onInput}
			  inputMode="url"
			  required
			/>
		  </label>
  
		  <label className="flex flex-col gap-1">
			<span className="text-sm text-gray-600">Member Name</span>
			<input
			  name="MEMBER_NAME"
			  className="input h-11 px-3 text-base md:text-sm"
			  value={form.MEMBER_NAME}
			  onChange={onInput}
			/>
		  </label>
  
		  <label className="flex flex-col gap-1">
			<span className="text-sm text-gray-600">Target Year</span>
			<input
			  name="TARGET_YEAR"
			  className="input h-11 px-3 text-base md:text-sm"
			  value={form.TARGET_YEAR}
			  onChange={onInput}
			  inputMode="numeric"
			  pattern="\d{4}"
			  required
			/>
		  </label>
  
		  <label className="flex flex-col gap-1">
			<span className="text-sm text-gray-600">
			  Server Execute Time (HH:MM:SS AM/PM)
			</span>
			<input
			  name="EXECUTE_TIME"
			  className="input h-11 px-3 text-base md:text-sm"
			  value={form.EXECUTE_TIME}
			  onChange={onInput}
			  placeholder="7:00:00 PM"
			/>
		  </label>
  
		  <label className="flex flex-col gap-1">
			<span className="text-sm text-gray-600">
			  Earliest Time (e.g. 6:45 AM)
			</span>
			<input
			  name="EARLIEST_TIME"
			  className="input h-11 px-3 text-base md:text-sm"
			  value={form.EARLIEST_TIME}
			  onChange={onInput}
			  placeholder="6:45 AM"
			/>
		  </label>
  
		  <label className="flex flex-col gap-1 md:col-span-2">
			<span className="text-sm text-gray-600">
			  Golfers (JSON array up to 4 golfers)
			</span>
			<textarea
			  name="GOLFERS"
			  rows={4}
			  className="input px-3 py-2 text-base md:text-sm resize-y"
			  value={form.GOLFERS}
			  onChange={onInput}
			/>
		  </label>
  
		  <div className="md:col-span-2 flex flex-col md:flex-row gap-3">
			<button
			  disabled={running}
			  className="w-full md:w-auto px-4 py-3 md:py-2 rounded bg-blue-600 text-white disabled:opacity-60"
			>
			  {running ? "Running…" : "Run Bot"}
			</button>
			<button
			  type="button"
			  onClick={handleKill}
			  disabled={!running}
			  className="w-full md:w-auto px-4 py-3 md:py-2 rounded bg-red-600 text-white disabled:opacity-60"
			>
			  Kill Execution
			</button>
		  </div>
		</form>
  
		{/* Logs always visible */}
		<div className="bg-black rounded-lg p-3 md:p-4">
		  <h2 className="font-medium text-white mb-2">Logs</h2>
		  <textarea
			ref={logRef}
			readOnly
			className="w-full p-2 font-mono text-sm bg-black text-green-200 rounded resize-none leading-relaxed overflow-y-auto"
		  />
		</div>
	  </main>

	);
}


