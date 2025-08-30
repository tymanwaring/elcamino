/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	experimental: {
		swcMinify: true,
		// Ensure our serverless function bundles the runner script and needed modules
		outputFileTracingIncludes: {
			'/api/run-bot': ['./scripts/**'],
		},
		serverComponentsExternalPackages: ['ts-node', 'typescript', 'playwright', 'dotenv'],
	},
};

module.exports = nextConfig;
