import { useEffect } from 'react';

export function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    const attach = () => {
      document.querySelectorAll('.reveal, .mask').forEach((n) => {
        const el = n as HTMLElement & { __revObs?: boolean };
        if (!el.__revObs) {
          el.__revObs = true;
          io.observe(el);
        }
      });
    };

    attach();
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
