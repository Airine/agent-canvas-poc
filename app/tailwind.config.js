/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /* design.md §1 设计令牌映射 */
      colors: {
        canvas: {
          bg: "var(--canvas-bg)",
          grid: "var(--canvas-grid)",
        },
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          overlay: "var(--surface-overlay)",
        },
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary": "var(--text-tertiary)",
        accent: {
          DEFAULT: "var(--accent)",
          soft: "var(--accent-soft)",
          foreground: "hsl(var(--accent-foreground))",
        },
        st: {
          queued: "var(--st-queued)",
          running: "var(--st-running)",
          waiting: "var(--st-waiting)",
          completed: "var(--st-completed)",
          failed: "var(--st-failed)",
          skipped: "var(--st-skipped)",
        },
        nt: {
          coord: "var(--nt-coord)",
          artifact: "var(--nt-artifact)",
          operation: "var(--nt-operation)",
          chat: "var(--nt-chat)",
        },
        edge: {
          strong: "var(--edge-strong)",
          weak: "var(--edge-weak)",
          error: "var(--edge-error)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        node: "var(--r-node)",
        inner: "var(--r-inner)",
        pill: "var(--r-pill)",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        "node-title": ["13px", { lineHeight: "18px", fontWeight: "600" }],
        "node-meta": ["11px", { lineHeight: "14px", fontWeight: "400" }],
        body: ["13px", { lineHeight: "20px", fontWeight: "400" }],
        small: ["11px", { lineHeight: "16px", fontWeight: "400" }],
        mono: ["12px", { lineHeight: "17px", fontWeight: "400" }],
        "focus-title": ["16px", { lineHeight: "22px", fontWeight: "600" }],
        hero: ["40px", { lineHeight: "48px", fontWeight: "700", letterSpacing: "-0.02em" }],
        h2: ["22px", { lineHeight: "30px", fontWeight: "600" }],
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        node: "var(--shadow-node)",
        "node-selected": "var(--shadow-node-selected)",
        overlay: "var(--shadow-overlay)",
        failed: "var(--shadow-failed)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        med: "var(--dur-med)",
        focus: "var(--dur-focus)",
      },
      transitionTimingFunction: {
        "out-expo": "var(--ease-out)",
      },
      zIndex: {
        canvas: "var(--z-canvas)",
        edge: "var(--z-edge)",
        node: "var(--z-node)",
        "node-selected": "var(--z-node-selected)",
        "node-dragging": "var(--z-node-dragging)",
        legend: "var(--z-legend)",
        toast: "var(--z-toast)",
        "focus-overlay": "var(--z-focus-overlay)",
        approval: "var(--z-approval)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}