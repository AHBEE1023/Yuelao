import './globals.css'
import PwaRegister from './pwa-register'
import { ZCOOL_XiaoWei, ZCOOL_KuaiLe, Noto_Sans_SC } from 'next/font/google'

// 构建期自托管字体(同域加载,无第三方请求):
// 小薇 = 标题与签诗;快乐体 = 手写签文;思源黑体 = 界面与规则
const xiaowei = ZCOOL_XiaoWei({ weight: '400', subsets: ['latin'], variable: '--font-xw', display: 'swap', preload: false })
const kuaile = ZCOOL_KuaiLe({ weight: '400', subsets: ['latin'], variable: '--font-kl', display: 'swap', preload: false })
const noto = Noto_Sans_SC({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-noto', display: 'swap', preload: false })

const SITE_URL = 'https://yuelao-sage.vercel.app'
const TITLE = '月老盲盒 · 求一支姻缘签'
const DESC = '写一支签,求一段缘分。签筒里都是真人手写的纸条:留下你自己,或请月老为你抽一支有缘人。请中才付,未请中自动退香火钱。'

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
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '月老盲盒 · 写一支签,求一段缘分' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESC,
    images: ['/og.png'],
  },
}

export const viewport = {
  themeColor: '#c3272b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className={`${xiaowei.variable} ${kuaile.variable} ${noto.variable}`}>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
