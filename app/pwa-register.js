'use client'

import { useEffect } from 'react'

// 注册 Service Worker,使应用在支持的浏览器上可"添加到主屏幕"安装
export default function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 注册失败不影响正常使用,静默处理
      })
    }
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
