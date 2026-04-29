import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from './useI18n';

export default function LandingNav() {
  const { t } = useI18n();
  const [solid, setSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  const links = [
    { key: 'home',      label: t('nav.home'),      to: '/' },
    { key: 'about',     label: t('nav.about'),     to: '/about' },
    { key: 'locations', label: t('nav.locations'), to: '/locations' },
    { key: 'ministries', label: t('nav.ministries'), to: '/ministries' },
    { key: 'connect',   label: t('nav.connect'),   to: '/connect' },
  ];

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <nav className={`nav${solid ? ' nav--solid' : ''}${menuOpen ? ' nav--open' : ''}`}>
        <div className="container-wide nav__inner">
          <Link to="/" className="logo-link" aria-label="Addis Lidet home">
            <img src="/alic-logo.png" alt="" className="logo-img" aria-hidden="true" />
            <span className="logo-text">
              <span className="logo-text__1">Addis Lidet</span>
              <span className="logo-text__2">Int'l Church · Since 2008</span>
            </span>
          </Link>

          <div className="nav__links">
            {links.map(l => (
              <Link key={l.key} to={l.to} className={isActive(l.to) ? 'active' : ''}>
                {l.label}
              </Link>
            ))}
          </div>

          <div className="nav__right">
            <Link to="/give" className="btn btn--gold btn--sm">{t('cta.give')}</Link>
            <Link to="/auth" className="btn btn--gold btn--sm nav__login">Log in</Link>
            <button
              className={`nav__burger${menuOpen ? ' is-open' : ''}`}
              onClick={toggleMenu}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <span className="nav__burger-line" />
              <span className="nav__burger-line" />
              <span className="nav__burger-line" />
            </button>
          </div>
        </div>

        {/* Mobile menu overlay */}
        <div className={`nav__mobile${menuOpen ? ' is-open' : ''}`}>
          <div className="nav__mobile-links">
            {links.map(l => (
              <Link key={l.key} to={l.to} className={`nav__mobile-link${isActive(l.to) ? ' active' : ''}`}>
                {l.label}
              </Link>
            ))}
            <Link to="/give" className="nav__mobile-link">{t('cta.give')}</Link>
            <Link to="/auth" className="nav__mobile-link">Log in</Link>
          </div>
        </div>
      </nav>
    </>
  );
}
