export const breakpoints = {
  mobile: 0,
  tablet: 640,
  desktop: 1024,
  wide: 1440,
} as const;

export const typeScale = {
  "display-sm": {
    fontSize: "32px",
    lineHeight: "40px",
    fontWeight: 700,
  },
  "heading-lg": {
    fontSize: "24px",
    lineHeight: "32px",
    fontWeight: 700,
  },
  "heading-md": {
    fontSize: "20px",
    lineHeight: "28px",
    fontWeight: 700,
  },
  "heading-sm": {
    fontSize: "18px",
    lineHeight: "26px",
    fontWeight: 600,
  },
  "body-md": {
    fontSize: "14px",
    lineHeight: "22px",
    fontWeight: 400,
  },
  "body-sm": {
    fontSize: "13px",
    lineHeight: "20px",
    fontWeight: 400,
  },
  caption: {
    fontSize: "12px",
    lineHeight: "18px",
    fontWeight: 500,
  },
} as const;

export const buttonSizes = {
  sm: {
    height: "32px",
    paddingInline: "12px",
    fontSize: "12px",
  },
  md: {
    height: "40px",
    paddingInline: "16px",
    fontSize: "14px",
  },
  lg: {
    height: "48px",
    paddingInline: "20px",
    fontSize: "15px",
  },
} as const;

export const modalSizes = {
  sm: "400px",
  md: "560px",
  lg: "720px",
  xl: "960px",
} as const;

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
  8: "32px",
  10: "40px",
} as const;

export type BreakpointName = keyof typeof breakpoints;
export type TypeScaleName = keyof typeof typeScale;
export type ButtonSize = keyof typeof buttonSizes;
export type ModalSize = keyof typeof modalSizes;
export type SpacingToken = keyof typeof spacing;
