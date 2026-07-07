// 极简 Service Worker:仅为满足 PWA 可安装条件(需注册 fetch 处理器)。
// 不做任何缓存,所有请求透传网络,避免部署后出现陈旧内容。
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {
  // 透传:不调用 respondWith,浏览器按默认方式走网络
})
