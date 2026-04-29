import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './useI18n';


function IconFB() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.7c0-.9.3-1.6 1.6-1.6h1.7V4.2c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4v2.7H7.7V14h2.7v8h3.1z"/>
    </svg>
  );
}
function IconYT() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.5 7.5c-.2-1-1-1.8-2-2C17.6 5 12 5 12 5s-5.6 0-7.5.5c-1 .2-1.8 1-2 2C2 9.4 2 12 2 12s0 2.6.5 4.5c.2 1 1 1.8 2 2 1.9.5 7.5.5 7.5.5s5.6 0 7.5-.5c1-.2 1.8-1 2-2 .5-1.9.5-4.5.5-4.5s0-2.6-.5-4.5zM10 15.5v-7l6 3.5-6 3.5z"/>
    </svg>
  );
}

export default function LandingFooter() {
  const { t, lang, setLang } = useI18n();
  return (
    <footer className="footer">
      <div className="container-wide">
        <div className="footer__grid">
          <div>
            <Link to="/" className="logo-link" aria-label="Addis Lidet home">
              <img src="/alic-logo.png" alt="" className="logo-img" aria-hidden="true" />
              <span className="logo-text">
                <span className="logo-text__1">Addis Lidet</span>
                <span className="logo-text__2">Int'l Church · Since 2008</span>
              </span>
            </Link>
            <p className="footer__tag">{t('footer.tag')}</p>
            <div className="footer__social">
              <a href="https://www.facebook.com/AddisLedet/" target="_blank" rel="noreferrer" aria-label="Facebook"><IconFB /></a>
              <a href="https://www.youtube.com/@addislidetmedia" target="_blank" rel="noreferrer" aria-label="YouTube — Silver Spring"><IconYT /></a>
              <a href="https://www.youtube.com/@AddisLidetVirginia" target="_blank" rel="noreferrer" aria-label="YouTube — Alexandria"><IconYT /></a>
              <a href="https://www.youtube.com/@addislidetyoungadultminist6291" target="_blank" rel="noreferrer" aria-label="YouTube — Young Adults"><IconYT /></a>
            </div>
          </div>

          <div>
            <h5>{t('footer.visit')}</h5>
            <ul>
              <li><Link to="/locations">Silver Spring, MD</Link></li>
              <li><Link to="/locations">Alexandria, VA</Link></li>
              <li><Link to="/locations">Service Times</Link></li>
              <li><Link to="/locations">Directions</Link></li>
            </ul>
          </div>

          <div>
            <h5>{t('footer.explore')}</h5>
            <ul>
              <li><Link to="/about">About</Link></li>
              <li><Link to="/ministries">Ministries</Link></li>
              <li><Link to="/connect">Get Connected</Link></li>
              <li><a href="https://sites.google.com/alicbibleschool.com/abs" target="_blank" rel="noreferrer">ALIC Bible School</a></li>
              <li><a href="https://addislidetchurch.org/alic-mission/" target="_blank" rel="noreferrer">ALIC Mission</a></li>
            </ul>
          </div>

          <div>
            <h5>{t('footer.contact')}</h5>
            <ul>
              <li><Link to="/connect">Contact Form</Link></li>
              <li><Link to="/connect">Prayer Request</Link></li>
              <li><Link to="/auth">Members Login</Link></li>
              <li><Link to="/give">Give Online</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <span>{t('footer.rights')}</span>
          <div className="lang-toggle" role="group" aria-label="Language">
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'am' ? 'active' : ''} onClick={() => setLang('am')}>አማ</button>
          </div>
          <span>{t('footer.sub') || 'Silver Spring, MD · Alexandria, VA'}</span>
        </div>
      </div>
    </footer>
  );
}
