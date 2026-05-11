# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Please email **numstackdev@gmail.com** with:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for resolution.

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Security practices

- All secrets are required env vars with no defaults; the server won't start without them
- JWT secrets must be at least 32 characters
- Passwords are hashed with bcrypt
- API input is validated with Zod schemas
- Cookies use `secure: true` in production
