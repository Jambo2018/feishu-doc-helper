type MenuKind = 'export' | 'roam';
const containers = new Map<MenuKind, Promise<HTMLElement>>();
const isDocumentPage = () => /^\/(drive|wiki|docx|docs|sheets|base|slides|mindnotes?)\//.test(window.location.pathname);

/** Reuse the mounted React root when Feishu replaces its toolbar during navigation. */
export function createMenuContainer(kind: MenuKind): Promise<HTMLElement> {
  if (!containers.has(kind)) containers.set(kind, mount(kind).catch(error => {
    containers.delete(kind);
    throw error;
  }));
  return containers.get(kind)!;
}

async function mount(kind: MenuKind): Promise<HTMLElement> {
  if (!document.body) await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  const container = document.createElement('div');
  container.dataset.feishuHelper = kind;
  let placement: Element | 'floating' | undefined;
  function attach() {
    const target = document.querySelector('.new-notice-wrapper, .suite-notice-center');
    const besideTarget = target && (kind === 'export' ? target.nextElementSibling : target.previousElementSibling) === container;
    if (target && besideTarget && container.isConnected && placement === target) return;
    if (!target && !isDocumentPage()) {
      container.remove(); placement = undefined;
      return;
    }
    if (!target && container.parentElement === document.body && placement === 'floating') return;
    container.style.cssText = '';
    // Plasmo's absolute overlay needs its own containing block and layout slot.
    Object.assign(container.style, { position: 'relative', display: 'inline-flex', width: '32px', height: '32px', flex: '0 0 32px', margin: '0 2px', alignSelf: 'center' });
    if (target) {
      target.insertAdjacentElement(kind === 'export' ? 'afterend' : 'beforebegin', container);
      placement = target;
    } else {
      Object.assign(container.style, { position: 'fixed', right: '18px', bottom: kind === 'export' ? '90px' : '135px', zIndex: '2147483000', background: '#fff', border: '1px solid #d9d9d9', borderRadius: '8px', padding: '4px', margin: '0', boxShadow: '0 2px 10px #0002' });
      document.body.appendChild(container);
      placement = 'floating';
    }
  }
  attach();
  const observer = new MutationObserver(attach);
  observer.observe(document.body, { childList: true, subtree: true });
  return container;
}
