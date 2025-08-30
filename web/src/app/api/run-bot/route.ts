import { NextRequest } from 'next/server';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
	const body = await req.json().catch(() => ({} as Record<string, unknown>));

	// Web app root
	const webRoot = process.cwd();
	const runnerPath = path.join(webRoot, 'scripts', 'run-tee-bot.cjs');

	// Build a sanitized env
	const env = { ...process.env } as NodeJS.ProcessEnv;
	const setEnv = (k: string, v: unknown) => {
		if (v === undefined || v === null) return;
		env[k] = String(v);
	};
	setEnv('user', body['user']);
	setEnv('password', body['password']);
	setEnv('hostURL', body['hostURL']);
	setEnv('MEMBER_NAME', body['MEMBER_NAME']);
	setEnv('TARGET_YEAR', body['TARGET_YEAR']);
	setEnv('DRY_RUN', body['DRY_RUN'] ?? '1');
	setEnv('DEBUG', body['DEBUG'] ?? '0');
	setEnv('GOLFERS', body['GOLFERS']);
	setEnv('EXECUTE_TIME', body['EXECUTE_TIME']);
	setEnv('EARLIEST_TIME', body['EARLIEST_TIME']);
	// Optional: speed up ts-node
	env['TS_NODE_TRANSPILE_ONLY'] = env['TS_NODE_TRANSPILE_ONLY'] ?? '1';
	// Ensure ts-node reads the correct tsconfig
	env['TS_NODE_PROJECT'] = env['TS_NODE_PROJECT'] ?? path.join(webRoot, 'tsconfig.json');

	if (!fs.existsSync(runnerPath)) {
		const msg = `Runner not found at ${runnerPath}`;
		return new Response(msg, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
	}

	const nodeBin = process.execPath;
	const args = [runnerPath];

	const child = spawn(nodeBin, args, {
		cwd: webRoot,
		env,
		shell: false,
		stdio: 'pipe',
	}) as ChildProcessWithoutNullStreams;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const enc = new TextEncoder();
			const write = (data: Buffer) => controller.enqueue(enc.encode(data.toString()));
			child.stdout.on('data', write);
			child.stderr.on('data', write);
			child.on('close', (code) => {
				controller.enqueue(enc.encode(`\n[process exited with code ${code}]\n`));
				controller.close();
			});
			child.on('error', (err) => {
				controller.enqueue(enc.encode(`\n[spawn error] ${err.message}\n`));
				controller.close();
			});
		},
		cancel() {
			try { child.kill('SIGTERM'); } catch {}
			try { child.kill('SIGKILL'); } catch {}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}
