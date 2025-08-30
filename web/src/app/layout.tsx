export const metadata = {
	title: 'ElCamino Tee Bot',
	description: 'UI to run the ElCamino tee time bot',
};

import './globals.css';
import HeaderClient from '@/components/HeaderClient';

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body className="min-h-screen bg-gray-50 text-gray-900">
				<HeaderClient />
				{children}
			</body>
		</html>
	);
}
