import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
	const auth = cookies().get('auth')?.value;
	if (auth !== '1') {
		redirect('/login');
	}
	return children;
}


