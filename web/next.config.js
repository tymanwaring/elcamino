/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	experimental: {
		swcMinify: true,
		// Ensure our serverless function bundles the runner script and needed modules
		outputFileTracingIncludes: {
			'/api/run-bot': ['./scripts/**', './node_modules/@sparticuz/chromium/**'],
		},
		serverComponentsExternalPackages: ['ts-node', 'typescript', 'playwright-core', '@sparticuz/chromium', 'dotenv'],
	},
};

module.exports = nextConfig;
