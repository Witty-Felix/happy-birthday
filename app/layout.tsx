import type { Metadata } from "next";
import "./globals.css";

// 字体按线上产物逐字复刻：线上 vinext 1.3.0 在此处未走构建期自托管分支，
// 而是输出 2 个 fonts.googleapis.com 的 <link> + 4 条极简规则，
// 且 font-family 不带 'Geist Fallback' 与 font-weight。
const FONT_CLASS = "__variable_geist_0u8s7r6 __variable_geist_mono_0fdimb7";

const FONT_LINKS = [
  "https://fonts.googleapis.com/css2?family=Geist&display=swap",
  "https://fonts.googleapis.com/css2?family=Geist+Mono&display=swap",
];

const FONT_CSS = [
  ".__font_geist_0u8s7r6 { font-family: 'Geist'; font-style: normal; }",
  "",
  ".__variable_geist_0u8s7r6 { --font-geist-sans: 'Geist'; }",
  "",
  ".__font_geist_mono_0fdimb7 { font-family: 'Geist Mono'; font-style: normal; }",
  "",
  ".__variable_geist_mono_0fdimb7 { --font-geist-mono: 'Geist Mono'; }",
  "",
].join("\n");

export const metadata: Metadata = {
  title: "令旺，生日快乐｜3D 粒子蛋糕",
  description: "拖动旋转粒子蛋糕，吹灭蜡烛，为令旺点亮生日烟花。",
  openGraph: {
    title: "令旺，生日快乐｜3D 粒子蛋糕",
    description: "吹灭蛋糕蜡烛，点亮属于令旺的生日烟花。",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 905,
        alt: "令旺的粒子生日蛋糕",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "令旺，生日快乐｜3D 粒子蛋糕",
    description: "吹灭蛋糕蜡烛，点亮属于令旺的生日烟花。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        {/*
          与线上一致：字体样式表以同步 <link> 出现在 SSR HTML 里。
          React 19 会额外补两条 rel=preload as=style，线上没有，用前置内联脚本摘掉。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var r=document.querySelectorAll('link[rel="preload"][as="style"]');for(var i=0;i<r.length;i++)r[i].parentNode.removeChild(r[i])})()`,
          }}
        />
        {FONT_LINKS.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
      </head>
      <body className={FONT_CLASS}>{children}</body>
    </html>
  );
}
