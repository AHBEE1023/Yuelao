import './globals.css'

export const metadata = {
  title: '月老盲盒 · 一元遇见有缘人',
  description: '存一张纸条,抽一段缘分。线上版月老盲盒:留下你的联系方式,或从盒子里抽出一位有缘人。',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
