export const ROOMS = [
  { id: 'general', label: 'General', blurb: 'Open conversation' },
  { id: 'tech-support', label: 'Tech Support', blurb: 'Questions and fixes' },
];

export const roomLabel = (id) => ROOMS.find((r) => r.id === id)?.label ?? id;

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 20;
export const MESSAGE_MAX = 500;
