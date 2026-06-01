import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'bcryptjs', 'libphonenumber-geo-carrier'],
  // geo-carrier loads BSON metadata from its resources/ dir at runtime; make sure
  // the standalone output includes those files for the phone route.
  outputFileTracingIncludes: {
    '/api/tools/phone': ['./node_modules/libphonenumber-geo-carrier/resources/**/*'],
  },
  output: 'standalone',
}

export default nextConfig
