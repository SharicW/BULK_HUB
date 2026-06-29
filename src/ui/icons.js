const baseIcon = (paths) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    ${paths}
  </svg>
`;

export const globeIcon = baseIcon(`
  <circle cx="12" cy="12" r="10" />
  <path d="M2 12h20" />
  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
`);

export const usersIcon = baseIcon(`
  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
  <circle cx="9" cy="7" r="4" />
  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
`);

export const activityIcon = baseIcon(`
  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
`);

export const pieIcon = baseIcon(`
  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
  <path d="M22 12A10 10 0 0 0 12 2v10z" />
`);

export const userIcon = baseIcon(`
  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
  <circle cx="12" cy="7" r="4" />
`);

export const testnetIcon = baseIcon(`
  <rect x="4" y="4" width="16" height="16" rx="3" />
  <path d="M8 9h8" />
  <path d="M8 12.5h8" />
  <path d="M8 16h6" />
  <path d="M16 20h4v-4" />
  <path d="M16 20l4-4" />
`);

export const auraIcon = baseIcon(`
  <path d="M12 2 L13.5 8.5 L20 7 L15.5 12 L20 17 L13.5 15.5 L12 22 L10.5 15.5 L4 17 L8.5 12 L4 7 L10.5 8.5 Z" />
`);

