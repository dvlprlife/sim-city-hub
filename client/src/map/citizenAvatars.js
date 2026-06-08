// Themed catalogue of selectable citizen avatars, drawn as little CSS isometric
// figures (see IsoPerson.jsx + `.iso-person` in App.css) — no image assets.
// Each entry is a colour scheme: shirt (the main body colour), optional skin
// override, optional hat. Persisted as the person's `icon` field (an existing
// manifest field, so no backend change). PersonEditor renders the picker;
// CityInterior renders the figure. Theme-confined.
export const citizenAvatars = [
  { key: 'aide', label: 'Aide', shirt: '#3b6fb0' },
  { key: 'mayor', label: 'Mayor', shirt: '#6a4fa0', hat: '#241b30' },
  { key: 'planner', label: 'Planner', shirt: '#c9a227' },
  { key: 'developer', label: 'Developer', shirt: '#2f9e6f', skin: '#c98a5a' },
  { key: 'tester', label: 'Tester', shirt: '#b0572f' },
  { key: 'inspector', label: 'Inspector', shirt: '#566072', hat: '#3a4250' },
  { key: 'police', label: 'Police', shirt: '#2a3a6a', hat: '#1d2747' },
  { key: 'builder', label: 'Builder', shirt: '#d8a72f', hat: '#f2c200' },
  { key: 'writer', label: 'Writer', shirt: '#8a5fb0', skin: '#7a5236' },
  { key: 'designer', label: 'Designer', shirt: '#c14b8a' },
  { key: 'researcher', label: 'Researcher', shirt: '#3a8a8a', skin: '#a06a3a' },
  { key: 'translator', label: 'Translator', shirt: '#4a8a3a' },
  { key: 'clerk', label: 'Clerk', shirt: '#6b7280' },
  { key: 'teacher', label: 'Teacher', shirt: '#9a5b34' },
  { key: 'doctor', label: 'Doctor', shirt: '#e6e9ec', hat: '#dfe3e6' },
  { key: 'chef', label: 'Chef', shirt: '#dfe3e6', hat: '#ffffff' },
];

export const DEFAULT_AVATAR = 'aide';

// Resolve a stored key to an avatar, falling back to the default so an unset /
// legacy `icon` value never breaks the render.
export function avatarFor(key) {
  return citizenAvatars.find((a) => a.key === key) || citizenAvatars[0];
}
