// app/dashboard/layout.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  // Just pass children through — each page controls its own full-viewport layout
  return <>{children}</>
}
