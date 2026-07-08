import './globals.css'
import PwaRegister from './pwa-register'

const SITE_URL = 'https://yuelao-sage.vercel.app'
const TITLE = '月老盲盒 · 一元遇见有缘人'
const DESC = '存一张纸条,抽一段缘分。线上版月老盲盒:留下你的联系方式,或从盒子里抽出一位有缘人。'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESC,
  manifest: '/manifest.webmanifest',
  applicationName: '月老盲盒',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '月老盲盒',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: SITE_URL,
    siteName: '月老盲盒',
    title: TITLE,
    description: DESC,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '月老盲盒 · 存一张纸条,抽一段缘分' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESC,
    images: ['/og.png'],
  },
}

export const viewport = {
  themeColor: '#8e2418',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
