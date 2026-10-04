/**
 * MAW's intentionally restrained bone / blood-iron / ember identity.
 *
 * This colors only MAW-owned chrome; LLxprt's syntax highlighting, errors,
 * custom themes, and user-selected palettes stay under upstream control.
 */
import { Colors, SemanticColors } from '../colors.js';

export function getMawPalette(): {
  iron: string;
  bone: string;
  ember: string;
} {
  if (Colors.type === 'dark') {
    return { iron: '#BD6249', bone: '#DAC9B1', ember: '#E2A058' };
  }
  if (Colors.type === 'light') {
    return { iron: '#963D29', bone: '#53463D', ember: '#895022' };
  }
  // ANSI and user-provided themes: never impose a palette.
  return {
    iron: Colors.AccentRed,
    bone: SemanticColors.text.primary,
    ember: Colors.AccentYellow,
  };
}
