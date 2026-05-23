import { NextResponse } from 'next/server'

const PUBLIC = ['/login', '/api/login']
const ADMIN_ONLY = ['/admin', '/api/admin']

export async function middleware(request) {
  const { pathname } = request.nextUrl
  if (PUBLIC.some(function(p) { return pathname.startsWith(p) })) return NextResponse.next()
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next()

  const token = request.cookies.get('ir_session')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))

  // For admin routes, check the token payload without full verification
  if (ADMIN_ONLY.some(function(p) { return pathname.startsWith(p) })) {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) throw new Error('Invalid token')
      const payload = JSON.parse(atob(parts[1]))
      if (payload.role !== 'admin') return NextResponse.redirect(new URL('/', request.url))
    } catch {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
