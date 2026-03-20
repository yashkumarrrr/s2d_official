// app/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function RootPage() {
  const user = await getCurrentUser()
  if (user) redirect('/dashboard/aria')
  // Show landing page for non-logged-in users
  redirect('/home')
}
