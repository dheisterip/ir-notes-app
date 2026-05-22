import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC = ['/login', '/api/login']
const ADMIN_ONLY = ['/admin', '/api/admin']

export async function middleware(request) {
  const { pathname } = request.nextUrl
  if (PUBLIC.some(function(p) { return pathname.startsWith(p) })) return NextResponse.next()
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next()

  const token = request.cookies.get('ir_session')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    if (ADMIN_ONLY.some(function(p) { return pathname.startsWith(p) })) {
      if (payload.role !== 'admin') return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  } catch {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('ir_session')
    return res
  }
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
