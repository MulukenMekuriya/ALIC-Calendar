import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from './useI18n';

export default function LandingNav() {
  const { t } = useI18n();
  const [solid, setSolid] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { key: 'home',      label: t('nav.home'),      to: '/' },
    { key: 'about',     label: t('nav.about'),     to: '/about' },
    { key: 'locations', label: t('nav.locations'), to: '/locations' },
    { key: 'sermons',   label: t('nav.sermons'),   to: '/sermons' },
    { key: 'connect',   label: t('nav.connect'),   to: '/connect' },
  ];

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  return (
    <nav className={`nav${solid ? ' nav--solid' : ''}`}>
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
          <Link to="/auth" className="btn btn--ghost btn--sm">Log in</Link>
          <Link to="/give" className="btn btn--gold btn--sm">{t('cta.give')}</Link>
        </div>
      </div>
    </nav>
  );
}
