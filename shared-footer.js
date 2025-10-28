// Shared footer injector
// - Injects a consistent footer with common links across pages
// - Usage: include in any page: <script src="./shared-footer.js"></script> or type="module"

const renderSharedFooter = () => {
  const links = [
    { href: './site-tree.html', text: '사이트 트리' },
    { href: './corp.html', text: '기업 개요' },
    { href: './dividend.html', text: '배당 추출' },
    { href: './help.html', text: '설명 페이지', newTab: true },
    { href: './README.md', text: 'README 보기', newTab: true },
    { href: 'https://github.com/mozilla/pdf.js', text: 'pdf.js', newTab: true, external: true },
    { href: './admin.html', text: '어드민' },
    { href: './dart.html', text: '공시 검색' },
    { href: './prices.html', text: '가격 조회' },
  ]

  const aTag = (l) => {
    const attrs = []
    if (l.newTab) attrs.push('target="_blank"', 'rel="noopener"')
    return `<a href="${l.href}" ${attrs.join(' ')}>${l.text}</a>`
  }

  const html = links.map(aTag).join('\n    <span> · </span>\n    ')

  let footer = document.querySelector('footer')
  if (!footer) {
    footer = document.createElement('footer')
    document.body.appendChild(footer)
  }
  footer.id = 'shared-footer'
  footer.innerHTML = `
    ${html}
  `
}

// Auto-run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderSharedFooter)
} else {
  renderSharedFooter()
}
