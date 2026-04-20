const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

const ALLOWED_ROLES = ['developer', 'designer', 'student', 'devops', 'other'];

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateRegistration(body = {}) {
  const errors = {};
  const data = {
    name: str(body.name),
    email: str(body.email).toLowerCase(),
    phone: str(body.phone),
    company: str(body.company),
    role: str(body.role).toLowerCase(),
    linkedinUrl: str(body.linkedinUrl),
    githubUrl: str(body.githubUrl),
    whyAttend: str(body.whyAttend)
  };

  if (!data.name) errors.name = 'Name is required';
  else if (data.name.length > 120) errors.name = 'Name is too long';

  if (!data.email) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(data.email)) errors.email = 'Invalid email';

  if (data.phone && data.phone.length > 40) errors.phone = 'Phone is too long';
  if (data.company && data.company.length > 120) errors.company = 'Company is too long';

  if (data.role && !ALLOWED_ROLES.includes(data.role)) errors.role = 'Invalid role';

  if (data.linkedinUrl && !URL_RE.test(data.linkedinUrl)) errors.linkedinUrl = 'Invalid URL';
  if (data.githubUrl && !URL_RE.test(data.githubUrl)) errors.githubUrl = 'Invalid URL';

  if (data.whyAttend && data.whyAttend.length > 2000) errors.whyAttend = 'Too long (max 2000 chars)';

  return { data, errors, valid: Object.keys(errors).length === 0 };
}

module.exports = { validateRegistration, ALLOWED_ROLES, EMAIL_RE, URL_RE };
