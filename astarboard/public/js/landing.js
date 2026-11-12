// If the visitor is already signed in, point the landing page links at their dashboard.
fetch('/api/me', { credentials: 'same-origin' })
  .then((r) => r.json())
  .then(({ user }) => {
    if (!user) return;
    document.querySelectorAll('[data-auth="signin"], [data-auth="signin2"]').forEach((a) => {
      a.textContent = 'Go to my dashboard';
      a.href = '/app#/';
    });
    document.querySelectorAll('[data-auth="cta"], [data-auth="cta2"], [data-auth="cta3"]').forEach((a) => {
      a.textContent = 'Open my issue';
      a.href = '/app#/';
    });
  })
  .catch(() => {});
