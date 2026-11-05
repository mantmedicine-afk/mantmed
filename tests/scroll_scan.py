# Helper snippet (pasted into browser_automation scripts): scans scrollable boxes and checks wheel scrolls box, not page
SCAN_JS = """() => {
  const out=[]; let i=0;
  document.querySelectorAll('*').forEach(n=>{
    if(!(n instanceof HTMLElement)) return;
    const cs=getComputedStyle(n);
    if(!/(auto|scroll)/.test(cs.overflowY)) return;
    if(n.scrollHeight<=n.clientHeight+1) return;
    if(n===document.documentElement||n===document.body) return;
    const r=n.getBoundingClientRect(); if(r.width<20||r.height<20) return;
    n.dataset.tscan=i;
    out.push({i, tid:n.dataset.testid||n.closest('[data-testid]')?.dataset.testid||'', cls:(n.className||'').toString().slice(0,60), sh:n.scrollHeight, ch:n.clientHeight, ob:cs.overscrollBehaviorY});
    i++;
  });
  return out;
}"""
