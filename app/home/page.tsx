// app/home/page.tsx
// Serves the landing page. Route: /home
// The homepage.html is also directly accessible as a static file.
export default function HomePage() {
  return (
    <iframe
      src="/homepage.html"
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Step2Dev Landing Page"
    />
  )
}
