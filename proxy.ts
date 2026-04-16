import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get('session')?.value
  const role = request.cookies.get('role')?.value

  // Allow public paths + static files
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith('/_next')) {
    // If already logged in and visiting auth pages, redirect to their dashboard
    if (session && (pathname === '/login' || pathname === '/signup')) {
      const dest = role === 'admin' ? '/admin/dashboard' : '/employee/chat'
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return NextResponse.next()
  }

  // Root redirect
  if (pathname === '/') {
    if (!session) return NextResponse.redirect(new URL('/login', request.url))
    const dest = role === 'admin' ? '/admin/dashboard' : '/employee/chat'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Protected routes — no session → login
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Role-based protection — only block if role is explicitly the wrong one
  // (avoids infinite loop when role cookie is missing/empty)
  if (pathname.startsWith('/admin') && role === 'employee') {
    return NextResponse.redirect(new URL('/employee/chat', request.url))
  }
  if (pathname.startsWith('/employee') && role === 'admin') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
