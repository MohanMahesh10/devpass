import React from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to="/register" className="brand" aria-label="DevPass home">
          <span className="brand-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="#0F0F0F" />
              <rect x="10" y="1" width="5" height="5" rx="1" fill="#0F0F0F" />
              <rect x="1" y="10" width="5" height="5" rx="1" fill="#0F0F0F" />
            </svg>
          </span>
          <span className="brand-word">
            Dev<span className="accent">Pass</span>
          </span>
        </Link>

        <span className="nav-badge">Developer Events</span>
      </div>
    </nav>
  );
}
