/**
 * MAW chrome uses one readable monster palette at a time. The working text,
 * syntax colors, and custom LLxprt themes remain independent of this accent.
 *
 * This colors only MAW-owned chrome; LLxprt's syntax highlighting, errors,
 * custom themes, and user-selected palettes stay under upstream control.
 */
import { Colors, SemanticColors } from '../colors.js';

export function getMawPalette(): {
  iron: string;
  bone: string;
  ember: string;
  spectral: string;
  style: string;
} {
  const style = process.env['MAW_STYLE']?.toLowerCase();
  if (Colors.type === 'dark') {
    switch (style) {
      case 'volt':
        return {
          iron: '#FF6C70',
          bone: '#F5E7D7',
          ember: '#FFD266',
          spectral: '#61DCEB',
          style: 'VOLT',
        };
      case 'grave':
        return {
          iron: '#D25A68',
          bone: '#DCC9BC',
          ember: '#E7AA73',
          spectral: '#A89CCF',
          style: 'GRAVE',
        };
      case 'mythic':
        return {
          iron: '#CF75BB',
          bone: '#F2DFC6',
          ember: '#EFC778',
          spectral: '#85D2B5',
          style: 'MYTHIC',
        };
      default:
        return {
          iron: '#E46A58',
          bone: '#F1DFC9',
          ember: '#F3BB66',
          spectral: '#9A9EF4',
          style: 'MONARCH',
        };
    }
  }
  if (Colors.type === 'light') {
    return {
      iron: '#963D29',
      bone: '#53463D',
      ember: '#895022',
      spectral: '#514C9D',
      style: style?.toUpperCase() ?? 'MONARCH',
    };
  }
  // ANSI and user-provided themes: never impose a palette.
  return {
    iron: Colors.AccentRed,
    bone: SemanticColors.text.primary,
    ember: Colors.AccentYellow,
    spectral: SemanticColors.text.accent,
    style: style?.toUpperCase() ?? 'MONARCH',
  };
}
