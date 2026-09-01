import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('http://127.0.0.1:3100'),
  title: 'AOZU — 電獺全生活伴生宇宙',
  description: '讓虛擬角色陪你計步、健身、飲控、記帳與旅行，一起完成、一起成長。',
  icons: { icon: '/assets/aotter-logo-red.svg' },
  openGraph: {
    title: 'AOZU — 電獺全生活伴生宇宙',
    description: '讓虛擬角色陪你計步、健身、飲控、記帳與旅行，一起完成、一起成長。',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'AOZU — 一起完成，一起成長' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AOZU — 電獺全生活伴生宇宙',
    description: '讓虛擬角色陪你計步、健身、飲控、記帳與旅行，一起完成、一起成長。',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f5f1e9',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
