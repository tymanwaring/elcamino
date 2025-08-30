/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	experimental: {
		swcMinify: true,
		// Ensure our serverless function bundles the runner script and needed modules
		outputFileTracingIncludes: {
			'/api/run-bot': [
				'./scripts/**',
				'./node_modules/@sparticuz/chromium/**',
				'./node_modules/playwright-core/**',
				'./node_modules/follow-redirects/**',
				'./node_modules/tar-fs/**',
				'./node_modules/dotenv/**',
			],
		},
		serverComponentsExternalPackages: ['ts-node', 'typescript', 'playwright-core', '@sparticuz/chromium', 'dotenv'],
	},
};

module.exports = nextConfig;
