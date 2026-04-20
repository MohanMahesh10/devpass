import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiGet, apiPost } from '../api';
import { useToast } from '../components/Toast';
import { LinkedInIcon, GitHubIcon } from '../components/Icons';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

const initialForm = {
  name: '',
  email: '',
  phone: '',
  company: '',
  role: 'developer',
  linkedinUrl: '',
  githubUrl: '',
  whyAttend: ''
};

export default function Register() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [event, setEvent] = useState({ name: 'DevPass' });

  useEffect(() => {
    apiGet('/api/event').then(setEvent).catch(() => {});
  }, []);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: '' }));
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Please enter your name';
    if (!form.email.trim()) e.email = 'Please enter your email';
    else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email';
    if (form.linkedinUrl && !URL_RE.test(form.linkedinUrl.trim())) e.linkedinUrl = 'Enter a valid URL (https://…)';
    if (form.githubUrl && !URL_RE.test(form.githubUrl.trim())) e.githubUrl = 'Enter a valid URL (https://…)';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await apiPost('/api/register', form);
      navigate('/confirmed', { replace: true });
    } catch (err) {
      if (err.data && err.data.fields) {
        setErrors(err.data.fields);
        toast.error('Please fix the highlighted fields');
      } else {
        toast.error(err.message || 'Something went wrong');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-narrow">
      <header style={{ marginBottom: 22 }}>
        <div className="section-title">Register</div>
        <h1 style={{ marginBottom: 6 }}>Join {event.name || 'the event'}</h1>
        <p className="muted" style={{ fontSize: 13 }}>
          Register. Get approved. Show your pass.
        </p>
      </header>

      <form className="card card-pad-lg" onSubmit={onSubmit} noValidate>
        {/* Section 1 */}
        <div className="section-title">Personal info</div>
        <div className="form-grid">
          <div>
            <label htmlFor="name">Full name *</label>
            <input
              id="name" name="name" type="text" autoComplete="name"
              value={form.name} onChange={onChange}
              className={errors.name ? 'invalid' : ''}
              placeholder="Ada Lovelace"
            />
            {errors.name && <div className="input-error">{errors.name}</div>}
          </div>

          <div>
            <label htmlFor="email">Email address *</label>
            <input
              id="email" name="email" type="email" autoComplete="email"
              value={form.email} onChange={onChange}
              className={errors.email ? 'invalid' : ''}
              placeholder="you@domain.com"
            />
            {errors.email && <div className="input-error">{errors.email}</div>}
          </div>

          <div>
            <label htmlFor="phone">Phone number</label>
            <input
              id="phone" name="phone" type="tel" autoComplete="tel"
              value={form.phone} onChange={onChange}
              placeholder="Optional"
            />
          </div>

          <div>
            <label htmlFor="company">Company / organisation</label>
            <input
              id="company" name="company" type="text" autoComplete="organization"
              value={form.company} onChange={onChange}
              placeholder="Optional"
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="role">Role</label>
            <select id="role" name="role" value={form.role} onChange={onChange}>
              <option value="developer">Developer</option>
              <option value="designer">Designer</option>
              <option value="student">Student</option>
              <option value="devops">DevOps</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <hr className="section-divider" />

        {/* Section 2 */}
        <div className="section-title">Social profiles</div>
        <div className="form-grid">
          <div>
            <label htmlFor="linkedinUrl">LinkedIn URL</label>
            <div className="input-with-icon">
              <span className="input-icon"><LinkedInIcon /></span>
              <input
                id="linkedinUrl" name="linkedinUrl" type="url" inputMode="url"
                value={form.linkedinUrl} onChange={onChange}
                className={errors.linkedinUrl ? 'invalid' : ''}
                placeholder="linkedin.com/in/yourprofile"
              />
            </div>
            {errors.linkedinUrl && <div className="input-error">{errors.linkedinUrl}</div>}
          </div>

          <div>
            <label htmlFor="githubUrl">GitHub URL</label>
            <div className="input-with-icon">
              <span className="input-icon"><GitHubIcon /></span>
              <input
                id="githubUrl" name="githubUrl" type="url" inputMode="url"
                value={form.githubUrl} onChange={onChange}
                className={errors.githubUrl ? 'invalid' : ''}
                placeholder="github.com/yourusername"
              />
            </div>
            {errors.githubUrl && <div className="input-error">{errors.githubUrl}</div>}
          </div>
        </div>
        <p className="hint">Help the community know you better.</p>

        <hr className="section-divider" />

        {/* Section 3 */}
        <div className="section-title">Tell us about yourself</div>
        <div>
          <label htmlFor="whyAttend">Why do you want to attend?</label>
          <textarea
            id="whyAttend" name="whyAttend" rows={4}
            value={form.whyAttend} onChange={onChange}
            placeholder="A few sentences about what you're hoping to take away."
          />
        </div>

        <div style={{ marginTop: 22 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <><span className="spinner" /> Submitting…</> : 'Request my pass →'}
          </button>
          <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
            We'll email you once reviewed.
          </p>
        </div>
      </form>
    </main>
  );
}
