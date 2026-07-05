import type { Variants } from "framer-motion";

// Premium easing curves — inspired by linear.app, vercel.com design system
// ease-out-expo: fast start, smooth deceleration — feels "designed"
const EASE_OUT_EXPO = [0.22, 1, 0.36, 1] as const;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

// Entrance animations are kept short (≤300ms) and low-travel so sections never
// sit visibly blank for ~1s while scrolling; they read as a quick settle, not a
// slow reveal. Paired with viewportConfig below, which triggers slightly BEFORE
// the section is fully in view.
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_OUT_EXPO },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease: EASE_OUT_QUART },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.32, ease: EASE_OUT_EXPO },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: EASE_OUT_EXPO },
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: EASE_OUT_EXPO },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
};

export const staggerFast: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
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
  // Positive bottom margin triggers the animation slightly BEFORE the section is
  // fully in view, so content is already settled by the time the user reaches it
  // (the previous -80px fired late, leaving sections blank for ~1s).
  margin: "0px 0px 15% 0px",
};
