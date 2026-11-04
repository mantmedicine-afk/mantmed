# Reference copy of the helper code embedded in browser_automation scripts (scroll-lock regression, iteration 64)
STATE_JS = """() => ({y: window.scrollY, pos: document.body.style.position, top: document.body.style.top,
  ho: getComputedStyle(document.documentElement).overflow, bo: getComputedStyle(document.body).overflow, bw: document.body.clientWidth})"""
