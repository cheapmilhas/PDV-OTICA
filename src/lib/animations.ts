import type { Variants } from "framer-motion";

// Premium easing curves — inspired by linear.app, vercel.com design system
// ease-out-expo: fast start, smooth deceleration — feels "designed"
const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: EASE_OUT_EXPO },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: EASE_OUT_QUART },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_OUT_EXPO },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -32 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: EASE_OUT_EXPO },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 32 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: EASE_OUT_EXPO },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.08,
    },
  },
};

export const staggerFast: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.04,
    },
  },
};

export const cardHover = {
  initial: {},
  hover: {
    y: -6,
    transition: { duration: 0.28, ease: EASE_OUT_QUART },
  },
};

export const buttonHover = {
  initial: {},
  hover: { scale: 1.03 },
  tap: { scale: 0.97 },
};

export const viewportConfig = {
  once: true,
  margin: "-80px",
};
