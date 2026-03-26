// Paleta CutGo — dorado sobre negro
export const colors = {
  black:      '#0d0d0d',
  dark:       '#1a1a1a',
  mid:        '#2e2e2e',
  gold:       '#c9a84c',
  goldLight:  '#e8d48a',
  goldFaint:  'rgba(201,168,76,0.12)',
  white:      '#fafaf8',
  cream:      '#f5f3ee',
  lightGray:  '#e8e6e0',
  gray:       '#888',
  green:      '#27ae60',
  greenFaint: 'rgba(39,174,96,0.12)',
  red:        '#c0392b',
  redFaint:   'rgba(192,57,43,0.12)',
  blue:       '#2471a3',
  overlay:    'rgba(0,0,0,0.55)',
};

export const fonts = {
  // Expo usa las fuentes del sistema; en producción carga Syne + DM Sans con expo-font
  heading:  { fontFamily: 'System', fontWeight: '800' },
  subhead:  { fontFamily: 'System', fontWeight: '700' },
  body:     { fontFamily: 'System', fontWeight: '400' },
  bodyMed:  { fontFamily: 'System', fontWeight: '500' },
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
};

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 24, full: 999,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 8,
  },
};
